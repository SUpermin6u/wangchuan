/**
 * init.ts — wangchuan init 命令
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
  logger.banner('忘川初始化');

  if (!validator.isGitUrl(repo)) {
    throw new Error(`无效的 Git 地址: ${repo}`);
  }

  const existing = config.load();
  if (existing !== null && !force) {
    logger.warn(`忘川已初始化 (仓库: ${existing.repo})`);
    logger.info('如需重新初始化，请使用 --force 参数');
    return existing;
  }

  // ── 写配置 ──────────────────────────────────────────────────
  let spinner = ora('写入配置 …').start();
  const cfg = await config.initialize(repo);
  spinner.succeed(`配置已写入: ${config.paths.config}`);

  // ── 密钥 ──────────────────────────────────────────────────
  if (key) {
    // 直接写入用户传入的密钥字符串
    const hex = key.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('密钥格式无效，需要 64 位十六进制字符串（256-bit）');
    }
    fs.mkdirSync(path.dirname(cfg.keyPath), { recursive: true });
    fs.writeFileSync(cfg.keyPath, hex, 'utf-8');
    logger.ok(`主密钥已导入: ${cfg.keyPath}`);
  } else if (!cryptoEngine.hasKey(cfg.keyPath)) {
    spinner = ora('生成 AES-256-GCM 主密钥 …').start();
    cryptoEngine.generateKey(cfg.keyPath);
    spinner.succeed(`主密钥已生成: ${cfg.keyPath}`);
  } else {
    logger.info(`主密钥已存在，跳过生成: ${cfg.keyPath}`);
  }

  // ── 克隆/拉取仓库 ────────────────────────────────────────────
  spinner = ora(`克隆仓库: ${repo} …`).start();
  try {
    await gitEngine.cloneOrFetch(repo, cfg.localRepoPath, cfg.branch);
    spinner.succeed(`仓库已就绪: ${cfg.localRepoPath}`);
  } catch (err) {
    spinner.fail('克隆仓库失败');
    throw new Error(`Git 操作失败: ${(err as Error).message}`);
  }

  logger.ok('\n忘川初始化完成！');
  logger.step('下一步: wangchuan pull  (同步远端记忆到本地)');
  logger.step('        wangchuan push  (推送本地记忆到远端)');

  return cfg;
}
