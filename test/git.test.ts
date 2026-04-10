/**
 * git.test.ts — gitEngine unit tests using a local bare repo (no network)
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'fs';
import os     from 'os';
import path   from 'path';
import { execSync } from 'child_process';
import { gitEngine } from '../src/core/git.js';

const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-test-git-'));
const BARE = path.join(TMP, 'bare.git');
const WORK = path.join(TMP, 'work');

// Initialize a bare repo with an initial commit so default branch exists
execSync(`git init --bare --initial-branch=main "${BARE}"`);
const SEED = path.join(TMP, 'seed');
execSync(`git clone "${BARE}" "${SEED}"`);
execSync('git config user.name "Test"', { cwd: SEED });
execSync('git config user.email "test@test.com"', { cwd: SEED });
fs.writeFileSync(path.join(SEED, 'init.txt'), 'seed');
execSync('git add . && git commit -m "seed" && git push origin main', { cwd: SEED });

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('gitEngine.cloneOrFetch', () => {
  it('clones from bare repo, .git exists', async () => {
    await gitEngine.cloneOrFetch(BARE, WORK, 'main');
    assert.ok(fs.existsSync(path.join(WORK, '.git')));
  });

  it('second call (idempotent fetch) succeeds', async () => {
    await gitEngine.cloneOrFetch(BARE, WORK, 'main');
    assert.ok(fs.existsSync(path.join(WORK, '.git')));
  });
});

describe('gitEngine.commitAndPush', () => {
  it('creates file, commits, returns committed: true', async () => {
    execSync('git config user.name "Test"', { cwd: WORK });
    execSync('git config user.email "test@test.com"', { cwd: WORK });
    fs.writeFileSync(path.join(WORK, 'hello.txt'), 'world');
    const result = await gitEngine.commitAndPush(WORK, 'add hello', 'main');
    assert.equal(result.committed, true);
    assert.equal(result.pushed, true);
    assert.ok(result.sha);
  });

  it('no changes returns committed: false', async () => {
    const result = await gitEngine.commitAndPush(WORK, 'noop', 'main');
    assert.equal(result.committed, false);
    assert.equal(result.pushed, false);
  });
});

describe('gitEngine.status', () => {
  it('returns status for valid repo', async () => {
    const st = await gitEngine.status(WORK);
    assert.ok(st !== null);
    assert.ok('isClean' in st);
  });

  it('returns null for non-repo dir', async () => {
    const st = await gitEngine.status(TMP);
    assert.equal(st, null);
  });
});

describe('gitEngine.log', () => {
  it('returns commits after creating some', async () => {
    const logs = await gitEngine.log(WORK);
    assert.ok(logs.length >= 2); // seed + hello
  });
});

describe('gitEngine.currentBranch', () => {
  it('returns correct branch name', async () => {
    const branch = await gitEngine.currentBranch(WORK);
    assert.equal(branch, 'main');
  });
});

describe('gitEngine.showFile', () => {
  it('reads file at HEAD', async () => {
    const content = await gitEngine.showFile(WORK, 'HEAD', 'hello.txt');
    assert.equal(content, 'world');
  });

  it('returns null for missing ref', async () => {
    const content = await gitEngine.showFile(WORK, 'HEAD', 'nope.txt');
    assert.equal(content, null);
  });
});

describe('gitEngine.isGitAvailable', () => {
  it('returns true', async () => {
    const ok = await gitEngine.isGitAvailable();
    assert.equal(ok, true);
  });
});
