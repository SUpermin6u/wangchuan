/**
 * watch.ts — wangchuan watch command (long-running daemon)
 *
 * Monitors enabled agents' workspace directories for file changes.
 * Debounces changes then auto-triggers sync. Also periodically polls
 * remote for new commits.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine }      from '../core/sync.js';
import { gitEngine }       from '../core/git.js';
import { threeWayMerge }   from '../core/merge.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import { cmdSync }         from './sync.js';
import type { WatchOptions, WangchuanConfig, AgentName } from '../types.js';
import { AGENT_NAMES } from '../types.js';
import chalk from 'chalk';

const DEFAULT_INTERVAL_MINUTES = 5;
const DEBOUNCE_MS = 5_000;
const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const PID_FILE = path.join(WANGCHUAN_DIR, 'watch.pid');

/**
 * Collect all absolute paths that should be watched for a given config.
 * Returns a map of absPath → true for quick lookup, plus the list of
 * directories to attach fs.watch() on.
 */
function collectWatchTargets(
  cfg: WangchuanConfig,
  agent?: AgentName | string,
): { readonly watchDirs: readonly string[]; readonly watchFiles: Set<string> } {
  const entries = syncEngine.buildFileEntries(cfg, undefined, agent);
  const watchFiles = new Set<string>();
  const watchDirs  = new Set<string>();

  for (const entry of entries) {
    watchFiles.add(entry.srcAbs);
    watchDirs.add(path.dirname(entry.srcAbs));
  }

  return { watchDirs: [...watchDirs], watchFiles };
}

function timestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

// ── PID file singleton ──────────────────────────────────────────

function writePidFile(): void {
  fs.mkdirSync(WANGCHUAN_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
}

function deletePidFile(): void {
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
}

/** Check if watch daemon is running (reads PID file + checks process) */
export function isWatchRunning(): boolean {
  return getWatchPid() !== null;
}

/** Return the PID of the running watch daemon, or null if not running */
export function getWatchPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (isNaN(pid)) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    // Process is dead — clean up stale PID file
    deletePidFile();
    return null;
  }
}

export async function cmdWatch({ agent, interval }: WatchOptions = {}): Promise<void> {
  logger.banner(t('watch.banner'));

  // ── Singleton enforcement ────────────────────────────────────
  const existingPid = getWatchPid();
  if (existingPid !== null) {
    logger.warn(t('watch.alreadyRunning', { pid: existingPid }));
    return;
  }
  writePidFile();

  let rawCfg = config.load();
  validator.requireInit(rawCfg);
  const cfg = ensureMigrated(rawCfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const intervalMinutes = interval ?? DEFAULT_INTERVAL_MINUTES;
  if (agent) logger.info(t('watch.filterAgent', { agent: chalk.cyan(agent) }));
  logger.info(t('watch.interval', { minutes: intervalMinutes }));

  const { watchDirs, watchFiles } = collectWatchTargets(cfg, agent);

  if (watchDirs.length === 0) {
    logger.warn(t('watch.noTargets'));
    deletePidFile();
    return;
  }

  logger.info(t('watch.watching', { dirs: watchDirs.length, files: watchFiles.size }));

  // ── Debounce state ──────────────────────────────────────────
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  async function triggerSync(reason: string): Promise<void> {
    if (syncing) return;
    syncing = true;
    try {
      logger.step(t('watch.triggerSync', { reason, time: timestamp() }));
      // Watch mode: skip shared distribution — changes are deferred for interactive confirmation
      await cmdSync(agent ? { agent, skipShared: true } : { skipShared: true });
    } catch (err) {
      // ── Smart conflict resolution for watch mode ───────────────
      const errorMsg = (err as Error).message;
      if (errorMsg.includes('conflict') || errorMsg.includes('\u51b2\u7a81')) {
        await handleWatchConflicts(cfg, repoPath, agent);
      } else {
        logger.error(t('watch.syncError', { error: errorMsg }));
      }
    } finally {
      syncing = false;
    }
  }

  function onFileChange(filePath: string): void {
    if (!watchFiles.has(filePath)) return;
    logger.debug(t('watch.fileChanged', { file: filePath }));
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void triggerSync(t('watch.reasonFileChange'));
    }, DEBOUNCE_MS);
  }

  // ── Attach fs.watch() to directories ─────────────────────────
  const watchers: fs.FSWatcher[] = [];
  for (const dir of watchDirs) {
    if (!fs.existsSync(dir)) {
      logger.debug(t('watch.dirNotFound', { dir }));
      continue;
    }
    try {
      const watcher = fs.watch(dir, { persistent: true }, (_event, filename) => {
        if (!filename) return;
        const fullPath = path.join(dir, filename);
        onFileChange(fullPath);
      });
      watchers.push(watcher);
    } catch (err) {
      logger.warn(t('watch.watchError', { dir, error: (err as Error).message }));
    }
  }

  // ── Periodic remote polling ──────────────────────────────────
  const pollInterval = setInterval(() => {
    void triggerSync(t('watch.reasonPoll'));
  }, intervalMinutes * 60 * 1_000);

  // ── Graceful shutdown ────────────────────────────────────────
  function shutdown(): void {
    logger.info(t('watch.shutdown'));
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(pollInterval);
    for (const w of watchers) w.close();
    deletePidFile();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.ok(t('watch.started'));
  logger.info(t('watch.stopHint'));

  // Run an initial sync immediately
  await triggerSync(t('watch.reasonInitial'));
}

/**
 * Smart conflict resolution in watch mode (non-interactive).
 * For .md/.txt files, attempt three-way merge. If merge succeeds
 * without conflict markers, auto-push silently. If conflict markers
 * remain, log a warning and skip push for that file.
 */
async function handleWatchConflicts(
  cfg: WangchuanConfig,
  repoPath: string,
  agent?: AgentName | string,
): Promise<void> {
  const entries = syncEngine.buildFileEntries(cfg, undefined, agent);
  const keyPath = syncEngine.expandHome(cfg.keyPath);

  for (const entry of entries) {
    if (!fs.existsSync(entry.srcAbs)) continue;
    const repoAbs = path.join(repoPath, entry.repoRel);
    if (!fs.existsSync(repoAbs)) continue;

    const isTextMergeable = !entry.encrypt &&
      (entry.repoRel.endsWith('.md') || entry.repoRel.endsWith('.txt'));
    if (!isTextMergeable) continue;

    const localContent = fs.readFileSync(entry.srcAbs, 'utf-8');
    const repoContent = fs.readFileSync(repoAbs, 'utf-8');
    if (localContent === repoContent) continue;

    const baseContent = await gitEngine.showFile(repoPath, 'HEAD~1', entry.repoRel);
    if (baseContent === null) continue;

    const mergeResult = threeWayMerge(baseContent, localContent, repoContent);
    if (!mergeResult.hasConflicts) {
      fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
      logger.info(t('watch.conflictAutoMerged', { file: entry.repoRel }));
    } else {
      fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
      logger.warn(t('watch.conflictNeedsManual', { file: entry.repoRel }));
    }
  }
}
