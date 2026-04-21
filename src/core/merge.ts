/**
 * merge.ts — Three-way merge for plain text files
 *
 * Uses the shared LCS algorithm from utils/lcs.ts to compute diffs between
 * base-local and base-remote, then merges non-overlapping changes
 * and inserts conflict markers for overlapping edits.
 */

import { buildLcsTable } from '../utils/lcs.js';

interface MergeResult {
  readonly merged: string;
  readonly hasConflicts: boolean;
}

/** Represents a contiguous edit region in a diff */
interface EditRegion {
  readonly baseStart: number;
  readonly baseEnd: number;       // exclusive
  readonly lines: readonly string[];
}

/**
 * Extract edit regions: contiguous stretches where the modified text
 * differs from the base. Returns regions sorted by baseStart.
 */
function extractEdits(base: readonly string[], modified: readonly string[]): EditRegion[] {
  const dp = buildLcsTable(base, modified);
  // Traceback iteratively to build alignment
  const alignment: Array<{ baseIdx: number; modIdx: number; type: 'match' | 'del' | 'add' }> = [];
  let i = base.length;
  let j = modified.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && base[i - 1] === modified[j - 1]) {
      alignment.push({ baseIdx: i - 1, modIdx: j - 1, type: 'match' });
      i--; j--;
    } else if (i > 0 && (j === 0 || dp[i - 1]![j]! >= dp[i]![j - 1]!)) {
      alignment.push({ baseIdx: i - 1, modIdx: -1, type: 'del' });
      i--;
    } else {
      alignment.push({ baseIdx: -1, modIdx: j - 1, type: 'add' });
      j--;
    }
  }
  alignment.reverse();

  // Group consecutive non-match entries into edit regions
  const regions: EditRegion[] = [];
  let idx = 0;
  while (idx < alignment.length) {
    const a = alignment[idx]!;
    if (a.type === 'match') {
      idx++;
      continue;
    }
    // Start of an edit region — find its base range and replacement lines
    let baseStart = Infinity;
    let baseEnd = -1;
    const lines: string[] = [];

    while (idx < alignment.length && alignment[idx]!.type !== 'match') {
      const cur = alignment[idx]!;
      if (cur.type === 'del') {
        if (cur.baseIdx < baseStart) baseStart = cur.baseIdx;
        if (cur.baseIdx + 1 > baseEnd) baseEnd = cur.baseIdx + 1;
      }
      if (cur.type === 'add') {
        lines.push(modified[cur.modIdx]!);
      }
      idx++;
    }
    // If only adds (insertion), anchor at the current base position
    if (baseStart === Infinity) {
      // Find the base position from the previous match
      const prevMatch = alignment.slice(0, idx).reverse().find(x => x.type === 'match');
      baseStart = prevMatch ? prevMatch.baseIdx + 1 : 0;
      baseEnd = baseStart;
    }
    regions.push({ baseStart, baseEnd, lines });
  }
  return regions;
}

/**
 * Check if two edit regions overlap (they touch the same base lines).
 */
function overlaps(a: EditRegion, b: EditRegion): boolean {
  // Pure insertions at the same point also overlap
  if (a.baseStart === a.baseEnd && b.baseStart === b.baseEnd) {
    return a.baseStart === b.baseStart;
  }
  return a.baseStart < b.baseEnd && b.baseStart < a.baseEnd;
}

/**
 * Three-way merge: given a common base, local changes, and remote changes,
 * produce a merged result. Auto-resolves non-overlapping edits; inserts
 * conflict markers for overlapping regions.
 */
export function threeWayMerge(base: string, local: string, remote: string): MergeResult {
  // Fast paths
  if (local === remote) return { merged: local, hasConflicts: false };
  if (local === base)   return { merged: remote, hasConflicts: false };
  if (remote === base)  return { merged: local, hasConflicts: false };

  const baseLines = base.split('\n');
  const localEdits = extractEdits(baseLines, local.split('\n'));
  const remoteEdits = extractEdits(baseLines, remote.split('\n'));

  // Build a combined list of edit events
  // Each event either applies cleanly or creates a conflict
  type MergeEvent =
    | { type: 'local'; region: EditRegion }
    | { type: 'remote'; region: EditRegion }
    | { type: 'conflict'; local: EditRegion; remote: EditRegion };

  const events: MergeEvent[] = [];
  let li = 0;
  let ri = 0;

  while (li < localEdits.length && ri < remoteEdits.length) {
    const le = localEdits[li]!;
    const re = remoteEdits[ri]!;

    if (overlaps(le, re)) {
      // Both sides edited the same region
      // If both made identical changes, auto-resolve
      if (le.lines.join('\n') === re.lines.join('\n') &&
          le.baseStart === re.baseStart && le.baseEnd === re.baseEnd) {
        events.push({ type: 'local', region: le });
      } else {
        events.push({ type: 'conflict', local: le, remote: re });
      }
      li++; ri++;
    } else if (le.baseStart <= re.baseStart) {
      events.push({ type: 'local', region: le });
      li++;
    } else {
      events.push({ type: 'remote', region: re });
      ri++;
    }
  }
  while (li < localEdits.length) {
    events.push({ type: 'local', region: localEdits[li]! });
    li++;
  }
  while (ri < remoteEdits.length) {
    events.push({ type: 'remote', region: remoteEdits[ri]! });
    ri++;
  }

  // Apply events to base, building the merged output
  const output: string[] = [];
  let baseIdx = 0;
  let hasConflicts = false;

  for (const event of events) {
    if (event.type === 'local' || event.type === 'remote') {
      const region = event.region;
      // Copy base lines before this region
      while (baseIdx < region.baseStart) {
        output.push(baseLines[baseIdx]!);
        baseIdx++;
      }
      // Apply the edit
      output.push(...region.lines);
      baseIdx = region.baseEnd;
    } else {
      // Conflict — use the wider range
      const start = Math.min(event.local.baseStart, event.remote.baseStart);
      const end = Math.max(event.local.baseEnd, event.remote.baseEnd);
      while (baseIdx < start) {
        output.push(baseLines[baseIdx]!);
        baseIdx++;
      }
      output.push('<<<<<<< LOCAL');
      output.push(...event.local.lines);
      output.push('=======');
      output.push(...event.remote.lines);
      output.push('>>>>>>> REMOTE');
      baseIdx = end;
      hasConflicts = true;
    }
  }

  // Remaining base lines after all edits
  while (baseIdx < baseLines.length) {
    output.push(baseLines[baseIdx]!);
    baseIdx++;
  }

  return { merged: output.join('\n'), hasConflicts };
}
