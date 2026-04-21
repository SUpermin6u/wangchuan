/**
 * prompt.ts — Interactive user confirmation with enhanced conflict resolution
 *
 * Provides single-file conflict prompt with:
 *   - Compact 3-line diff preview (red deletions, green additions)
 *   - File size comparison
 *   - [d] show full diff
 *   - [m] attempt three-way merge
 *   - Standard [o] overwrite / [s] skip / [A] overwrite all / [S] skip all
 *
 * Supports TTY interactive and CI non-interactive mode (WANGCHUAN_NONINTERACTIVE=1).
 */

import fs       from 'fs';
import readline from 'readline';
import chalk    from 'chalk';
import { t }    from '../i18n.js';
import { diffText } from './linediff.js';

/** Conflict resolution decision for each file during pull */
type ConflictDecision =
  | 'overwrite'     // Overwrite local
  | 'skip'          // Skip (keep local)
  | 'overwrite_all' // Overwrite all subsequent
  | 'skip_all'      // Skip all subsequent
  | 'merge';        // Attempt three-way merge

/** Default strategy for non-interactive mode (CI) */
const NON_INTERACTIVE_DEFAULT: ConflictDecision = 'skip';

/** Format file size in human-readable form */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Build a compact diff preview (first N changed lines from each side) */
function buildDiffPreview(localContent: string, remoteContent: string, maxLines = 3): string {
  const lines = diffText(localContent, remoteContent, 1);
  if (lines.length === 0) return '';

  const output: string[] = [];
  let shown = 0;
  for (const line of lines) {
    if (shown >= maxLines) break;
    if (line.type === 'removed') {
      output.push(`      ${chalk.red(`- ${line.content}`)}`);
      shown++;
    } else if (line.type === 'added') {
      output.push(`      ${chalk.green(`+ ${line.content}`)}`);
      shown++;
    }
  }

  const totalChanges = lines.filter(l => l.type !== 'context').length;
  if (totalChanges > maxLines) {
    output.push(chalk.gray(`      … ${t('prompt.moreChanges', { count: totalChanges - maxLines })}`));
  }

  return output.join('\n');
}

/** Build the full diff output */
function buildFullDiff(localContent: string, remoteContent: string): string {
  const lines = diffText(localContent, remoteContent, 3);
  if (lines.length === 0) return chalk.gray('      (identical)');

  return lines.map(line => {
    if (line.type === 'removed') return `      ${chalk.red(`- ${line.content}`)}`;
    if (line.type === 'added')   return `      ${chalk.green(`+ ${line.content}`)}`;
    return `      ${chalk.gray(`  ${line.content}`)}`;
  }).join('\n');
}

/**
 * Ask how to handle a single conflicting file.
 * When overwrite_all / skip_all is returned, caller should apply to all subsequent conflicts.
 *
 * @param localContent  Local file content (for diff preview)
 * @param remoteContent Remote file content (for diff preview)
 * @param canMerge      Whether three-way merge is available for this file
 */
export async function askConflict(
  repoRel: string,
  localContent?: string,
  remoteContent?: string,
  canMerge?: boolean,
): Promise<ConflictDecision> {
  if (process.env['WANGCHUAN_NONINTERACTIVE'] === '1' || !process.stdin.isTTY) {
    return NON_INTERACTIVE_DEFAULT;
  }

  // Build header
  let header =
    `\n  ⚡ ${t('prompt.conflict', { file: repoRel })}\n` +
    `     ${t('prompt.conflictDesc')}\n`;

  // Show file size comparison if content is available
  if (localContent !== undefined && remoteContent !== undefined) {
    const localSize  = formatSize(Buffer.byteLength(localContent, 'utf-8'));
    const remoteSize = formatSize(Buffer.byteLength(remoteContent, 'utf-8'));
    header += `     ${t('prompt.sizeCompare', { local: localSize, remote: remoteSize })}\n`;

    // Show compact diff preview
    const preview = buildDiffPreview(localContent, remoteContent);
    if (preview) {
      header += `\n${preview}\n`;
    }
  }

  // Build choices line
  const mergeChoice = canMerge ? `  [m] ${t('prompt.merge')}` : '';
  header +=
    `     ${t('prompt.conflictChoices')}` +
    `  [d] ${t('prompt.showDiff')}${mergeChoice}\n`;

  const validChoices = canMerge ? 'o/s/A/S/d/m' : 'o/s/A/S/d';

  // Interactive loop (allows 'd' to show full diff and re-prompt)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise(resolve => {
    function prompt(): void {
      process.stdout.write(header + `  ${t('prompt.choose', { choices: validChoices })}`);

      rl.once('line', (ans: string) => {
        const choice = ans.trim();

        if (choice === 'd' && localContent !== undefined && remoteContent !== undefined) {
          // Show full diff and re-prompt
          console.log();
          console.log(buildFullDiff(localContent, remoteContent));
          console.log();
          // Reset header to just choices for re-prompt
          header =
            `     ${t('prompt.conflictChoices')}` +
            `  [d] ${t('prompt.showDiff')}${mergeChoice}\n`;
          prompt();
          return;
        }

        rl.close();
        switch (choice) {
          case 'o': return resolve('overwrite');
          case 'A': return resolve('overwrite_all');
          case 'S': return resolve('skip_all');
          case 'm': return resolve(canMerge ? 'merge' : 'skip');
          case 's':
          default:  return resolve('skip');
        }
      });
    }
    prompt();
  });
}
