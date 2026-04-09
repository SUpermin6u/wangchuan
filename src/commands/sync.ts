/**
 * sync.ts — wangchuan sync command (bidirectional smart sync)
 *
 * 1. Fetch remote to check for new commits
 * 2. If remote is ahead, pull first
 * 3. Then push local changes
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { config }          from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { syncLock }        from '../core/sync-lock.js';
import { appendSyncEvent } from '../core/sync-history.js';
import { fireWebhooks, buildWebhookPayload } from '../core/webhook.js';
import { runHooks } from '../core/hooks.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { SyncOptions, RestoreResult, StageResult, CommitResult, FilterOptions } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

const WANGCHUAN_DIR  = path.join(os.homedir(), '.wangchuan');
const SNAPSHOTS_DIR  = path.join(WANGCHUAN_DIR, 'snapshots');
const MAX_AUTO_SNAPSHOTS = 5;

/** Create an auto-snapshot before sync (silent, no user output) */
function autoSnapshot(repoPath: string): void {
  try {
    if (!fs.existsSync(repoPath)) return;
    const snapshotName = `auto-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const snapshotDir  = path.join(SNAPSHOTS_DIR, snapshotName);
    fs.mkdirSync(snapshotDir, { recursive: true });
    copyDirSync(repoPath, snapshotDir);
    // Prune old auto-snapshots
    pruneAutoSnapshots(MAX_AUTO_SNAPSHOTS);
  } catch {
    // Silent failure — snapshot is a safety net, not a blocker
  }
}

function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function pruneAutoSnapshots(max: number): void {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return;
  const autoDirs = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(d => d.startsWith('auto-') && fs.statSync(path.join(SNAPSHOTS_DIR, d)).isDirectory())
    .sort();
  if (autoDirs.length <= max) return;
  const toRemove = autoDirs.slice(0, autoDirs.length - max);
  for (const dir of toRemove) {
    fs.rmSync(path.join(SNAPSHOTS_DIR, dir), { recursive: true, force: true });
  }
}

export interface SyncCommandResult {
  readonly pulled: boolean;
  readonly pullResult?: RestoreResult | undefined;
  readonly pushed: boolean;
  readonly pushResult?: (CommitResult & { readonly stageResult?: StageResult | undefined }) | undefined;
}

export async function cmdSync({ agent, dryRun, only, exclude }: SyncOptions = {}): Promise<SyncCommandResult> {
  logger.banner(t('sync.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const hostname = cfg.hostname || os.hostname();
  if (agent) logger.info(t('sync.filterAgent', { agent: chalk.cyan(agent) }));
  if (only?.length)    logger.info(t('filter.only', { patterns: only.join(', ') }));
  if (exclude?.length) logger.info(t('filter.exclude', { patterns: exclude.join(', ') }));
  if (dryRun) logger.info(chalk.yellow(t('dryRun.enabled')));

  const filter = (only?.length || exclude?.length) ? { only, exclude } : undefined;

  // ── Check for pending distributions from previous sync (requires user decision) ──
    if (process.stdin.isTTY) {
      const { processPendingDistributions } = await import('../core/sync.js');
      await processPendingDistributions(cfg);
    }

    // ── Check for pending deletions from previous non-interactive sync ──
  if (process.stdin.isTTY) {
    const { loadPendingDeletions, clearPendingDeletions } = await import('../core/sync.js');
    const pending = loadPendingDeletions();
    if (pending.length > 0) {
      logger.warn(t('sync.pendingDeletions', { count: pending.length }));
      for (const f of pending) logger.warn(`  ${t('sync.pruneCandidate', { file: f })}`);

      const rl = await import('readline');
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => {
        iface.question(t('sync.confirmDelete'), (ans: string) => { iface.close(); resolve(ans.trim().toLowerCase()); });
      });

      if (answer === 'y' || answer === 'yes' || answer === '') {
        const { deleteStaleFiles } = await import('../core/sync.js');
        deleteStaleFiles(repoPath, pending);
        logger.ok(t('sync.deletionConfirmed', { count: pending.length }));
      } else {
        logger.info(t('sync.deletionSkipped'));
      }
      clearPendingDeletions();
    }
  }

  // ── Auto-snapshot before sync (silent safety net) ────────────
  autoSnapshot(repoPath);

  // ── Acquire sync lock ─────────────────────────────────────────
  await syncLock.acquire(repoPath);
  try {
    const result = await runSync(cfg, repoPath, hostname, agent, dryRun, filter);

    // ── Check for pending distributions after push (requires user decision) ──
    if (process.stdin.isTTY) {
      const { processPendingDistributions } = await import('../core/sync.js');
      await processPendingDistributions(cfg);
    }

    return result;
  } finally {
    syncLock.release();
  }
}

async function runSync(
  cfg: import('../types.js').WangchuanConfig,
  repoPath: string,
  hostname: string,
  agent: import('../types.js').AgentName | undefined,
  dryRun: boolean | undefined,
  filter: FilterOptions | undefined,
): Promise<SyncCommandResult> {
  let spinner = ora(t('sync.fetching')).start();
  let remoteAhead = 0;
  try {
    remoteAhead = await gitEngine.fetchAndCheckRemoteAhead(repoPath, resolveGitBranch(cfg));
    if (remoteAhead > 0) {
      spinner.succeed(t('sync.remoteAhead', { count: remoteAhead }));
    } else {
      spinner.succeed(t('sync.remoteUpToDate'));
    }
  } catch (err) {
    spinner.fail(t('sync.fetchFailed'));
    throw new Error(t('sync.fetchFailedDetail', { error: (err as Error).message }));
  }

  // ── 2. Pull if remote has new commits ───────────────────────
  let pulled = false;
  let pullResult: RestoreResult | undefined;
  if (remoteAhead > 0) {
    spinner = ora(t('sync.pulling')).start();
    try {
      await gitEngine.pull(repoPath, resolveGitBranch(cfg));
      spinner.succeed(t('sync.pulled'));
    } catch (err) {
      spinner.fail(t('sync.pullFailed'));
      throw new Error(t('sync.pullFailedDetail', { error: (err as Error).message }));
    }

    try {
      pullResult = await syncEngine.restoreFromRepo(cfg, agent, filter);
      pulled = true;
      if (pullResult.synced.length > 0) {
        logger.ok(t('sync.pullSummary', {
          count: pullResult.synced.length,
          encrypted: pullResult.decrypted.length,
        }));
      }
      if (pullResult.skippedAgents.length > 0) {
        logger.info(t('sync.skippedAgents', {
          agents: pullResult.skippedAgents.join(', '),
        }));
      }
    } catch (err) {
      throw new Error(t('sync.restoreFailed', { error: (err as Error).message }));
    }
  }

  // ── 3. Push local changes ──────────────────────────────────
  spinner = ora(t('sync.staging')).start();
  let stageResult: StageResult;
  try {
    stageResult = await syncEngine.stageToRepo(cfg, agent, filter);
    spinner.succeed(t('sync.staged', { count: stageResult.synced.length }) +
      (stageResult.unchanged.length > 0 ? ' ' + t('push.unchangedSummary', { count: stageResult.unchanged.length }) : ''));
  } catch (err) {
    spinner.fail(t('sync.stagingFailed'));
    throw new Error(t('sync.stagingFailedDetail', { error: (err as Error).message }));
  }

  let pushResult: CommitResult & { readonly stageResult?: StageResult } =
    { committed: false, pushed: false };

  if (stageResult.synced.length > 0 || stageResult.deleted.length > 0) {
    // ── Dry-run: print summary and skip commit/push ─────────────
    if (dryRun) {
      console.log();
      for (const f of stageResult.synced) {
        logger.ok(`  ${chalk.green(f)}`);
      }
      for (const f of stageResult.deleted) {
        logger.info(`  ${chalk.red('✕ ' + f)}`);
      }
      logger.ok('\n' + t('dryRun.wouldSync', {
        count: stageResult.synced.length,
        encrypted: stageResult.encrypted.length,
      }));
      if (stageResult.deleted.length > 0) {
        logger.ok(t('dryRun.wouldPrune', { count: stageResult.deleted.length }));
      }
      logger.ok(t('dryRun.wouldCommit', { repo: cfg.repo }));
      pushResult = { committed: false, pushed: false, stageResult };
    } else {
    const agentTag = agent ? `[${agent}]` : '';
    const msg = t('sync.commitMsg', { tag: agentTag, host: hostname });

    spinner = ora(t('sync.pushing')).start();
    try {
      const gitResult = await gitEngine.commitAndPush(repoPath, msg, resolveGitBranch(cfg));
      if (gitResult.committed) {
        spinner.succeed(t('sync.pushed', { repo: cfg.repo }));
      } else {
        spinner.info(t('sync.nothingToCommit'));
      }
      pushResult = { ...gitResult, stageResult };
    } catch (err) {
      spinner.fail(t('sync.pushFailed'));
      try { await gitEngine.rollback(repoPath); } catch (re) {
        logger.error(t('sync.rollbackFailed', { error: (re as Error).message }));
      }
      throw new Error(t('sync.pushFailedDetail', { error: (err as Error).message }));
    }
    } // end else (non-dry-run)
  } else {
    logger.info(t('sync.noChanges'));
  }

  // ── 4. Summary ─────────────────────────────────────────────
  console.log();
  if (pulled && pullResult) {
    logger.ok(t('sync.summaryPull', { count: pullResult.synced.length }));
  }
  if (pushResult.committed && pushResult.stageResult) {
    logger.ok(t('sync.summaryPush', {
      count: pushResult.stageResult.synced.length,
      sha: pushResult.sha ?? '-',
    }));
  }
  if (!pulled && !pushResult.committed) {
    logger.ok(t('sync.alreadyInSync'));
  }

  // Record sync history
  const totalFiles = (pullResult?.synced.length ?? 0) + (pushResult.stageResult?.synced.length ?? 0);
  const totalEncrypted = (pullResult?.decrypted.length ?? 0) + (pushResult.stageResult?.encrypted.length ?? 0);
  if (pulled || pushResult.committed) {
    appendSyncEvent({
      timestamp:   new Date().toISOString(),
      action:      'sync',
      environment: cfg.environment ?? 'default',
      agent:       agent,
      fileCount:   totalFiles,
      encrypted:   totalEncrypted,
      sha:         pushResult.sha,
      hostname,
    });

    // Fire webhooks (fire-and-forget)
    await fireWebhooks(cfg, 'sync', buildWebhookPayload(
      cfg, 'sync', totalFiles, pushResult.sha,
    ));

    // Run post-sync hooks
    runHooks('postSync', cfg);
  }

  return { pulled, pullResult, pushed: pushResult.committed, pushResult };
}
