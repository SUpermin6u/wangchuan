/**
 * history.ts — wangchuan history command
 *
 * Shows recent sync events from the local history log.
 */

import { readSyncHistory } from '../core/sync-history.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import chalk               from 'chalk';

export interface HistoryOptions {
  readonly limit?: number | undefined;
  readonly json?: boolean | undefined;
}

export async function cmdHistory({ limit = 10, json = false }: HistoryOptions = {}): Promise<void> {
  const events = readSyncHistory();

  if (json) {
    const sliced = events.slice(-limit).reverse();
    console.log(JSON.stringify(sliced, null, 2));
    return;
  }

  logger.banner(t('history.banner'));

  if (events.length === 0) {
    logger.info(t('history.empty'));
    return;
  }

  const shown = events.slice(-limit).reverse();

  console.log();
  console.log(`  ${chalk.gray(t('history.header'))}`);
  console.log(`  ${chalk.gray(t('history.separator'))}`);

  for (const ev of shown) {
    const time      = ev.timestamp.replace('T', ' ').slice(0, 19);
    const action    = ev.action.padEnd(6);
    const agent     = (ev.agent ?? '-').padEnd(10);
    const files     = String(ev.fileCount).padStart(5);
    const encrypted = String(ev.encrypted).padStart(5);
    const host      = ev.hostname;

    const actionColor = ev.action === 'push' ? chalk.green(action)
                      : ev.action === 'pull' ? chalk.cyan(action)
                      : chalk.yellow(action);

    console.log(`  ${chalk.white(time)}  ${actionColor}  ${agent}  ${files}  ${encrypted}      ${chalk.gray(host)}`);
  }
  console.log();
}
