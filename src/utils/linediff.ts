/**
 * linediff.ts — 行级 unified diff 工具（无外部依赖）
 *
 * 实现最长公共子序列（LCS）算法，输出人类可读的 unified diff 格式。
 */

export interface DiffLine {
  readonly type: 'context' | 'added' | 'removed';
  readonly content: string;
}

export interface FileDiff {
  readonly repoRel: string;
  readonly isEncrypted: boolean;
  readonly lines: readonly DiffLine[];
  /** 两侧完全相同 */
  readonly unchanged: boolean;
}

/** 计算两个字符串数组的 LCS 回溯表 */
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

/** 从 LCS 回溯表生成 diff 行列表 */
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
 * 对两段文本进行行级 diff，返回 DiffLine 列表。
 * context 参数控制保留多少行上下文（默认 3 行）。
 */
export function diffText(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp = buildLcsTable(a, b);
  const all: DiffLine[] = [];
  traceback(dp, a, b, a.length, b.length, all);

  // 裁剪掉纯 context 区块中间的大段无变化行，只保留 context 行
  const changed = all.map((l, i) => (l.type !== 'context' ? i : -1)).filter(i => i >= 0);
  if (changed.length === 0) return [];  // 完全相同

  const keepIdx = new Set<number>();
  for (const ci of changed) {
    for (let d = -context; d <= context; d++) {
      const idx = ci + d;
      if (idx >= 0 && idx < all.length) keepIdx.add(idx);
    }
  }

  // 插入 "..." 省略标记（用 context 行表示）
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
