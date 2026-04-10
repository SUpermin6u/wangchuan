/**
 * merge.test.ts — Three-way merge module unit tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { threeWayMerge } from '../src/core/merge.js';

// ---------------------------------------------------------------------------
// 1. Fast paths
// ---------------------------------------------------------------------------

describe('threeWayMerge fast paths', () => {
  it('local === remote → returns local as-is, no conflicts', () => {
    const base = 'a\nb\nc';
    const local = 'a\nX\nc';
    const remote = 'a\nX\nc';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.merged, local);
    assert.equal(result.hasConflicts, false);
  });

  it('local === base → returns remote (only remote changed)', () => {
    const base = 'a\nb\nc';
    const local = 'a\nb\nc';
    const remote = 'a\nB\nc';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.merged, remote);
    assert.equal(result.hasConflicts, false);
  });

  it('remote === base → returns local (only local changed)', () => {
    const base = 'a\nb\nc';
    const local = 'a\nL\nc';
    const remote = 'a\nb\nc';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.merged, local);
    assert.equal(result.hasConflicts, false);
  });

  it('all three identical → returns as-is, no conflicts', () => {
    const text = 'hello\nworld';
    const result = threeWayMerge(text, text, text);
    assert.equal(result.merged, text);
    assert.equal(result.hasConflicts, false);
  });
});

// ---------------------------------------------------------------------------
// 2. Non-overlapping edits
// ---------------------------------------------------------------------------

describe('threeWayMerge non-overlapping edits', () => {
  it('local edits top, remote edits bottom → clean merge', () => {
    const base   = 'a\nb\nc\nd\ne';
    const local  = 'A\nb\nc\nd\ne';   // changed line 1
    const remote = 'a\nb\nc\nd\nE';   // changed line 5
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, 'A\nb\nc\nd\nE');
  });

  it('local inserts a line, remote edits a different line → clean merge', () => {
    const base   = 'a\nb\nc';
    const local  = 'a\nb\nINSERTED\nc';  // insertion between b and c
    const remote = 'a\nB\nc';            // edit line 2
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, false);
    // Both changes should be present
    assert.ok(result.merged.includes('B'));
    assert.ok(result.merged.includes('INSERTED'));
  });

  it('local deletes a line, remote edits a different line → clean merge', () => {
    const base   = 'a\nb\nc\nd';
    const local  = 'a\nc\nd';     // deleted line 2 (b)
    const remote = 'a\nb\nc\nD';  // edited line 4
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, false);
    assert.ok(!result.merged.includes('b'));
    assert.ok(result.merged.includes('D'));
  });
});

// ---------------------------------------------------------------------------
// 3. Identical overlapping edits → auto-resolve
// ---------------------------------------------------------------------------

describe('threeWayMerge identical overlapping edits', () => {
  it('both sides make the same edit → auto-resolved, no conflict', () => {
    const base   = 'a\nb\nc';
    const local  = 'a\nX\nc';
    const remote = 'a\nX\nc';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, 'a\nX\nc');
  });

  it('both sides delete the same line → auto-resolved', () => {
    const base   = 'a\nb\nc';
    const local  = 'a\nc';
    const remote = 'a\nc';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, 'a\nc');
  });
});

// ---------------------------------------------------------------------------
// 4. Conflicting edits → conflict markers
// ---------------------------------------------------------------------------

describe('threeWayMerge conflicting edits', () => {
  it('both sides edit the same line differently → conflict markers', () => {
    const base   = 'a\nb\nc';
    const local  = 'a\nL\nc';
    const remote = 'a\nR\nc';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, true);
    assert.ok(result.merged.includes('<<<<<<< LOCAL'));
    assert.ok(result.merged.includes('======='));
    assert.ok(result.merged.includes('>>>>>>> REMOTE'));
    assert.ok(result.merged.includes('L'));
    assert.ok(result.merged.includes('R'));
  });

  it('conflict markers are properly structured', () => {
    const base   = 'x\ny\nz';
    const local  = 'x\nLOCAL_Y\nz';
    const remote = 'x\nREMOTE_Y\nz';
    const result = threeWayMerge(base, local, remote);
    const lines = result.merged.split('\n');
    const markerStart = lines.indexOf('<<<<<<< LOCAL');
    const separator   = lines.indexOf('=======');
    const markerEnd   = lines.indexOf('>>>>>>> REMOTE');
    assert.ok(markerStart >= 0, 'should have LOCAL marker');
    assert.ok(separator > markerStart, 'separator after LOCAL marker');
    assert.ok(markerEnd > separator, 'REMOTE marker after separator');
    // Local content between LOCAL marker and separator
    const localContent = lines.slice(markerStart + 1, separator);
    assert.ok(localContent.includes('LOCAL_Y'));
    // Remote content between separator and REMOTE marker
    const remoteContent = lines.slice(separator + 1, markerEnd);
    assert.ok(remoteContent.includes('REMOTE_Y'));
  });

  it('surrounding unchanged lines are preserved around conflict', () => {
    const base   = 'first\nmiddle\nlast';
    const local  = 'first\nL\nlast';
    const remote = 'first\nR\nlast';
    const result = threeWayMerge(base, local, remote);
    const lines = result.merged.split('\n');
    assert.equal(lines[0], 'first');
    assert.equal(lines[lines.length - 1], 'last');
  });
});

// ---------------------------------------------------------------------------
// 5. Empty inputs
// ---------------------------------------------------------------------------

describe('threeWayMerge empty inputs', () => {
  it('all three empty → empty result, no conflicts', () => {
    const result = threeWayMerge('', '', '');
    assert.equal(result.merged, '');
    assert.equal(result.hasConflicts, false);
  });

  it('base empty, local and remote add identical content → auto-resolve', () => {
    const result = threeWayMerge('', 'new line', 'new line');
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, 'new line');
  });

  it('base empty, local and remote add different content → conflict', () => {
    const result = threeWayMerge('', 'local line', 'remote line');
    assert.equal(result.hasConflicts, true);
    assert.ok(result.merged.includes('<<<<<<< LOCAL'));
    assert.ok(result.merged.includes('>>>>>>> REMOTE'));
  });

  it('base has content, both local and remote are empty → auto-resolve (identical delete)', () => {
    const result = threeWayMerge('some content', '', '');
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, '');
  });

  it('base has content, only local is empty → return local (remote unchanged)', () => {
    const base = 'content';
    const result = threeWayMerge(base, '', base);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, '');
  });
});

// ---------------------------------------------------------------------------
// 6. Trailing newlines
// ---------------------------------------------------------------------------

describe('threeWayMerge trailing newlines', () => {
  it('preserves trailing newline when present in both', () => {
    const base   = 'a\nb\n';
    const local  = 'a\nL\n';
    const remote = 'a\nb\n';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, 'a\nL\n');
  });

  it('local adds trailing newline, remote unchanged → local wins', () => {
    const base   = 'a\nb';
    const local  = 'a\nb\n';
    const remote = 'a\nb';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, false);
    assert.equal(result.merged, 'a\nb\n');
  });
});

// ---------------------------------------------------------------------------
// 7. Multiple conflict regions in one merge
// ---------------------------------------------------------------------------

describe('threeWayMerge multiple conflict regions', () => {
  it('two separate conflict regions produce two sets of markers', () => {
    const base   = 'a\nb\nc\nd\ne';
    const local  = 'L1\nb\nc\nd\nL2';
    const remote = 'R1\nb\nc\nd\nR2';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, true);
    const markers = result.merged.split('\n').filter(l => l === '<<<<<<< LOCAL');
    assert.equal(markers.length, 2, 'should have two conflict regions');
  });

  it('mix of clean merge and conflict in one file', () => {
    // Line layout: a / b / c / d / e / f / g
    // local:  A / b / c / L / e / f / g   (edit a→A, edit d→L)
    // remote: a / b / c / R / e / f / G   (edit d→R, edit g→G)
    // Expected: A cleanly merged, d→conflict, G cleanly merged
    const base   = 'a\nb\nc\nd\ne\nf\ng';
    const local  = 'A\nb\nc\nL\ne\nf\ng';
    const remote = 'a\nb\nc\nR\ne\nf\nG';
    const result = threeWayMerge(base, local, remote);
    assert.equal(result.hasConflicts, true);
    const lines = result.merged.split('\n');
    // a→A should be cleanly resolved
    assert.equal(lines[0], 'A');
    // g→G should be cleanly resolved
    assert.equal(lines[lines.length - 1], 'G');
    // Only one conflict region (for d)
    const conflictCount = lines.filter(l => l === '<<<<<<< LOCAL').length;
    assert.equal(conflictCount, 1);
  });
});
