/**
 * sync-lock.test.ts — syncLock unit tests
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'fs';
import os     from 'os';
import path   from 'path';
import { execSync } from 'child_process';
import { syncLock } from '../src/core/sync-lock.js';

const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-test-lock-'));

// Create a bare repo + work clone so acquire() has a valid repoPath for cleanDirtyState
const BARE = path.join(TMP, 'bare.git');
const REPO = path.join(TMP, 'repo');
execSync(`git init --bare "${BARE}"`);
// Use a seed clone to create initial commit, then re-clone for REPO
const SEED = path.join(TMP, 'seed');
execSync(`git clone "${BARE}" "${SEED}"`);
execSync('git config user.name "Test"', { cwd: SEED });
execSync('git config user.email "test@test.com"', { cwd: SEED });
fs.writeFileSync(path.join(SEED, 'init.txt'), 'seed');
execSync('git add . && git commit -m "seed"', { cwd: SEED });
// Push to whatever default branch was created
const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: SEED, encoding: 'utf-8' }).trim();
execSync(`git push origin ${branch}`, { cwd: SEED });
// Clone fresh for test use
execSync(`git clone "${BARE}" "${REPO}"`);

after(() => {
  // Always clean up lock to avoid polluting the real ~/.wangchuan/
  syncLock.release();
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('syncLock.acquire + release', () => {
  it('basic cycle: lock file created then deleted', async () => {
    await syncLock.acquire(REPO);
    assert.ok(fs.existsSync(syncLock.lockPath), 'lock file should exist after acquire');
    syncLock.release();
    assert.ok(!fs.existsSync(syncLock.lockPath), 'lock file should be gone after release');
  });
});

describe('syncLock.exists', () => {
  it('returns true when lock present', async () => {
    await syncLock.acquire(REPO);
    assert.equal(syncLock.exists(), true);
    syncLock.release();
  });

  it('returns false when absent', () => {
    assert.equal(syncLock.exists(), false);
  });
});

describe('syncLock.read', () => {
  it('returns parsed lock with pid and startedAt', async () => {
    await syncLock.acquire(REPO);
    const lock = syncLock.read();
    assert.ok(lock !== null);
    assert.equal(lock!.pid, process.pid);
    assert.ok(typeof lock!.startedAt === 'string');
    syncLock.release();
  });

  it('returns null for corrupt lock file', () => {
    // Write garbage to the lock path
    fs.mkdirSync(path.dirname(syncLock.lockPath), { recursive: true });
    fs.writeFileSync(syncLock.lockPath, '{{{not json', 'utf-8');
    const lock = syncLock.read();
    assert.equal(lock, null);
    fs.unlinkSync(syncLock.lockPath);
  });
});

describe('syncLock.acquire stale detection', () => {
  it('cleans stale lock from dead PID', async () => {
    // Write a lock with a PID that almost certainly does not exist
    fs.mkdirSync(path.dirname(syncLock.lockPath), { recursive: true });
    fs.writeFileSync(syncLock.lockPath, JSON.stringify({
      startedAt: new Date().toISOString(),
      pid: 999999,
    }), 'utf-8');

    // acquire should detect dead PID and succeed
    await syncLock.acquire(REPO);
    assert.ok(syncLock.exists());
    const lock = syncLock.read();
    assert.equal(lock!.pid, process.pid);
    syncLock.release();
  });

  it('throws when live PID holds lock', async () => {
    await syncLock.acquire(REPO);
    // Attempting a second acquire with live PID should throw
    await assert.rejects(
      () => syncLock.acquire(REPO),
      (err: Error) => {
        assert.ok(err.message.includes(String(process.pid)));
        return true;
      },
    );
    syncLock.release();
  });
});
