/**
 * push.ts — wangchuan push command
 *
 * Push-only operation: stage local changes to repo and push to remote.
 *
 * 1. Process pending distributions and deletions (if interactive)
 * 2. stageToRepo (local → repo)
 * 3. Detect stale files (local deleted = repo stale = prune)
 * 4. commitAndPush
 * 5. Report results
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
import { copyDirSync }    from '../utils/fs.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { PushOptions, StageResult, CommitResult, FilterOptions } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

const WANGCHUAN_DIR  = path.join(os.homedir(), '.wangchuan');
const SNAPSHOTS_DIR  = path.join(WANGCHUAN_DIR, 'snapshots');
const MAX_AUTO_SNAPSHOTS = 5;

/** Create an auto-snapshot before push (silent, no user output) */
function autoSnapshot(repoPath: string): void {
  try {
    if (!fs.existsSync(repoPath)) return;
    const snapshotName = `auto-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const snapshotDir  = path.join(SNAPSHOTS_DIR, snapshotName);
    fs.mkdirSync(snapshotDir, { recursive: true });
    copyDirSync(repoPath, snapshotDir);
    pruneAutoSnapshots(MAX_AUTO_SNAPSHOTS);
  } catch {
    // Silent failure — snapshot is a safety net, not a blocker
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

export async function cmdPush({ agent, dryRun, only, exclude, yes, skipStaleDetection }: PushOptions = {}): Promise<CommitResult & { readonly stageResult?: StageResult | undefined }> {
  logger.banner(t('push.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const hostname = cfg.hostname || os.hostname();
  if (agent) logger.info(t('sync.filterAgent', { agent: chalk.cyan(agent) }));
  if (only?.length)    logger.info(t('filter.only', { patterns: only.join(', ') }));
  if (exclude?.length) logger.info(t('filter.exclude', { patterns: exclude.join(', ') }));
  if (dryRun) logger.info(chalk.yellow(t('dryRun.enabled')));

  const filter: FilterOptions | undefined = (only?.length || exclude?.length) ? { only, exclude } : undefined;

  // Process pending distributions (requires user decision)
  if (process.stdin.isTTY) {
    const { processPendingDistributions } = await import('../core/sync.js');
    await processPendingDistributions(cfg);
  }

  // Process pending deletions from previous non-interactive sync
  if (process.stdin.isTTY || yes) {
    const { loadPendingDeletions, clearPendingDeletions } = await import('../core/sync.js');
    const pending = loadPendingDeletions();
    if (pending.length > 0) {
      logger.warn(t('sync.pendingDeletions', { count: pending.length }));
      for (const f of pending) logger.warn(`  ${t('sync.pruneCandidate', { file: f })}`);

      let answer = 'y';
      if (!yes) {
        const rl = await import('readline');
        const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
        answer = await new Promise<string>(resolve => {
          iface.question(t('sync.confirmDelete'), (ans: string) => { iface.close(); resolve(ans.trim().toLowerCase()); });
        });
      }

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

  // Auto-snapshot before push (silent safety net)
  autoSnapshot(repoPath);

  // Acquire sync lock
  await syncLock.acquire(repoPath);
  try {
    const result = await runPush(cfg, repoPath, hostname, agent, dryRun, filter, yes, skipStaleDetection);

    // Check for pending distributions after push
    if (process.stdin.isTTY) {
      const { processPendingDistributions } = await import('../core/sync.js');
      await processPendingDistributions(cfg);
    }

    return result;
  } finally {
    syncLock.release();
  }
}

async function runPush(
  cfg: import('../types.js').WangchuanConfig,
  repoPath: string,
  hostname: string,
  agent: import('../types.js').AgentName | string | undefined,
  dryRun: boolean | undefined,
  filter: FilterOptions | undefined,
  yes: boolean | undefined,
  skipStaleDetection: boolean | undefined,
): Promise<CommitResult & { readonly stageResult?: StageResult | undefined }> {
  // 1. Stage local → repo
  let spinner = ora(t('sync.staging')).start();
  let stageResult: StageResult;
  try {
    stageResult = await syncEngine.stageToRepo(cfg, agent, filter, yes, false, skipStaleDetection);
    spinner.succeed(t('sync.staged', { count: stageResult.synced.length }) +
      (stageResult.unchanged.length > 0 ? ' ' + t('push.unchangedSummary', { count: stageResult.unchanged.length }) : ''));
  } catch (err) {
    spinner.fail(t('sync.stagingFailed'));
    throw new Error(t('sync.stagingFailedDetail', { error: (err as Error).message }));
  }

  let pushResult: CommitResult & { readonly stageResult?: StageResult } =
    { committed: false, pushed: false };

  if (stageResult.synced.length > 0 || stageResult.deleted.length > 0) {
    // Dry-run: print summary and skip commit/push
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
    }
  } else {
    logger.info(t('sync.noChanges'));
  }

  // Summary
  console.log();
  if (pushResult.committed && pushResult.stageResult) {
    logger.ok(t('sync.summaryPush', {
      count: pushResult.stageResult.synced.length,
      sha: pushResult.sha ?? '-',
    }));
  } else if (!pushResult.committed && !dryRun) {
    logger.ok(t('sync.alreadyInSync'));
  }

  // Record sync history
  if (pushResult.committed && pushResult.stageResult) {
    appendSyncEvent({
      timestamp:   new Date().toISOString(),
      action:      'push',
      environment: cfg.environment ?? 'default',
      agent,
      fileCount:   pushResult.stageResult.synced.length,
      encrypted:   pushResult.stageResult.encrypted.length,
      sha:         pushResult.sha,
      hostname,
    });

    await fireWebhooks(cfg, 'push', buildWebhookPayload(
      cfg, 'push', pushResult.stageResult.synced.length, pushResult.sha,
    ));

    runHooks('postPush', cfg);
  }

  return pushResult;
}
