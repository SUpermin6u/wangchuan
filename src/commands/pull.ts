/**
 * pull.ts — wangchuan pull command / pull 命令
 */

import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import type { PullOptions, RestoreResult } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export async function cmdPull({ agent }: PullOptions = {}): Promise<RestoreResult> {
  logger.banner('Wangchuan · Pull / 忘川 · 拉取配置');

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  if (agent) logger.info(`Filter agent / 过滤智能体: ${chalk.cyan(agent)}`);

  // ── 1. git pull ────────────────────────────────────────────
  let spinner = ora(`Pulling from / 从 ${cfg.repo} 拉取 …`).start();
  try {
    await gitEngine.pull(repoPath, cfg.branch);
    spinner.succeed('Remote configs pulled / 远端配置已拉取');
  } catch (err) {
    spinner.fail('Git pull failed / Git 拉取失败');
    throw new Error(`Git pull failed / Git pull 失败: ${(err as Error).message}`);
  }

  // ── 2. Restore files / 还原文件 ────────────────────────────
  spinner.stop();
  let result: RestoreResult;
  try {
    result = await syncEngine.restoreFromRepo(cfg, agent);
  } catch (err) {
    throw new Error(`Restore failed / 还原失败: ${(err as Error).message}`);
  }

  // ── 3. Output / 输出结果 ────────────────────────────────────
  console.log();
  if (result.synced.length === 0 && result.skipped.length > 0) {
    logger.info('No configs in repo yet, run wangchuan push first / 仓库中暂无配置，请先 push');
    return result;
  }

  for (const f of result.synced) {
    const label = result.decrypted.includes(f) ? chalk.gray('[decrypted/已解密]') : '';
    logger.ok(`  ${chalk.green(f)} ${label}`);
  }

  if (result.skipped.length > 0) {
    logger.info(`\nSkipped (not in repo) / 跳过（仓库中不存在）: ${result.skipped.length} files/个文件`);
  }

  if (result.localOnly.length > 0) {
    console.log();
    logger.warn(`Detected ${result.localOnly.length} local-only files / 检测到 ${result.localOnly.length} 个本地独有文件：`);
    for (const f of result.localOnly) {
      logger.warn(`  ${chalk.yellow(f)}`);
    }
    logger.info('Run wangchuan push to sync / 如需同步到云端，请执行 wangchuan push');
  }

  logger.ok(`\nSynced ${result.synced.length} files (${result.decrypted.length} encrypted, ${result.conflicts.length} conflicts) / 共同步 ${result.synced.length} 个文件`);
  return result;
}
