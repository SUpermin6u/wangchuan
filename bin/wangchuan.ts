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
import { cmdAgent }  from '../src/commands/agent.js';
import { cmdKey }    from '../src/commands/key.js';
import { cmdReport } from '../src/commands/report.js';
import { cmdDoctor } from '../src/commands/doctor.js';
import { cmdHistory } from '../src/commands/history.js';
import { cmdSnapshot } from '../src/commands/snapshot.js';
import { cmdSummary } from '../src/commands/summary.js';
import { cmdSetup }   from '../src/commands/setup.js';
import { cmdHealth }  from '../src/commands/health.js';
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

function parseCommaSeparated(val: string): string[] {
  return val.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

const program = new Command();

program
  .name('wangchuan')
  .description(t('cli.description'))
  .version('2.15.0');

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
  .option('-o, --only <patterns>', t('cli.cmd.only'), parseCommaSeparated)
  .option('-x, --exclude <patterns>', t('cli.cmd.exclude'), parseCommaSeparated)
  .action(async (opts: { agent?: AgentName; only?: string[]; exclude?: string[] }) => {
    await run(() => cmdPull(opts));
  });

// ── push ────────────────────────────────────────────────────────
program
  .command('push')
  .description(t('cli.cmd.push'))
  .option('-m, --message <msg>', t('cli.cmd.push.msg'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .option('-n, --dry-run', t('cli.cmd.dryRun'), false)
  .option('-o, --only <patterns>', t('cli.cmd.only'), parseCommaSeparated)
  .option('-x, --exclude <patterns>', t('cli.cmd.exclude'), parseCommaSeparated)
  .action(async (opts: { message?: string; agent?: AgentName; dryRun?: boolean; only?: string[]; exclude?: string[] }) => {
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
  .option('-n, --dry-run', t('cli.cmd.dryRun'), false)
  .option('-o, --only <patterns>', t('cli.cmd.only'), parseCommaSeparated)
  .option('-x, --exclude <patterns>', t('cli.cmd.exclude'), parseCommaSeparated)
  .action(async (opts: { agent?: AgentName; dryRun?: boolean; only?: string[]; exclude?: string[] }) => {
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

// ── agent ───────────────────────────────────────────────────
program
  .command('agent <action> [name]')
  .description(t('cli.cmd.agent.desc'))
  .action(async (action: string, name?: string) => {
    await run(() => cmdAgent({ action, name }));
  });

// ── key ─────────────────────────────────────────────────────
program
  .command('key <action> [hex]')
  .description(t('cli.cmd.key.desc'))
  .action(async (action: string, hex?: string) => {
    await run(() => cmdKey({ action, hex }));
  });

// ── report ──────────────────────────────────────────────────
program
  .command('report')
  .description(t('cli.cmd.report'))
  .option('--json', t('cli.cmd.report.json'), false)
  .action(async (opts: { json: boolean }) => {
    await run(() => cmdReport(opts));
  });

// ── doctor ──────────────────────────────────────────────────
program
  .command('doctor')
  .description(t('cli.cmd.doctor'))
  .action(async () => {
    await run(() => cmdDoctor());
  });

// ── history ─────────────────────────────────────────────────
program
  .command('history')
  .description(t('cli.cmd.history'))
  .option('-l, --limit <n>', t('cli.cmd.history.limit'), parseInt)
  .option('--json', t('cli.cmd.history.json'), false)
  .action(async (opts: { limit?: number; json?: boolean }) => {
    await run(() => cmdHistory({ limit: opts.limit ?? 10, json: opts.json }));
  });

// ── snapshot ──────────────────────────────────────────────────
program
  .command('snapshot <action> [name]')
  .description(t('cli.cmd.snapshot'))
  .option('-l, --limit <n>', t('cli.cmd.snapshot.limit'), parseInt)
  .action(async (action: string, name?: string, opts?: { limit?: number }) => {
    await run(() => cmdSnapshot({ action, name, maxSnapshots: opts?.limit }));
  });

// ── summary ─────────────────────────────────────────────────
program
  .command('summary')
  .description(t('cli.cmd.summary'))
  .option('--json', t('cli.cmd.summary.json'), false)
  .action(async (opts: { json: boolean }) => {
    await run(() => cmdSummary(opts));
  });

// ── setup ───────────────────────────────────────────────────
program
  .command('setup')
  .description(t('cli.cmd.setup'))
  .action(async () => {
    await run(() => cmdSetup());
  });

// ── health ──────────────────────────────────────────────────
program
  .command('health')
  .description(t('cli.cmd.health'))
  .action(async () => {
    await run(() => cmdHealth());
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
