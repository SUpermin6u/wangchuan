/**
 * sync.ts — wangchuan sync command (bidirectional smart sync)
 *
 * 1. Fetch remote to check for new commits
 * 2. If remote is ahead, pull first
 * 3. Then push local changes
 */

import os from 'os';
import { config }          from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { syncLock }        from '../core/sync-lock.js';
import { appendSyncEvent } from '../core/sync-history.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { SyncOptions, RestoreResult, StageResult, CommitResult } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export interface SyncCommandResult {
  readonly pulled: boolean;
  readonly pullResult?: RestoreResult | undefined;
  readonly pushed: boolean;
  readonly pushResult?: (CommitResult & { readonly stageResult?: StageResult | undefined }) | undefined;
}

export async function cmdSync({ agent, dryRun }: SyncOptions = {}): Promise<SyncCommandResult> {
  logger.banner(t('sync.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const hostname = cfg.hostname || os.hostname();
  if (agent) logger.info(t('sync.filterAgent', { agent: chalk.cyan(agent) }));
  if (dryRun) logger.info(chalk.yellow(t('dryRun.enabled')));

  // ── Acquire sync lock ─────────────────────────────────────────
  await syncLock.acquire(repoPath);
  try {
    return await runSync(cfg, repoPath, hostname, agent, dryRun);
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
      pullResult = await syncEngine.restoreFromRepo(cfg, agent);
      pulled = true;
      if (pullResult.synced.length > 0) {
        logger.ok(t('sync.pullSummary', {
          count: pullResult.synced.length,
          encrypted: pullResult.decrypted.length,
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
    stageResult = await syncEngine.stageToRepo(cfg, agent);
    spinner.succeed(t('sync.staged', { count: stageResult.synced.length }));
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
  }

  return { pulled, pullResult, pushed: pushResult.committed, pushResult };
}
