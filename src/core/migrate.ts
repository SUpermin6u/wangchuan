/**
 * migrate.ts — Config version migration
 *
 * v1 → v2:
 *   - repo structure from <agent>/ to agents/<agent>/
 *   - skills merged to shared/skills/
 *   - stale entries removed from repo
 *   - config.json upgraded to v2 format
 *
 * Safety measures:
 *   - Full backup to ~/.wangchuan/backup-v1/ before migration
 *   - Migration lock file prevents partial re-execution
 *   - Post-migration validation of key directories
 *   - Auto-rollback from backup on failure
 */

import fs   from 'fs';
import path from 'path';
import { config, CONFIG_VERSION } from './config.js';
import { expandHome } from './sync.js';
import { logger } from '../utils/logger.js';
import { t }      from '../i18n.js';
import type { WangchuanConfig } from '../types.js';

/** Recursively copy directory */
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

/** Recursively remove directory */
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

/** v1 → v2 migration */
function migrateV1toV2(cfg: WangchuanConfig): WangchuanConfig {
  const repoPath = expandHome(cfg.localRepoPath);
  if (!fs.existsSync(repoPath)) {
    return applyConfigV2(cfg);
  }

  const wangchuanDir = expandHome(config.paths.dir);
  const backupDir    = path.join(wangchuanDir, 'backup-v1');
  const lockFile     = path.join(wangchuanDir, MIGRATE_LOCK);

  // ── Detect incomplete migration ─────────────────────────────────
  if (fs.existsSync(lockFile)) {
    logger.warn(t('migrate.incomplete'));
    if (fs.existsSync(backupDir)) {
      rmDirRecursive(repoPath);
      copyDirRecursive(backupDir, repoPath);
      fs.unlinkSync(lockFile);
      logger.ok(t('migrate.rolledBack'));
    } else {
      fs.unlinkSync(lockFile);
    }
  }

  // ── 1. Full backup ──────────────────────────────────────────────
  if (!fs.existsSync(backupDir)) {
    logger.info(t('migrate.backingUp'));
    copyDirRecursive(repoPath, backupDir);
  }

  // ── Write migration lock ────────────────────────────────────────
  fs.writeFileSync(lockFile, `migrating v1→v2 at ${new Date().toISOString()}`, 'utf-8');

  try {
    // ── 2. Move <agent>/ → agents/<agent>/ ──────────────────────
    // Only the original v1 agents need directory migration
    for (const agent of ['openclaw', 'claude', 'gemini'] as const) {
      const oldDir = path.join(repoPath, agent);
      const newDir = path.join(repoPath, 'agents', agent);
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        fs.mkdirSync(path.dirname(newDir), { recursive: true });
        fs.renameSync(oldDir, newDir);
        logger.debug(`  ${agent}/ → agents/${agent}/`);
      }
    }

    // ── 3. Merge skills to shared/skills/ ───────────────────────
    const sharedSkills = path.join(repoPath, 'shared', 'skills');
    if (!fs.existsSync(sharedSkills)) {
      const ocSkills = path.join(repoPath, 'agents', 'openclaw', 'skills');
      if (fs.existsSync(ocSkills)) {
        copyDirRecursive(ocSkills, sharedSkills);
        logger.debug('  openclaw/skills → shared/skills/');
      }
    }

    // ── 4. Clean stale entries from repo ────────────────────────
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
        logger.debug(`  repo removed: ${rel}`);
      }
    }

    // ── 5. Post-migration validation ────────────────────────────
    const checks = [
      path.join(repoPath, 'agents'),
    ];
    for (const check of checks) {
      if (!fs.existsSync(check)) {
        throw new Error(t('migrate.validationFailed', { path: check }));
      }
    }

    // ── Migration success, remove lock ──────────────────────────
    fs.unlinkSync(lockFile);

  } catch (err) {
    // ── Migration failed, auto-rollback ─────────────────────────
    logger.error(t('migrate.failed', { error: (err as Error).message }));
    logger.info(t('migrate.rollingBack'));
    try {
      rmDirRecursive(repoPath);
      copyDirRecursive(backupDir, repoPath);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
      logger.ok(t('migrate.rolledBackOk'));
    } catch (rollbackErr) {
      logger.error(t('migrate.rollbackFailed', { error: (rollbackErr as Error).message }));
      logger.error(t('migrate.manualRestore', { path: backupDir }));
    }
    throw err;
  }

  return applyConfigV2(cfg);
}

/** Upgrade config to v2 format (preserving user settings) */
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
 * Detect and execute config migration, returns latest version config.
 * Call after config.load().
 */
export function ensureMigrated(cfg: WangchuanConfig): WangchuanConfig {
  const currentVersion = cfg.version ?? 1;
  if (currentVersion >= CONFIG_VERSION) return cfg;

  logger.info(t('migrate.detecting', { from: currentVersion, to: CONFIG_VERSION }));

  let migrated = cfg;
  if (currentVersion < 2) {
    migrated = migrateV1toV2(migrated);
  }

  config.save(migrated);
  logger.ok(t('migrate.complete'));
  logger.info(t('migrate.backedUp', { path: config.paths.dir }));
  return migrated;
}
