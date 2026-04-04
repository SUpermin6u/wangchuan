#!/usr/bin/env node
/**
 * wangchuan.ts — CLI entry
 *
 * Usage:
 *   wangchuan <command> [--agent openclaw|claude|gemini|codebuddy|workbuddy|cursor] [flags]
 */

import { Command } from 'commander';
import { cmdInit }   from '../src/commands/init.js';
import { cmdPull }   from '../src/commands/pull.js';
import { cmdPush }   from '../src/commands/push.js';
import { cmdStatus } from '../src/commands/status.js';
import { cmdDiff }   from '../src/commands/diff.js';
import { cmdList }   from '../src/commands/list.js';
import { cmdDump }   from '../src/commands/dump.js';
import { cmdLang }   from '../src/commands/lang.js';
import { cmdSync }   from '../src/commands/sync.js';
import { cmdWatch }  from '../src/commands/watch.js';
import { cmdEnv }    from '../src/commands/env.js';
import { logger }    from '../src/utils/logger.js';
import { t }         from '../src/i18n.js';
import type { AgentName } from '../src/types.js';
import { AGENT_NAMES } from '../src/types.js';

function parseAgent(val: string): AgentName {
  if (!(AGENT_NAMES as readonly string[]).includes(val)) {
    throw new Error(t('cli.invalidAgent', { val }));
  }
  return val as AgentName;
}

const program = new Command();

program
  .name('wangchuan')
  .description(t('cli.description'))
  .version('2.6.0');

// ── init ────────────────────────────────────────────────────────
program
  .command('init')
  .description(t('cli.cmd.init'))
  .requiredOption('-r, --repo <url>', t('cli.cmd.init.repo'))
  .option('-k, --key <master-key>', t('cli.cmd.init.key'))
  .option('--force', t('cli.cmd.init.force'), false)
  .action(async (opts: { repo: string; key?: string; force: boolean }) => {
    await run(() => cmdInit(opts));
  });

// ── pull ────────────────────────────────────────────────────────
program
  .command('pull')
  .description(t('cli.cmd.pull'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdPull(opts));
  });

// ── push ────────────────────────────────────────────────────────
program
  .command('push')
  .description(t('cli.cmd.push'))
  .option('-m, --message <msg>', t('cli.cmd.push.msg'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { message?: string; agent?: AgentName }) => {
    await run(() => cmdPush(opts));
  });

// ── status ──────────────────────────────────────────────────────
program
  .command('status')
  .description(t('cli.cmd.status'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdStatus(opts));
  });

// ── diff ────────────────────────────────────────────────────────
program
  .command('diff')
  .description(t('cli.cmd.diff'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdDiff(opts));
  });

// ── list ────────────────────────────────────────────────────────
program
  .command('list')
  .description(t('cli.cmd.list'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdList(opts));
  });

// ── dump ────────────────────────────────────────────────────────
program
  .command('dump')
  .description(t('cli.cmd.dump'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdDump(opts));
  });

// ── lang ────────────────────────────────────────────────────────
program
  .command('lang [language]')
  .description(t('cli.cmd.lang'))
  .action(async (language?: string) => {
    await run(() => cmdLang(language));
  });

// ── sync ────────────────────────────────────────────────────────
program
  .command('sync')
  .description(t('cli.cmd.sync'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdSync(opts));
  });

// ── watch ───────────────────────────────────────────────────────
program
  .command('watch')
  .description(t('cli.cmd.watch'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .option('-i, --interval <minutes>', t('cli.cmd.watch.interval'), parseFloat)
  .action(async (opts: { agent?: AgentName; interval?: number }) => {
    await run(() => cmdWatch(opts));
  });

// ── env ─────────────────────────────────────────────────────────
program
  .command('env <action> [name]')
  .description(t('cli.cmd.env'))
  .option('--from <branch>', t('cli.cmd.env.from'))
  .action(async (action: string, name: string | undefined, opts: { from?: string }) => {
    await run(() => cmdEnv({ action, name, from: opts.from }));
  });

// ── Error handler ───────────────────────────────────────────────
async function run(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error((err as Error).message);
    if (process.env['WANGCHUAN_LOG_LEVEL'] === 'debug') {
      console.error((err as Error).stack);
    }
    process.exit(1);
  }
}

program.parse(process.argv);
