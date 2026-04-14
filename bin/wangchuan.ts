#!/usr/bin/env node
/**
 * wangchuan.ts — CLI entry
 *
 * Simplified CLI surface: 9 user-facing commands.
 * Philosophy: "foolproof AI memory sync" — minimize cognitive load.
 *
 * Commands:
 *   init     — One-time setup (interactive if no --repo)
 *   sync     — Smart bidirectional sync (the ONE daily command)
 *   status   — Show sync state at a glance (--verbose for full detail)
 *   doctor   — Diagnose + auto-fix issues (always runs --fix)
 *   env      — Multi-environment management
 *   watch    — Background daemon for continuous sync
 *   memory   — Browse/copy memories across agents
 *   snapshot — Manage sync snapshots (save/list/restore/delete)
 *   lang     — Switch display language
 */

import { Command } from 'commander';
import { cmdInit }     from '../src/commands/init.js';
import { cmdStatus }   from '../src/commands/status.js';
import { cmdSync }     from '../src/commands/sync.js';
import { cmdEnv }      from '../src/commands/env.js';
import { cmdDoctor }   from '../src/commands/doctor.js';
import { cmdLang }     from '../src/commands/lang.js';
import { cmdWatch }    from '../src/commands/watch.js';
import { cmdMemory }   from '../src/commands/memory.js';
import { cmdSnapshot } from '../src/commands/snapshot.js';
import { config }    from '../src/core/config.js';
import { logger }    from '../src/utils/logger.js';
import { t }         from '../src/i18n.js';
import type { AgentName } from '../src/types.js';
import { AGENT_NAMES } from '../src/types.js';

function parseAgent(val: string): AgentName | string {
  if ((AGENT_NAMES as readonly string[]).includes(val)) {
    return val as AgentName;
  }
  // Also accept custom agent names from config
  const cfg = config.load();
  if (cfg?.customAgents && val in cfg.customAgents) {
    return val;
  }
  throw new Error(t('cli.invalidAgent', { val }));
}

const program = new Command();

program
  .name('wangchuan')
  .description(t('cli.description'))
  .version('5.7.1');

// ── init ────────────────────────────────────────────────────────
program
  .command('init')
  .description(t('cli.cmd.init'))
  .option('-r, --repo <url>', t('cli.cmd.init.repo'))
  .option('-k, --key <master-key>', t('cli.cmd.init.key'))
  .option('--force', t('cli.cmd.init.force'), false)
  .action(async (opts: { repo?: string; key?: string; force: boolean }) => {
    await run(() => cmdInit(opts));
  });

// ── sync ────────────────────────────────────────────────────────
program
  .command('sync')
  .alias('s')
  .description(t('cli.cmd.sync'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .option('-n, --dry-run', t('cli.cmd.dryRun'), false)
  .option('-o, --only <patterns...>', t('cli.cmd.sync.only'))
  .option('-x, --exclude <patterns...>', t('cli.cmd.sync.exclude'))
  .option('-y, --yes', t('cli.cmd.sync.yes'), false)
  .action(async (opts: { agent?: AgentName; dryRun?: boolean; only?: string[]; exclude?: string[]; yes?: boolean }) => {
    await run(() => cmdSync(opts));
  });

// ── status ──────────────────────────────────────────────────────
program
  .command('status')
  .alias('st')
  .description(t('cli.cmd.status'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .option('-v, --verbose', t('cli.cmd.status.verbose'), false)
  .action(async (opts: { agent?: AgentName; verbose?: boolean }) => {
    await run(() => cmdStatus(opts));
  });

// ── doctor ──────────────────────────────────────────────────────
program
  .command('doctor')
  .description(t('cli.cmd.doctor'))
  .option('--key-rotate', t('cli.cmd.doctor.keyRotate'), false)
  .option('--key-export', t('cli.cmd.doctor.keyExport'), false)
  .option('--setup', t('cli.cmd.doctor.setup'), false)
  .action(async (opts: { keyRotate?: boolean; keyExport?: boolean; setup?: boolean }) => {
    await run(() => cmdDoctor(opts));
  });

// ── env ─────────────────────────────────────────────────────────
program
  .command('env <action> [name]')
  .description(t('cli.cmd.env'))
  .option('--from <branch>', t('cli.cmd.env.from'))
  .action(async (action: string, name: string | undefined, opts: { from?: string }) => {
    await run(() => cmdEnv({ action, name, from: opts.from }));
  });

// ── watch ───────────────────────────────────────────────────────
program
  .command('watch')
  .description(t('cli.cmd.watch'))
  .option('-i, --interval <minutes>', t('cli.cmd.watch.interval'), parseFloat)
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { interval?: number; agent?: AgentName }) => {
    await run(() => cmdWatch(opts));
  });

// ── memory ──────────────────────────────────────────────────────
program
  .command('memory <action> [args...]')
  .description(t('cli.cmd.memory'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .option('--file <pattern>', t('cli.cmd.memory.file'))
  .action(async (action: string, args: string[], opts: { agent?: AgentName; file?: string }) => {
    await run(() => cmdMemory({ action, args, agent: opts.agent, file: opts.file }));
  });

// ── snapshot ──────────────────────────────────────────────────
program
  .command('snapshot <action> [name]')
  .alias('snap')
  .description(t('cli.cmd.snapshot'))
  .action(async (action: string, name?: string) => {
    await run(() => cmdSnapshot({ action, name }));
  });

// ── lang ────────────────────────────────────────────────────────
program
  .command('lang [language]')
  .description(t('cli.cmd.lang'))
  .action(async (language?: string) => {
    await run(() => cmdLang(language));
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
