/**
 * push.ts — wangchuan push command
 */

import os from 'os';
import { config }          from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { PushOptions, CommitResult, StageResult } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export interface PushCommandResult extends CommitResult {
  readonly stageResult?: StageResult;
}

export async function cmdPush({ message, agent }: PushOptions = {}): Promise<PushCommandResult> {
  logger.banner(t('push.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const hostname = cfg.hostname || os.hostname();
  if (agent) logger.info(t('push.filterAgent', { agent: chalk.cyan(agent) }));

  const agentTag = agent ? `[${agent}]` : '';
  const msg = message
    ? t('push.commitMsgCustom', { message, tag: agentTag, host: hostname })
    : t('push.commitMsgDefault', { tag: agentTag, host: hostname });

  // ── 1. Workspace → repo dir ────────────────────────────────────
  let spinner = ora(t('push.staging')).start();
  let stageResult: StageResult;
  try {
    stageResult = await syncEngine.stageToRepo(cfg, agent);
    spinner.succeed(t('push.staged', { count: stageResult.synced.length }));
  } catch (err) {
    spinner.fail(t('push.stagingFailed'));
    throw new Error(t('push.stagingFailedDetail', { error: (err as Error).message }));
  }

  if (stageResult.synced.length === 0 && stageResult.deleted.length === 0) {
    logger.info(t('push.noFiles'));
    return { committed: false, pushed: false };
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

  return { ...pushResult, stageResult };
}
