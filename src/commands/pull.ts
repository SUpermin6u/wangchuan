/**
 * pull.ts — wangchuan pull command
 *
 * Pull-only operation: fetch remote changes and restore to local workspace.
 * Cloud is the single source of truth — files absent from repo are deleted locally.
 *
 * 1. Fetch remote to check for new commits
 * 2. If remote is ahead, git pull
 * 3. restoreFromRepo (cloud → local)
 * 4. Report results
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
import type { PullOptions, RestoreResult, FilterOptions } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

const WANGCHUAN_DIR  = path.join(os.homedir(), '.wangchuan');
const SNAPSHOTS_DIR  = path.join(WANGCHUAN_DIR, 'snapshots');
const MAX_AUTO_SNAPSHOTS = 5;

/** Create an auto-snapshot before pull (silent, no user output) */
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

export async function cmdPull({ agent, dryRun, only, exclude }: PullOptions = {}): Promise<RestoreResult | undefined> {
  logger.banner(t('pull.banner'));

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

  // Auto-snapshot before pull (silent safety net)
  autoSnapshot(repoPath);

  // Acquire sync lock
  await syncLock.acquire(repoPath);
  try {
    return await runPull(cfg, repoPath, hostname, agent, dryRun, filter);
  } finally {
    syncLock.release();
  }
}

async function runPull(
  cfg: import('../types.js').WangchuanConfig,
  repoPath: string,
  hostname: string,
  agent: import('../types.js').AgentName | string | undefined,
  dryRun: boolean | undefined,
  filter: FilterOptions | undefined,
): Promise<RestoreResult | undefined> {
  // 1. Fetch remote
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

  // 2. Git pull if remote ahead
  if (remoteAhead > 0) {
    spinner = ora(t('sync.pulling')).start();
    try {
      await gitEngine.pull(repoPath, resolveGitBranch(cfg));
      spinner.succeed(t('sync.pulled'));
    } catch (err) {
      spinner.fail(t('sync.pullFailed'));
      throw new Error(t('sync.pullFailedDetail', { error: (err as Error).message }));
    }
  }

  // 3. Restore repo → local workspace
  let pullResult: RestoreResult;
  try {
    pullResult = await syncEngine.restoreFromRepo(cfg, agent, filter);
  } catch (err) {
    throw new Error(t('sync.restoreFailed', { error: (err as Error).message }));
  }

  // 4. Report results
  if (dryRun) {
    if (pullResult.synced.length > 0) {
      console.log();
      for (const f of pullResult.synced) {
        logger.ok(`  ${chalk.green(f)}`);
      }
      logger.ok('\n' + t('dryRun.wouldSync', {
        count: pullResult.synced.length,
        encrypted: pullResult.decrypted.length,
      }));
    } else {
      logger.ok(t('sync.alreadyInSync'));
    }
    return pullResult;
  }

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

  // Summary
  console.log();
  if (pullResult.synced.length > 0) {
    logger.ok(t('sync.summaryPull', { count: pullResult.synced.length }));
  } else {
    logger.ok(t('sync.alreadyInSync'));
  }

  // Record sync history
  if (pullResult.synced.length > 0) {
    appendSyncEvent({
      timestamp:   new Date().toISOString(),
      action:      'pull',
      environment: cfg.environment ?? 'default',
      agent,
      fileCount:   pullResult.synced.length,
      encrypted:   pullResult.decrypted.length,
      hostname,
    });

    await fireWebhooks(cfg, 'pull', buildWebhookPayload(
      cfg, 'pull', pullResult.synced.length, undefined,
    ));

    runHooks('postPull', cfg);
  }

  return pullResult;
}
