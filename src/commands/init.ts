/**
 * init.ts — wangchuan init command / init 命令
 */

import { config }       from '../core/config.js';
import { cryptoEngine } from '../core/crypto.js';
import { gitEngine }    from '../core/git.js';
import { validator }    from '../utils/validator.js';
import { logger }       from '../utils/logger.js';
import type { InitOptions, WangchuanConfig } from '../types.js';
import ora from 'ora';
import fs   from 'fs';
import path from 'path';

export async function cmdInit({ repo, force = false, key }: InitOptions): Promise<WangchuanConfig> {
  logger.banner('Wangchuan Init / 忘川初始化');

  if (!validator.isGitUrl(repo)) {
    throw new Error(`Invalid Git URL / 无效的 Git 地址: ${repo}`);
  }

  const existing = config.load();
  if (existing !== null && !force) {
    logger.warn(`Already initialized (repo: ${existing.repo}) / 忘川已初始化`);
    logger.info('Use --force to re-initialize / 如需重新初始化，请使用 --force 参数');
    return existing;
  }

  // ── Write config / 写配置 ──────────────────────────────────────
  let spinner = ora('Writing config … / 写入配置 …').start();
  const cfg = await config.initialize(repo);
  spinner.succeed(`Config saved / 配置已写入: ${config.paths.config}`);

  // ── Key / 密钥 ──────────────────────────────────────────────────
  if (key) {
    const hex = key.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('Invalid key format, expected 64 hex chars (256-bit) / 密钥格式无效');
    }
    fs.mkdirSync(path.dirname(cfg.keyPath), { recursive: true });
    fs.writeFileSync(cfg.keyPath, hex, 'utf-8');
    logger.ok(`Master key imported / 主密钥已导入: ${cfg.keyPath}`);
  } else if (!cryptoEngine.hasKey(cfg.keyPath)) {
    spinner = ora('Generating AES-256-GCM master key … / 生成主密钥 …').start();
    cryptoEngine.generateKey(cfg.keyPath);
    spinner.succeed(`Master key generated / 主密钥已生成: ${cfg.keyPath}`);
  } else {
    logger.info(`Master key exists, skipping / 主密钥已存在: ${cfg.keyPath}`);
  }

  // ── Clone/fetch repo / 克隆仓库 ────────────────────────────────
  spinner = ora(`Cloning repo / 克隆仓库: ${repo} …`).start();
  try {
    await gitEngine.cloneOrFetch(repo, cfg.localRepoPath, cfg.branch);
    spinner.succeed(`Repo ready / 仓库已就绪: ${cfg.localRepoPath}`);
  } catch (err) {
    spinner.fail('Clone failed / 克隆仓库失败');
    throw new Error(`Git operation failed / Git 操作失败: ${(err as Error).message}`);
  }

  logger.ok('\nWangchuan initialized! / 忘川初始化完成！');
  logger.step('Next / 下一步: wangchuan pull  (pull remote memories / 同步远端记忆到本地)');
  logger.step('              wangchuan push  (push local memories / 推送本地记忆到远端)');

  return cfg;
}
