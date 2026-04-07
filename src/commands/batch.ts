/**
 * batch.ts — wangchuan batch command
 *
 * Runs multiple wangchuan commands in sequence.
 * E.g.: wangchuan batch "sync" "report --json" "health"
 * Stops on first error unless --continue-on-error is set.
 */

import { logger } from '../utils/logger.js';
import { t }      from '../i18n.js';
import chalk from 'chalk';

/** Map of command name → lazy-imported handler */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COMMAND_MAP: Record<string, () => Promise<(opts?: any) => Promise<unknown>>> = {
  pull:      async () => (await import('./pull.js')).cmdPull,
  push:      async () => (await import('./push.js')).cmdPush,
  sync:      async () => (await import('./sync.js')).cmdSync,
  status:    async () => (await import('./status.js')).cmdStatus,
  diff:      async () => (await import('./diff.js')).cmdDiff,
  list:      async () => (await import('./list.js')).cmdList,
  dump:      async () => (await import('./dump.js')).cmdDump,
  doctor:    async () => (await import('./doctor.js')).cmdDoctor,
  health:    async () => (await import('./health.js')).cmdHealth,
  report:    async () => (await import('./report.js')).cmdReport,
  summary:   async () => (await import('./summary.js')).cmdSummary,
  cleanup:   async () => (await import('./cleanup.js')).cmdCleanup,
  search:    async () => (await import('./search.js')).cmdSearch,
  changelog: async () => (await import('./changelog.js')).cmdChangelog,
};

const SUPPORTED_COMMANDS = Object.keys(COMMAND_MAP).sort();

function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export interface BatchCommandOptions {
  readonly commands: readonly string[];
  readonly continueOnError: boolean;
}

export async function cmdBatch({ commands, continueOnError }: BatchCommandOptions): Promise<void> {
  logger.banner(t('batch.banner'));

  if (commands.length === 0) {
    throw new Error(t('batch.noCommands'));
  }

  // Validate all command names upfront
  for (const cmd of commands) {
    const name = cmd.trim().split(/\s+/)[0]!;
    if (!COMMAND_MAP[name]) {
      throw new Error(t('batch.unknownCommand', { command: name, supported: SUPPORTED_COMMANDS.join(', ') }));
    }
  }

  console.log(t('batch.running', { count: commands.length }));
  console.log();

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < commands.length; i++) {
    const raw = commands[i]!.trim();
    const name = raw.split(/\s+/)[0]!;
    const startTs = formatTimestamp();

    console.log(chalk.bold(`  [${i + 1}/${commands.length}] ${chalk.cyan(raw)}  ${chalk.gray(startTs)}`));

    try {
      const handler = await COMMAND_MAP[name]!();
      await handler();
      passed++;
      const endTs = formatTimestamp();
      logger.ok(t('batch.commandDone', { command: name, time: endTs }));
    } catch (err) {
      failed++;
      logger.error(t('batch.commandFailed', { command: name, error: (err as Error).message }));

      if (!continueOnError) {
        console.log();
        logger.error(t('batch.stopped', { passed, failed, remaining: commands.length - i - 1 }));
        throw err;
      }
    }
    console.log();
  }

  // Summary
  const summary = t('batch.summary', { total: commands.length, passed, failed });
  if (failed > 0) {
    logger.warn(summary);
  } else {
    logger.ok(summary);
  }
}
