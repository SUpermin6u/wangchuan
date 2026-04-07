/**
 * push.ts — wangchuan push command
 */

import os from 'os';
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
import type { PushOptions, CommitResult, StageResult, FilterOptions } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export interface PushCommandResult extends CommitResult {
  readonly stageResult?: StageResult;
}

export async function cmdPush({ message, agent, dryRun, only, exclude }: PushOptions = {}): Promise<PushCommandResult> {
  logger.banner(t('push.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const hostname = cfg.hostname || os.hostname();
  if (agent) logger.info(t('push.filterAgent', { agent: chalk.cyan(agent) }));
  if (only?.length)    logger.info(t('filter.only', { patterns: only.join(', ') }));
  if (exclude?.length) logger.info(t('filter.exclude', { patterns: exclude.join(', ') }));
  if (dryRun) logger.info(chalk.yellow(t('dryRun.enabled')));

  const filter = (only?.length || exclude?.length) ? { only, exclude } : undefined;

  // ── Acquire sync lock ─────────────────────────────────────────
  await syncLock.acquire(repoPath);
  try {
    return await runPush(cfg, repoPath, hostname, message, agent, dryRun, filter);
  } finally {
    syncLock.release();
  }
}

async function runPush(
  cfg: import('../types.js').WangchuanConfig,
  repoPath: string,
  hostname: string,
  message: string | undefined,
  agent: import('../types.js').AgentName | undefined,
  dryRun: boolean | undefined,
  filter: FilterOptions | undefined,
): Promise<PushCommandResult> {
  const agentTag = agent ? `[${agent}]` : '';
  const msg = message
    ? t('push.commitMsgCustom', { message, tag: agentTag, host: hostname })
    : t('push.commitMsgDefault', { tag: agentTag, host: hostname });

  // ── 1. Workspace → repo dir ────────────────────────────────────
  let spinner = ora(t('push.staging')).start();
  let stageResult: StageResult;
  try {
    stageResult = await syncEngine.stageToRepo(cfg, agent, filter);
    spinner.succeed(t('push.staged', { count: stageResult.synced.length }) +
      (stageResult.unchanged.length > 0 ? ' ' + t('push.unchangedSummary', { count: stageResult.unchanged.length }) : ''));
  } catch (err) {
    spinner.fail(t('push.stagingFailed'));
    throw new Error(t('push.stagingFailedDetail', { error: (err as Error).message }));
  }

  if (stageResult.synced.length === 0 && stageResult.deleted.length === 0) {
    logger.info(t('push.noFiles'));
    return { committed: false, pushed: false };
  }

  // ── Dry-run: print summary and exit ──────────────────────────
  if (dryRun) {
    console.log();
    for (const f of stageResult.synced) {
      const label = stageResult.encrypted.includes(f) ? chalk.gray(t('push.encrypted')) : '';
      logger.ok(`  ${chalk.green(f)} ${label}`);
    }
    for (const f of stageResult.deleted) {
      logger.info(`  ${chalk.red('✕ ' + f)} ${chalk.gray(t('push.pruned'))}`);
    }
    logger.ok('\n' + t('dryRun.wouldSync', {
      count: stageResult.synced.length,
      encrypted: stageResult.encrypted.length,
    }));
    if (stageResult.deleted.length > 0) {
      logger.ok(t('dryRun.wouldPrune', { count: stageResult.deleted.length }));
    }
    logger.ok(t('dryRun.wouldCommit', { repo: cfg.repo }));
    return { committed: false, pushed: false, stageResult };
  }

  // ── 2. commit + push ──────────────────────────────────────────
  spinner = ora(t('push.committing')).start();
  let pushResult: CommitResult;
  try {
    pushResult = await gitEngine.commitAndPush(repoPath, msg, resolveGitBranch(cfg));
    if (pushResult.committed) {
      spinner.succeed(t('push.pushed', { repo: cfg.repo }));
    } else {
      spinner.info(t('push.nothingToCommit'));
    }
  } catch (err) {
    spinner.fail(t('push.pushFailed'));
    try { await gitEngine.rollback(repoPath); } catch (re) {
      logger.error(t('push.rollbackFailed', { error: (re as Error).message }));
    }
    throw new Error(t('push.pushFailedDetail', { error: (err as Error).message }));
  }

  // ── 3. Summary ────────────────────────────────────────────────
  if (pushResult.committed) {
    console.log();
    for (const f of stageResult.synced) {
      const label = stageResult.encrypted.includes(f) ? chalk.gray(t('push.encrypted')) : '';
      logger.ok(`  ${chalk.green(f)} ${label}`);
    }
    for (const f of stageResult.deleted) {
      logger.info(`  ${chalk.red('✕ ' + f)} ${chalk.gray(t('push.pruned'))}`);
    }
    const pruned = stageResult.deleted.length > 0
      ? t('push.prunedSummary', { count: stageResult.deleted.length })
      : '';
    logger.ok('\n' + t('push.complete', {
      count:  stageResult.synced.length,
      pruned,
      sha:    pushResult.sha ?? '-',
    }));
  }

  // Record sync history
  if (pushResult.committed) {
    appendSyncEvent({
      timestamp:   new Date().toISOString(),
      action:      'push',
      environment: cfg.environment ?? 'default',
      agent:       agent,
      fileCount:   stageResult.synced.length,
      encrypted:   stageResult.encrypted.length,
      sha:         pushResult.sha,
      hostname,
    });

    // Fire webhooks (fire-and-forget)
    await fireWebhooks(cfg, 'push', buildWebhookPayload(
      cfg, 'push', stageResult.synced.length, pushResult.sha,
    ));

    // Run post-push hooks
    runHooks('postPush', cfg);
  }

  return { ...pushResult, stageResult };
}
