/**
 * linediff.ts — Line-level unified diff tool (no external dependencies)
 *
 * Implements the Longest Common Subsequence (LCS) algorithm,
 * outputs human-readable unified diff format.
 */

export interface DiffLine {
  readonly type: 'context' | 'added' | 'removed';
  readonly content: string;
}

export interface FileDiff {
  readonly repoRel: string;
  readonly isEncrypted: boolean;
  readonly lines: readonly DiffLine[];
  /** Both sides are completely identical */
  readonly unchanged: boolean;
}

/** Build the LCS traceback table for two string arrays */
function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? (dp[i - 1]![j - 1]! + 1)
        : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

/** Generate diff line list from the LCS traceback table */
function traceback(
  dp: number[][],
  a: string[],
  b: string[],
  i: number,
  j: number,
  out: DiffLine[],
): void {
  if (i === 0 && j === 0) return;
  if (i === 0) {
    traceback(dp, a, b, 0, j - 1, out);
    out.push({ type: 'added', content: b[j - 1]! });
  } else if (j === 0) {
    traceback(dp, a, b, i - 1, 0, out);
    out.push({ type: 'removed', content: a[i - 1]! });
  } else if (a[i - 1] === b[j - 1]) {
    traceback(dp, a, b, i - 1, j - 1, out);
    out.push({ type: 'context', content: a[i - 1]! });
  } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
    traceback(dp, a, b, i - 1, j, out);
    out.push({ type: 'removed', content: a[i - 1]! });
  } else {
    traceback(dp, a, b, i, j - 1, out);
    out.push({ type: 'added', content: b[j - 1]! });
  }
}

/**
 * Perform line-level diff on two texts, return a DiffLine list.
 * The context parameter controls how many context lines to preserve (default: 3).
 */
export function diffText(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp = buildLcsTable(a, b);
  const all: DiffLine[] = [];
  traceback(dp, a, b, a.length, b.length, all);

  // Trim large unchanged-context blocks in the middle, keeping only context lines
  const changed = all.map((l, i) => (l.type !== 'context' ? i : -1)).filter(i => i >= 0);
  if (changed.length === 0) return [];  // completely identical

  const keepIdx = new Set<number>();
  for (const ci of changed) {
    for (let d = -context; d <= context; d++) {
      const idx = ci + d;
      if (idx >= 0 && idx < all.length) keepIdx.add(idx);
    }
  }

  // Insert "..." omission markers (as context lines)
  const result: DiffLine[] = [];
  let prevKept = -1;
  const sorted = [...keepIdx].sort((a, b) => a - b);
  for (const idx of sorted) {
    if (prevKept >= 0 && idx - prevKept > 1) {
      result.push({ type: 'context', content: '...' });
    }
    result.push(all[idx]!);
    prevKept = idx;
  }
  return result;
}
