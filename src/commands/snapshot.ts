/**
 * snapshot.ts — wangchuan snapshot command
 *
 * Manage named snapshots of the current repo state for lightweight version history.
 *   snapshot save [name]    — copy repo state to ~/.wangchuan/snapshots/{name|timestamp}
 *   snapshot list           — show all snapshots with metadata
 *   snapshot restore <name> — restore snapshot to repo dir, then run restoreFromRepo
 *   snapshot delete <name>  — remove a snapshot
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { config }         from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { syncEngine }     from '../core/sync.js';
import { gitEngine }      from '../core/git.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { copyDirSync }    from '../utils/fs.js';
import { t }              from '../i18n.js';
import chalk              from 'chalk';

const WANGCHUAN_DIR  = path.join(os.homedir(), '.wangchuan');
const SNAPSHOTS_DIR  = path.join(WANGCHUAN_DIR, 'snapshots');
const DEFAULT_MAX    = 10;

export interface SnapshotOptions {
  readonly action: string;
  readonly name?: string | undefined;
  readonly maxSnapshots?: number | undefined;
}

interface SnapshotMeta {
  readonly createdAt: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function ensureSnapshotsDir(): void {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

/** Calculate total size of a directory in bytes */
function dirSize(dirPath: string): number {
  let total = 0;
  if (!fs.existsSync(dirPath)) return total;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(full);
    } else {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Prune oldest snapshots when count exceeds max */
function pruneSnapshots(max: number): number {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return 0;
  const dirs = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(d => fs.statSync(path.join(SNAPSHOTS_DIR, d)).isDirectory())
    .sort();
  if (dirs.length <= max) return 0;
  const toRemove = dirs.slice(0, dirs.length - max);
  for (const dir of toRemove) {
    fs.rmSync(path.join(SNAPSHOTS_DIR, dir), { recursive: true, force: true });
  }
  return toRemove.length;
}

// ── Actions ─────────────────────────────────────────────────────

function snapshotSave(repoPath: string, name: string | undefined, maxSnapshots: number): void {
  ensureSnapshotsDir();
  const snapshotName = name ?? new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir  = path.join(SNAPSHOTS_DIR, snapshotName);

  if (fs.existsSync(snapshotDir)) {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
  }

  const fileCount = copyDirSync(repoPath, snapshotDir);
  const totalBytes = dirSize(snapshotDir);

  // Write metadata
  const meta: SnapshotMeta = {
    createdAt:  new Date().toISOString(),
    fileCount,
    totalBytes,
  };
  fs.writeFileSync(
    path.join(snapshotDir, '.snapshot-meta.json'),
    JSON.stringify(meta, null, 2),
    'utf-8',
  );

  logger.ok(t('snapshot.saved', { name: snapshotName, count: fileCount }));

  // Auto-prune
  const pruned = pruneSnapshots(maxSnapshots);
  if (pruned > 0) {
    logger.info(t('snapshot.pruned', { count: pruned, max: maxSnapshots }));
  }
}

function snapshotList(): void {
  ensureSnapshotsDir();
  const dirs = fs.readdirSync(SNAPSHOTS_DIR)
    .filter(d => fs.statSync(path.join(SNAPSHOTS_DIR, d)).isDirectory())
    .sort()
    .reverse();

  if (dirs.length === 0) {
    logger.info(t('snapshot.listEmpty'));
    return;
  }

  logger.info(t('snapshot.listHeader'));
  for (const dir of dirs) {
    const snapshotDir = path.join(SNAPSHOTS_DIR, dir);
    const metaPath = path.join(snapshotDir, '.snapshot-meta.json');
    let meta: SnapshotMeta | undefined;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SnapshotMeta;
    } catch { /* no metadata */ }

    const time  = meta?.createdAt ?? '—';
    const count = meta?.fileCount ?? 0;
    const size  = meta ? formatBytes(meta.totalBytes) : '—';
    logger.info(`  ${chalk.cyan(dir)}  ${chalk.gray(time)}  ${count} files  ${chalk.gray(size)}`);
  }
}

async function snapshotRestore(repoPath: string, name: string): Promise<void> {
  const snapshotDir = path.join(SNAPSHOTS_DIR, name);
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(t('snapshot.notFound', { name }));
  }

  // Copy snapshot content back to repo dir (skip metadata file)
  for (const entry of fs.readdirSync(snapshotDir, { withFileTypes: true })) {
    if (entry.name === '.snapshot-meta.json') continue;
    const src  = path.join(snapshotDir, entry.name);
    const dest = path.join(repoPath, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(src, dest);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }

  logger.ok(t('snapshot.restored', { name }));
}

function snapshotDelete(name: string): void {
  const snapshotDir = path.join(SNAPSHOTS_DIR, name);
  if (!fs.existsSync(snapshotDir)) {
    throw new Error(t('snapshot.notFound', { name }));
  }
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  logger.ok(t('snapshot.deleted', { name }));
}

// ── Command entry ───────────────────────────────────────────────

export async function cmdSnapshot({ action, name, maxSnapshots }: SnapshotOptions): Promise<void> {
  logger.banner(t('snapshot.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const max = maxSnapshots ?? DEFAULT_MAX;

  switch (action) {
    case 'save':
      snapshotSave(repoPath, name, max);
      break;
    case 'list':
      snapshotList();
      break;
    case 'restore':
      if (!name) throw new Error(t('snapshot.nameRequired'));
      await snapshotRestore(repoPath, name);
      // Restore files to workspace
      await syncEngine.restoreFromRepo(cfg);
      // Push rolled-back state to cloud so other machines get the restored version
      logger.info(t('snapshot.pushing'));
      await gitEngine.commitAndPush(repoPath, `snapshot: restore '${name}'`, resolveGitBranch(cfg));
      logger.ok(t('snapshot.pushedToCloud'));
      break;
    case 'delete':
      if (!name) throw new Error(t('snapshot.nameRequired'));
      snapshotDelete(name);
      break;
    default:
      throw new Error(t('snapshot.unknownAction', { action }));
  }
}
