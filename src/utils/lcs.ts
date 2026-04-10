/**
 * lcs.ts — Shared Longest Common Subsequence (LCS) table builder
 *
 * Used by both linediff.ts (unified diff) and merge.ts (three-way merge).
 */

/** Build the LCS traceback table for two string arrays (iterative, O(m*n) time and space) */
export function buildLcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
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
