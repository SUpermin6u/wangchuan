/**
 * push.ts — wangchuan push 命令
 */

import os from 'os';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import type { PushOptions, CommitResult, StageResult } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export interface PushCommandResult extends CommitResult {
  readonly stageResult?: StageResult;
}

export async function cmdPush({ message, agent }: PushOptions = {}): Promise<PushCommandResult> {
  logger.banner('忘川 · 推送配置');

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const hostname = cfg.hostname || os.hostname();
  if (agent) logger.info(`过滤智能体: ${chalk.cyan(agent)}`);

  const agentTag = agent ? `[${agent}]` : '';
  const msg = message
    ? `sync: ${message} / update ${agentTag}[${hostname}]`.trimEnd()
    : `sync: 更新配置 / update configs ${agentTag}[${hostname}]`.trimEnd();

  // ── 1. 工作区 → 仓库目录 ────────────────────────────────────
  let spinner = ora('加密并准备配置文件 …').start();
  let stageResult: StageResult;
  try {
    stageResult = await syncEngine.stageToRepo(cfg, agent);
    spinner.succeed(`已准备 ${stageResult.synced.length} 个文件`);
  } catch (err) {
    spinner.fail('暂存文件失败');
    throw new Error(`准备文件失败: ${(err as Error).message}`);
  }

  if (stageResult.synced.length === 0 && stageResult.deleted.length === 0) {
    logger.info('没有找到任何可同步的文件，请检查工作区路径是否正确');
    return { committed: false, pushed: false };
  }

  // ── 2. commit + push ────────────────────────────────────────
  spinner = ora('提交并推送到远端仓库 …').start();
  let pushResult: CommitResult;
  try {
    pushResult = await gitEngine.commitAndPush(repoPath, msg, cfg.branch);
    if (pushResult.committed) {
      spinner.succeed(`已推送到 ${cfg.repo}`);
    } else {
      spinner.info('没有变更需要提交（仓库已是最新）');
    }
  } catch (err) {
    spinner.fail('推送失败，正在回滚 …');
    try { await gitEngine.rollback(repoPath); } catch (re) {
      logger.error(`回滚失败: ${(re as Error).message}`);
    }
    throw new Error(`推送失败: ${(err as Error).message}`);
  }

  // ── 3. 输出汇总 ─────────────────────────────────────────────
  if (pushResult.committed) {
    console.log();
    for (const f of stageResult.synced) {
      const label = stageResult.encrypted.includes(f) ? chalk.gray('[已加密]') : '';
      logger.ok(`  ${chalk.green(f)} ${label}`);
    }
    for (const f of stageResult.deleted) {
      logger.info(`  ${chalk.red('✕ ' + f)} ${chalk.gray('[已清理]')}`);
    }
    const delTag = stageResult.deleted.length > 0
      ? `，清理 ${stageResult.deleted.length} 个过期文件`
      : '';
    logger.ok(`\n推送完成：${stageResult.synced.length} 个文件${delTag}，commit: ${pushResult.sha ?? '-'}`);
  }

  return { ...pushResult, stageResult };
}
