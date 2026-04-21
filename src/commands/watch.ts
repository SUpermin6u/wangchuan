/**
 * watch.ts — wangchuan watch command (pull-only daemon)
 *
 * Periodically polls the remote for new commits and pulls changes
 * to local agent workspaces. Does NOT push local changes — users
 * must run `wangchuan sync` manually to push.
 *
 * Conflicts that cannot be auto-merged are recorded to
 * ~/.wangchuan/pending-conflicts.json for the next interactive session.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { config, resolveGitBranch } from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine }      from '../core/sync.js';
import { gitEngine }       from '../core/git.js';
import { threeWayMerge }   from '../core/merge.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { WatchOptions, WangchuanConfig, AgentName } from '../types.js';

const DEFAULT_INTERVAL_MINUTES = 5;
const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const PID_FILE = path.join(WANGCHUAN_DIR, 'watch.pid');
const PENDING_CONFLICTS_PATH = path.join(WANGCHUAN_DIR, 'pending-conflicts.json');

// ── Pending conflicts persistence ──────────────────────────────────

interface PendingConflict {
  readonly file: string;
  readonly detectedAt: string;
  readonly localSnippet: string;
  readonly remoteSnippet: string;
}

function savePendingConflicts(conflicts: readonly PendingConflict[]): void {
  const existing = loadPendingConflicts();
  // Deduplicate by file path (keep newest)
  const map = new Map<string, PendingConflict>();
  for (const c of existing) map.set(c.file, c);
  for (const c of conflicts) map.set(c.file, c);
  fs.mkdirSync(path.dirname(PENDING_CONFLICTS_PATH), { recursive: true });
  fs.writeFileSync(PENDING_CONFLICTS_PATH, JSON.stringify([...map.values()], null, 2), 'utf-8');
}

export function loadPendingConflicts(): PendingConflict[] {
  try {
    if (!fs.existsSync(PENDING_CONFLICTS_PATH)) return [];
    return JSON.parse(fs.readFileSync(PENDING_CONFLICTS_PATH, 'utf-8')) as PendingConflict[];
  } catch { return []; }
}

export function clearPendingConflicts(): void {
  try { if (fs.existsSync(PENDING_CONFLICTS_PATH)) fs.unlinkSync(PENDING_CONFLICTS_PATH); } catch { /* */ }
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

function timestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
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
  const branch = resolveGitBranch(cfg);
  const intervalMinutes = interval ?? DEFAULT_INTERVAL_MINUTES;
  if (agent) logger.info(t('watch.filterAgent', { agent }));
  logger.info(t('watch.interval', { minutes: intervalMinutes }));

  let pulling = false;

  async function pullFromCloud(): Promise<void> {
    if (pulling) return;
    pulling = true;
    try {
      logger.step(t('watch.triggerSync', { reason: t('watch.reasonPoll'), time: timestamp() }));

      // 1. Fetch and check if remote has new commits
      const remoteAhead = await gitEngine.fetchAndCheckRemoteAhead(repoPath, branch);
      if (remoteAhead === 0) {
        logger.debug(t('sync.remoteUpToDate'));
        return;
      }

      logger.info(t('sync.remoteAhead', { count: remoteAhead }));

      // 2. Git pull
      await gitEngine.pull(repoPath, branch);

      // 3. Restore from repo to local workspaces
      const result = await syncEngine.restoreFromRepo(cfg, agent);
      if (result.synced.length > 0) {
        logger.ok(t('sync.pullSummary', {
          count: result.synced.length,
          encrypted: result.decrypted.length,
        }));
      }

    } catch (err) {
      const errorMsg = (err as Error).message;
      if (errorMsg.includes('conflict') || errorMsg.includes('\u51b2\u7a81')) {
        await handleWatchConflicts(cfg, repoPath, agent);
      } else {
        logger.error(t('watch.syncError', { error: errorMsg }));
      }
    } finally {
      pulling = false;
    }
  }

  // ── Periodic remote polling (pull-only) ──────────────────────
  const pollInterval = setInterval(() => {
    void pullFromCloud();
  }, intervalMinutes * 60 * 1_000);

  // ── Graceful shutdown ────────────────────────────────────────
  function shutdown(): void {
    logger.info(t('watch.shutdown'));
    clearInterval(pollInterval);
    deletePidFile();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.ok(t('watch.started'));
  logger.info(t('watch.stopHint'));

  // Run an initial pull immediately
  await pullFromCloud();
}

/**
 * Non-interactive conflict resolution in watch mode.
 * For .md/.txt files, attempt three-way merge. If merge succeeds
 * without conflict markers, apply silently. If conflict markers
 * remain, record to pending-conflicts.json for the next interactive session.
 */
async function handleWatchConflicts(
  cfg: WangchuanConfig,
  repoPath: string,
  agent?: AgentName | string,
): Promise<void> {
  const entries = syncEngine.buildFileEntries(cfg, undefined, agent);
  const newConflicts: PendingConflict[] = [];

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
      // Auto-resolved — apply silently
      fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
      logger.info(t('watch.conflictAutoMerged', { file: entry.repoRel }));
    } else {
      // Cannot auto-resolve — record for next interactive session
      // Extract first conflict snippet for user context
      const localMatch = mergeResult.merged.match(/<<<<<<< LOCAL\n([\s\S]*?)=======/);
      const remoteMatch = mergeResult.merged.match(/=======\n([\s\S]*?)>>>>>>> REMOTE/);
      newConflicts.push({
        file: entry.repoRel,
        detectedAt: new Date().toISOString(),
        localSnippet: localMatch?.[1]?.trim().slice(0, 200) ?? '',
        remoteSnippet: remoteMatch?.[1]?.trim().slice(0, 200) ?? '',
      });
      logger.warn(t('watch.conflictNeedsManual', { file: entry.repoRel }));
    }
  }

  if (newConflicts.length > 0) {
    savePendingConflicts(newConflicts);
    logger.warn(t('watch.conflictsSaved', { count: newConflicts.length }));
  }
}
