/**
 * pull.ts — wangchuan pull 命令
 */

import { config }     from '../core/config.js';
import { gitEngine }  from '../core/git.js';
import { syncEngine } from '../core/sync.js';
import { validator }  from '../utils/validator.js';
import { logger }     from '../utils/logger.js';
import type { PullOptions, RestoreResult } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

export async function cmdPull({ agent }: PullOptions = {}): Promise<RestoreResult> {
  logger.banner('忘川 · 拉取配置');

  const cfg = config.load();
  validator.requireInit(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  if (agent) logger.info(`过滤智能体: ${chalk.cyan(agent)}`);

  // ── 1. git pull ────────────────────────────────────────────
  let spinner = ora(`从 ${cfg.repo} 拉取最新配置 …`).start();
  try {
    await gitEngine.pull(repoPath, cfg.branch);
    spinner.succeed('远端配置已拉取');
  } catch (err) {
    spinner.fail('Git 拉取失败');
    throw new Error(`Git pull 失败: ${(err as Error).message}`);
  }

  // ── 2. 还原文件 ───────────────────────────────────────────
  spinner.stop(); // 冲突提示前停止 spinner
  let result: RestoreResult;
  try {
    result = await syncEngine.restoreFromRepo(cfg, agent);
  } catch (err) {
    throw new Error(`还原失败: ${(err as Error).message}`);
  }

  // ── 3. 输出结果 ───────────────────────────────────────────
  console.log();
  if (result.synced.length === 0 && result.skipped.length > 0) {
    logger.info('仓库中暂无配置文件，请先执行 wangchuan push');
    return result;
  }

  for (const f of result.synced) {
    const label = result.decrypted.includes(f) ? chalk.gray('[已解密]') : '';
    logger.ok(`  ${chalk.green(f)} ${label}`);
  }

  if (result.skipped.length > 0) {
    logger.info(`\n跳过（仓库中不存在）: ${result.skipped.length} 个文件`);
  }

  logger.ok(`\n共同步 ${result.synced.length} 个文件（含 ${result.decrypted.length} 个加密文件，${result.conflicts.length} 个冲突）`);
  return result;
}
