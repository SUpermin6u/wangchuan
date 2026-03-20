/**
 * prompt.ts — Interactive user confirmation
 *
 * Provides single-file conflict prompt and batch conflict strategy,
 * supports TTY interactive and CI non-interactive mode (WANGCHUAN_NONINTERACTIVE=1).
 */

import readline from 'readline';
import { t } from '../i18n.js';

/** Conflict resolution decision for each file during pull */
export type ConflictDecision =
  | 'overwrite'     // Overwrite local
  | 'skip'          // Skip (keep local)
  | 'overwrite_all' // Overwrite all subsequent
  | 'skip_all';     // Skip all subsequent

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
      `\n  ⚡ ${t('prompt.conflict', { file: repoRel })}\n` +
      `     ${t('prompt.conflictDesc')}\n` +
      `     ${t('prompt.conflictChoices')}\n` +
      `  ${t('prompt.choose')}`
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
