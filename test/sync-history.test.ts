/**
 * sync-history.test.ts — Tests for sync-history and ignore patterns
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { readSyncHistory, appendSyncEvent } from '../src/core/sync-history.js';
import type { SyncEvent } from '../src/core/sync-history.js';
import { matchesIgnore } from '../src/core/sync.js';

// ── Test fixtures ────────────────────────────────────────────────────

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-history-'));

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function mkEvent(overrides?: Partial<SyncEvent>): SyncEvent {
  return {
    timestamp:   new Date().toISOString(),
    action:      'push',
    environment: 'default',
    fileCount:   5,
    encrypted:   2,
    hostname:    'test-host',
    ...overrides,
  };
}

// ── sync-history tests ───────────────────────────────────────────────

describe('sync-history', () => {
  it('appendSyncEvent + readSyncHistory round-trip', () => {
    const historyPath = path.join(TMP, 'history-roundtrip.json');
    const event = mkEvent({ action: 'pull', fileCount: 10 });

    appendSyncEvent(event, historyPath);
    const events = readSyncHistory(historyPath);

    assert.equal(events.length, 1);
    assert.equal(events[0]!.action, 'pull');
    assert.equal(events[0]!.fileCount, 10);
    assert.equal(events[0]!.hostname, 'test-host');
  });

  it('multiple appends accumulate in order', () => {
    const historyPath = path.join(TMP, 'history-multi.json');

    appendSyncEvent(mkEvent({ action: 'push', fileCount: 1 }), historyPath);
    appendSyncEvent(mkEvent({ action: 'pull', fileCount: 2 }), historyPath);
    appendSyncEvent(mkEvent({ action: 'sync', fileCount: 3 }), historyPath);

    const events = readSyncHistory(historyPath);
    assert.equal(events.length, 3);
    assert.equal(events[0]!.action, 'push');
    assert.equal(events[1]!.action, 'pull');
    assert.equal(events[2]!.action, 'sync');
  });

  it('FIFO rotation: 105 events → only 100 remain', () => {
    const historyPath = path.join(TMP, 'history-fifo.json');

    for (let i = 0; i < 105; i++) {
      appendSyncEvent(mkEvent({ fileCount: i }), historyPath);
    }

    const events = readSyncHistory(historyPath);
    assert.equal(events.length, 100);
    // First event should be the 6th one (index 5), since first 5 were evicted
    assert.equal(events[0]!.fileCount, 5);
    // Last event should be index 104
    assert.equal(events[99]!.fileCount, 104);
  });

  it('readSyncHistory returns empty array for missing file', () => {
    const events = readSyncHistory(path.join(TMP, 'nonexistent.json'));
    assert.deepStrictEqual(events, []);
  });

  it('readSyncHistory returns empty array for corrupted file', () => {
    const historyPath = path.join(TMP, 'history-corrupt.json');
    fs.writeFileSync(historyPath, '{ not valid json array!!!', 'utf-8');
    const events = readSyncHistory(historyPath);
    assert.deepStrictEqual(events, []);
  });

  it('optional fields (agent, sha) round-trip correctly', () => {
    const historyPath = path.join(TMP, 'history-optional.json');
    appendSyncEvent(mkEvent({ agent: 'claude', sha: 'abc123' }), historyPath);

    const events = readSyncHistory(historyPath);
    assert.equal(events[0]!.agent, 'claude');
    assert.equal(events[0]!.sha, 'abc123');
  });
});

// ── matchesIgnore tests ──────────────────────────────────────────────

describe('matchesIgnore', () => {
  it('matches simple wildcard pattern against basename', () => {
    assert.ok(matchesIgnore('some/dir/file.tmp', ['*.tmp']));
    assert.ok(matchesIgnore('file.log', ['*.log']));
    assert.ok(!matchesIgnore('file.md', ['*.tmp']));
  });

  it('matches exact filename pattern', () => {
    assert.ok(matchesIgnore('some/path/.DS_Store', ['.DS_Store']));
    assert.ok(!matchesIgnore('some/path/file.txt', ['.DS_Store']));
  });

  it('matches ** patterns against full relative path', () => {
    assert.ok(matchesIgnore('a/node_modules/pkg/index.js', ['**/node_modules/**']));
    assert.ok(matchesIgnore('node_modules/pkg/index.js', ['**/node_modules/**']));
    assert.ok(!matchesIgnore('a/other/pkg/index.js', ['**/node_modules/**']));
  });

  it('matches path patterns with /', () => {
    assert.ok(matchesIgnore('build/output.js', ['build/*.js']));
    assert.ok(!matchesIgnore('src/output.js', ['build/*.js']));
  });

  it('returns false for empty patterns list', () => {
    assert.ok(!matchesIgnore('anything.txt', []));
  });

  it('matches multiple patterns (any match → true)', () => {
    const patterns = ['*.tmp', '*.log', '.DS_Store'];
    assert.ok(matchesIgnore('debug.log', patterns));
    assert.ok(matchesIgnore('cache.tmp', patterns));
    assert.ok(matchesIgnore('.DS_Store', patterns));
    assert.ok(!matchesIgnore('readme.md', patterns));
  });
});
