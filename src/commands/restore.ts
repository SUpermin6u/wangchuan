/**
 * restore.ts — wangchuan restore command
 *
 * Restores an existing wangchuan setup from cloud on a new machine.
 * Requires --repo and --key (both mandatory).
 *
 * Flow:
 * 1. Validate repo + key are provided
 * 2. Initialize config
 * 3. Import the provided key
 * 4. Clone repo
 * 5. Force restoreFromRepo (cloud → local)
 * 6. Push local additions (skipStaleDetection to avoid deleting cloud data)
 */

import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { resolveGitBranch } from '../core/config.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { ensureKey, cloneRepo } from './init.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { RestoreOptions } from '../types.js';
import ora from 'ora';

export async function cmdRestore({ repo, key }: RestoreOptions): Promise<void> {
  logger.banner(t('restore.banner'));

  // ── Validate required options ──────────────────────────────────
  if (!repo) {
    throw new Error(t('restore.repoRequired'));
  }
  if (!key) {
    throw new Error(t('restore.keyRequired'));
  }
  if (!validator.isGitUrl(repo)) {
    throw new Error(t('init.invalidGitUrl', { repo }));
  }

  // ── Initialize config ──────────────────────────────────────────
  let spinner = ora(t('init.writingConfig')).start();
  const cfg = await config.initialize(repo);
  spinner.succeed(t('init.configSaved', { path: config.paths.config }));

  // ── Import key ─────────────────────────────────────────────────
  await ensureKey(cfg, key);

  // ── Clone repo ─────────────────────────────────────────────────
  await cloneRepo(repo, cfg.localRepoPath, cfg.branch);

  // ── Apply config snapshot from cloud (workspacePath, enabled) ──
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const { applyConfigSnapshot } = await import('../core/sync-stage.js');
  if (applyConfigSnapshot(repoPath, cfg)) {
    config.save(cfg);
    logger.ok(t('restore.configRestored'));
  }

  // ── Pull remote to ensure we have latest ───────────────────────
  const branch = resolveGitBranch(cfg);
  try {
    const remoteAhead = await gitEngine.fetchAndCheckRemoteAhead(repoPath, branch);
    if (remoteAhead > 0) {
      await gitEngine.pull(repoPath, branch);
    }
  } catch {
    // Clone already has the latest — safe to continue
  }

  // ── Force restore from cloud → local ───────────────────────────
  spinner = ora(t('restore.cloudRestore')).start();
  const migrated = ensureMigrated(cfg);
  const pullResult = await syncEngine.restoreFromRepo(migrated);
  spinner.succeed(t('restore.cloudRestored'));

  if (pullResult.synced.length > 0) {
    logger.ok(t('sync.pullSummary', {
      count: pullResult.synced.length,
      encrypted: pullResult.decrypted.length,
    }));
  }

  logger.ok('\n' + t('restore.complete'));
}
