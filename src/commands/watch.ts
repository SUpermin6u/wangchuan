/**
 * watch.ts — wangchuan watch command (long-running daemon)
 *
 * Monitors enabled agents' workspace directories for file changes.
 * Debounces changes then auto-triggers sync. Also periodically polls
 * remote for new commits.
 */

import fs   from 'fs';
import path from 'path';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import { cmdSync }         from './sync.js';
import type { WatchOptions, WangchuanConfig, AgentName } from '../types.js';
import { AGENT_NAMES } from '../types.js';
import chalk from 'chalk';

const DEFAULT_INTERVAL_MINUTES = 5;
const DEBOUNCE_MS = 5_000;

/**
 * Collect all absolute paths that should be watched for a given config.
 * Returns a map of absPath → true for quick lookup, plus the list of
 * directories to attach fs.watch() on.
 */
function collectWatchTargets(
  cfg: WangchuanConfig,
  agent?: AgentName,
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

export async function cmdWatch({ agent, interval }: WatchOptions = {}): Promise<void> {
  logger.banner(t('watch.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const intervalMinutes = interval ?? DEFAULT_INTERVAL_MINUTES;
  if (agent) logger.info(t('watch.filterAgent', { agent: chalk.cyan(agent) }));
  logger.info(t('watch.interval', { minutes: intervalMinutes }));

  const { watchDirs, watchFiles } = collectWatchTargets(cfg, agent);

  if (watchDirs.length === 0) {
    logger.warn(t('watch.noTargets'));
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
      await cmdSync(agent ? { agent } : {});
    } catch (err) {
      logger.error(t('watch.syncError', { error: (err as Error).message }));
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
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.ok(t('watch.started'));
  logger.info(t('watch.stopHint'));

  // Run an initial sync immediately
  await triggerSync(t('watch.reasonInitial'));
}
