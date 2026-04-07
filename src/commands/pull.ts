/**
 * pull.ts — wangchuan pull command
 */

import { config }          from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { syncLock }        from '../core/sync-lock.js';
import { appendSyncEvent } from '../core/sync-history.js';
import { fireWebhooks, buildWebhookPayload } from '../core/webhook.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { PullOptions, RestoreResult, FilterOptions } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export async function cmdPull({ agent, only, exclude }: PullOptions = {}): Promise<RestoreResult> {
  logger.banner(t('pull.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  if (agent) logger.info(t('pull.filterAgent', { agent: chalk.cyan(agent) }));
  if (only?.length)    logger.info(t('filter.only', { patterns: only.join(', ') }));
  if (exclude?.length) logger.info(t('filter.exclude', { patterns: exclude.join(', ') }));

  const filter = (only?.length || exclude?.length) ? { only, exclude } : undefined;

  // ── Acquire sync lock ─────────────────────────────────────────
  await syncLock.acquire(repoPath);
  try {
    return await runPull(cfg, repoPath, agent, filter);
  } finally {
    syncLock.release();
  }
}

async function runPull(
  cfg: import('../types.js').WangchuanConfig,
  repoPath: string,
  agent: import('../types.js').AgentName | undefined,
  filter: FilterOptions | undefined,
): Promise<RestoreResult> {
  let spinner = ora(t('pull.pulling', { repo: cfg.repo })).start();
  try {
    await gitEngine.pull(repoPath, resolveGitBranch(cfg));
    spinner.succeed(t('pull.pulled'));
  } catch (err) {
    spinner.fail(t('pull.gitFailed'));
    throw new Error(t('pull.gitFailedDetail', { error: (err as Error).message }));
  }

  // ── 2. Restore files ──────────────────────────────────────
  spinner.stop();
  let result: RestoreResult;
  try {
    result = await syncEngine.restoreFromRepo(cfg, agent, filter);
  } catch (err) {
    throw new Error(t('pull.restoreFailed', { error: (err as Error).message }));
  }

  // ── 3. Output ─────────────────────────────────────────────
  console.log();
  if (result.synced.length === 0 && result.skipped.length > 0) {
    logger.info(t('pull.noConfigs'));
    return result;
  }

  for (const f of result.synced) {
    const label = result.decrypted.includes(f) ? chalk.gray(t('pull.decrypted')) : '';
    logger.ok(`  ${chalk.green(f)} ${label}`);
  }

  if (result.skipped.length > 0) {
    logger.info('\n' + t('pull.skipped', { count: result.skipped.length }));
  }

  if (result.localOnly.length > 0) {
    console.log();
    logger.warn(t('pull.localOnly', { count: result.localOnly.length }));
    for (const f of result.localOnly) {
      logger.warn(`  ${chalk.yellow(f)}`);
    }
    logger.info(t('pull.suggestPush'));
  }

  logger.ok('\n' + t('pull.summary', {
    synced:    result.synced.length,
    encrypted: result.decrypted.length,
    conflicts: result.conflicts.length,
  }));

  // Record sync history
  appendSyncEvent({
    timestamp:   new Date().toISOString(),
    action:      'pull',
    environment: cfg.environment ?? 'default',
    agent:       agent,
    fileCount:   result.synced.length,
    encrypted:   result.decrypted.length,
    hostname:    cfg.hostname || (await import('os')).default.hostname(),
  });

  // Fire webhooks (fire-and-forget)
  await fireWebhooks(cfg, 'pull', buildWebhookPayload(
    cfg, 'pull', result.synced.length,
  ));

  return result;
}
