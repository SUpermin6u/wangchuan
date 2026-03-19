/**
 * prompt.ts — 交互式用户确认工具
 *
 * 提供单文件冲突提示和批量冲突策略选择，
 * 支持 TTY 交互和 CI 非交互模式（环境变量 WANGCHUAN_NONINTERACTIVE=1）。
 */

import readline from 'readline';

/** pull 时每个冲突文件的处理决策 */
export type ConflictDecision =
  | 'overwrite'     // 覆盖本地
  | 'skip'          // 跳过（保留本地）
  | 'overwrite_all' // 覆盖全部后续冲突
  | 'skip_all';     // 跳过全部后续冲突

/** 非交互模式的默认策略（CI 环境） */
const NON_INTERACTIVE_DEFAULT: ConflictDecision = 'skip';

/**
 * 询问单个冲突文件的处理方式。
 * 返回 overwrite_all / skip_all 时，调用方应将该策略用于后续所有冲突。
 */
export async function askConflict(repoRel: string): Promise<ConflictDecision> {
  // 非交互模式（CI / pipe）
  if (process.env['WANGCHUAN_NONINTERACTIVE'] === '1' || !process.stdin.isTTY) {
    return NON_INTERACTIVE_DEFAULT;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise(resolve => {
    process.stdout.write(
      `\n  ⚡ 冲突: ${repoRel}\n` +
      `     本地文件已存在且内容不同。\n` +
      `     [o] 覆盖本地  [s] 跳过(保留本地)  [A] 全部覆盖  [S] 全部跳过\n` +
      `  请选择 [o/s/A/S]: `
    );

    rl.once('line', (ans: string) => {
      rl.close();
      switch (ans.trim()) {
        case 'o': return resolve('overwrite');
        case 'A': return resolve('overwrite_all');
        case 'S': return resolve('skip_all');
        case 's':
        default:  return resolve('skip');
      }
    });
  });
}
