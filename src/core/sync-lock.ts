/**
 * sync-lock.ts — Prevents concurrent sync operations and enables dirty-state recovery
 *
 * Before sync: writes sync-lock.json with { startedAt, pid }.
 * On completion: deletes the lock.
 * On next sync: if lock exists and PID is dead, cleans dirty state and removes lock.
 * If PID is alive, refuses sync.
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { logger } from '../utils/logger.js';
import { t }      from '../i18n.js';

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const LOCK_PATH     = path.join(WANGCHUAN_DIR, 'sync-lock.json');

interface SyncLock {
  readonly startedAt: string;
  readonly pid: number;
}

/** Check if a process with the given PID is still running */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read the lock file, return null if not found or invalid */
function readLock(): SyncLock | null {
  if (!fs.existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8')) as SyncLock;
  } catch {
    // Corrupt lock file — treat as stale
    return null;
  }
}

export const syncLock = {
  lockPath: LOCK_PATH,

  /**
   * Acquire the sync lock. Throws if another sync is running.
   * If a stale lock from a dead process is found, cleans up first.
   *
   * @param repoPath Path to local git repo (for dirty state cleanup)
   */
  async acquire(repoPath: string): Promise<void> {
    const existing = readLock();
    if (existing) {
      if (isPidAlive(existing.pid)) {
        throw new Error(t('syncLock.anotherRunning', { pid: existing.pid }));
      }
      // Stale lock — dead process, clean up
      logger.warn(t('syncLock.staleLock', { pid: existing.pid }));
      await this.cleanDirtyState(repoPath);
      this.release();
    }

    const lock: SyncLock = {
      startedAt: new Date().toISOString(),
      pid: process.pid,
    };
    fs.mkdirSync(WANGCHUAN_DIR, { recursive: true });
    try {
      // Atomic exclusive create — prevents race condition between concurrent processes
      fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2), { encoding: 'utf-8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        // Another process acquired the lock between our read and write
        const raceWinner = readLock();
        if (raceWinner && isPidAlive(raceWinner.pid)) {
          throw new Error(t('syncLock.anotherRunning', { pid: raceWinner.pid }));
        }
        // Stale — clean up and retry once
        await this.cleanDirtyState(repoPath);
        fs.unlinkSync(LOCK_PATH);
        fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2), { encoding: 'utf-8', flag: 'wx' });
      } else {
        throw err;
      }
    }
    logger.trace(t('syncLock.acquired'));
  },

  /** Release the sync lock */
  release(): void {
    if (fs.existsSync(LOCK_PATH)) {
      fs.unlinkSync(LOCK_PATH);
      logger.trace(t('syncLock.released'));
    }
  },

  /** Check if a lock file exists (for doctor command) */
  exists(): boolean {
    return fs.existsSync(LOCK_PATH);
  },

  /** Read the current lock (for doctor command) */
  read(): SyncLock | null {
    return readLock();
  },

  /** Clean dirty git state from a failed sync */
  async cleanDirtyState(repoPath: string): Promise<void> {
    if (!fs.existsSync(path.join(repoPath, '.git'))) return;
    try {
      const { simpleGit } = await import('simple-git');
      const git = simpleGit(repoPath);
      await git.reset(['--hard']);
      logger.info(t('syncLock.cleanedDirtyState'));
    } catch (err) {
      logger.warn(t('syncLock.cleanFailed', { error: (err as Error).message }));
    }
  },
} as const;
