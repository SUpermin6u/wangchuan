/**
 * prompt.ts — Interactive user confirmation / 交互式用户确认工具
 *
 * Provides single-file conflict prompt and batch conflict strategy,
 * supports TTY interactive and CI non-interactive mode (WANGCHUAN_NONINTERACTIVE=1).
 */

import readline from 'readline';

/** Conflict resolution decision for each file during pull */
export type ConflictDecision =
  | 'overwrite'     // Overwrite local / 覆盖本地
  | 'skip'          // Skip (keep local) / 跳过
  | 'overwrite_all' // Overwrite all subsequent / 覆盖全部
  | 'skip_all';     // Skip all subsequent / 跳过全部

/** Default strategy for non-interactive mode (CI) */
const NON_INTERACTIVE_DEFAULT: ConflictDecision = 'skip';

/**
 * Ask how to handle a single conflicting file.
 * When overwrite_all / skip_all is returned, caller should apply to all subsequent conflicts.
 */
export async function askConflict(repoRel: string): Promise<ConflictDecision> {
  if (process.env['WANGCHUAN_NONINTERACTIVE'] === '1' || !process.stdin.isTTY) {
    return NON_INTERACTIVE_DEFAULT;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise(resolve => {
    process.stdout.write(
      `\n  ⚡ Conflict / 冲突: ${repoRel}\n` +
      `     Local file exists and differs / 本地文件已存在且内容不同。\n` +
      `     [o] Overwrite/覆盖  [s] Skip/跳过  [A] Overwrite all/全部覆盖  [S] Skip all/全部跳过\n` +
      `  Choose / 请选择 [o/s/A/S]: `
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
