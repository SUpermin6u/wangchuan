/**
 * pull.ts — wangchuan pull command
 */

import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { PullOptions, RestoreResult } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export async function cmdPull({ agent }: PullOptions = {}): Promise<RestoreResult> {
  logger.banner(t('pull.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  if (agent) logger.info(t('pull.filterAgent', { agent: chalk.cyan(agent) }));

  // ── 1. git pull ────────────────────────────────────────────
  let spinner = ora(t('pull.pulling', { repo: cfg.repo })).start();
  try {
    await gitEngine.pull(repoPath, cfg.branch);
    spinner.succeed(t('pull.pulled'));
  } catch (err) {
    spinner.fail(t('pull.gitFailed'));
    throw new Error(t('pull.gitFailedDetail', { error: (err as Error).message }));
  }

  // ── 2. Restore files ──────────────────────────────────────
  spinner.stop();
  let result: RestoreResult;
  try {
    result = await syncEngine.restoreFromRepo(cfg, agent);
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
  return result;
}
