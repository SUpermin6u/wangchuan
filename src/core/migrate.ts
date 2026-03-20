/**
 * migrate.ts — 配置版本迁移
 *
 * v1 → v2:
 *   - repo 结构从 <agent>/ 迁移到 agents/<agent>/
 *   - skills 合并到 shared/skills/
 *   - 移除不再同步的文件（repo 中的旧条目，不影响本地工作区）
 *   - config.json 升级到 v2 格式
 *
 * 安全措施：
 *   - 迁移前完整备份旧 repo 到 ~/.wangchuan/backup-v1/
 *   - 写入迁移状态标记防止中断后重复执行部分步骤
 *   - 迁移后校验关键目录结构
 *   - 失败时自动回滚到备份
 */

import fs   from 'fs';
import path from 'path';
import { config, CONFIG_VERSION } from './config.js';
import { expandHome } from './sync.js';
import { logger } from '../utils/logger.js';
import type { WangchuanConfig } from '../types.js';

/** 递归复制目录 */
function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** 递归删除目录 */
function rmDirRecursive(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) rmDirRecursive(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

const MIGRATE_LOCK = '.migrate-in-progress';

/** v1 → v2 迁移 */
function migrateV1toV2(cfg: WangchuanConfig): WangchuanConfig {
  const repoPath = expandHome(cfg.localRepoPath);
  if (!fs.existsSync(repoPath)) {
    // 仓库不存在（尚未 clone），仅升级配置
    return applyConfigV2(cfg);
  }

  const wangchuanDir = expandHome(config.paths.dir);
  const backupDir    = path.join(wangchuanDir, 'backup-v1');
  const lockFile     = path.join(wangchuanDir, MIGRATE_LOCK);

  // ── 检测上次中断的迁移 ─────────────────────────────────────
  if (fs.existsSync(lockFile)) {
    logger.warn('检测到上次迁移未完成，正在从备份回滚 …');
    if (fs.existsSync(backupDir)) {
      // 回滚：删除当前 repo，从备份恢复
      rmDirRecursive(repoPath);
      copyDirRecursive(backupDir, repoPath);
      fs.unlinkSync(lockFile);
      logger.ok('已从备份回滚，重新开始迁移');
    } else {
      // 没有备份但有 lock，说明备份阶段就中断了，repo 应该还是原样
      fs.unlinkSync(lockFile);
    }
  }

  // ── 1. 完整备份旧 repo ─────────────────────────────────────
  if (!fs.existsSync(backupDir)) {
    logger.info('备份旧 repo 结构 …');
    copyDirRecursive(repoPath, backupDir);
  }

  // ── 写入迁移锁 ─────────────────────────────────────────────
  fs.writeFileSync(lockFile, `migrating v1→v2 at ${new Date().toISOString()}`, 'utf-8');

  try {
    // ── 2. 移动 <agent>/ → agents/<agent>/ ────────────────────
    for (const agent of ['openclaw', 'claude', 'gemini'] as const) {
      const oldDir = path.join(repoPath, agent);
      const newDir = path.join(repoPath, 'agents', agent);
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        fs.mkdirSync(path.dirname(newDir), { recursive: true });
        fs.renameSync(oldDir, newDir);
        logger.debug(`  ${agent}/ → agents/${agent}/`);
      }
    }

    // ── 3. 合并 skills 到 shared/skills/ ──────────────────────
    const sharedSkills = path.join(repoPath, 'shared', 'skills');
    if (!fs.existsSync(sharedSkills)) {
      const ocSkills = path.join(repoPath, 'agents', 'openclaw', 'skills');
      if (fs.existsSync(ocSkills)) {
        copyDirRecursive(ocSkills, sharedSkills);
        logger.debug('  openclaw/skills → shared/skills/');
      }
    }

    // ── 4. 清理 repo 中不再同步的条目 ─────────────────────────
    // 注意：这只清理 repo 中的旧文件，不影响工作区的源文件
    const removals = [
      'agents/openclaw/USER.md.enc',
      'agents/openclaw/TOOLS.md',
      'agents/openclaw/config/mcporter.json.enc',
      'agents/claude/.claude.json.enc',
      'agents/gemini/projects.json',
      'agents/gemini/trustedFolders.json',
      'agents/gemini/settings.internal.json.enc',
    ];
    for (const rel of removals) {
      const abs = path.join(repoPath, rel);
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
        logger.debug(`  repo 中移除: ${rel}`);
      }
    }

    // ── 5. 迁移后校验 ────────────────────────────────────────
    const checks = [
      path.join(repoPath, 'agents'),
    ];
    for (const check of checks) {
      if (!fs.existsSync(check)) {
        throw new Error(`迁移校验失败: ${check} 不存在`);
      }
    }

    // ── 迁移成功，删除锁 ─────────────────────────────────────
    fs.unlinkSync(lockFile);

  } catch (err) {
    // ── 迁移失败，自动回滚 ───────────────────────────────────
    logger.error(`迁移失败: ${(err as Error).message}`);
    logger.info('正在从备份回滚 …');
    try {
      rmDirRecursive(repoPath);
      copyDirRecursive(backupDir, repoPath);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
      logger.ok('已回滚到迁移前状态');
    } catch (rollbackErr) {
      logger.error(`回滚失败: ${(rollbackErr as Error).message}`);
      logger.error(`请手动从 ${backupDir} 恢复`);
    }
    throw err;
  }

  return applyConfigV2(cfg);
}

/** 将配置升级到 v2 格式（保留 repo/branch 等用户设置） */
function applyConfigV2(cfg: WangchuanConfig): WangchuanConfig {
  return {
    repo:          cfg.repo,
    branch:        cfg.branch,
    localRepoPath: cfg.localRepoPath,
    keyPath:       cfg.keyPath,
    hostname:      cfg.hostname,
    version:       CONFIG_VERSION,
    profiles:      { default: config.defaults.profiles },
    shared:        config.defaults.shared,
  };
}

/**
 * 检测并执行配置迁移，返回最新版本的配置。
 * 在 config.load() 之后调用。
 */
export function ensureMigrated(cfg: WangchuanConfig): WangchuanConfig {
  const currentVersion = cfg.version ?? 1;
  if (currentVersion >= CONFIG_VERSION) return cfg;

  logger.info(`检测到 v${currentVersion} 配置，正在迁移到 v${CONFIG_VERSION} …`);

  let migrated = cfg;
  if (currentVersion < 2) {
    migrated = migrateV1toV2(migrated);
  }

  config.save(migrated);
  logger.ok('配置迁移完成');
  logger.info(`旧数据已备份到 ${config.paths.dir}/backup-v1/`);
  return migrated;
}
