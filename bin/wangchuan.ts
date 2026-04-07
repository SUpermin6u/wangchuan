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
import { cmdHealth }     from '../src/commands/health.js';
import { cmdSearch }     from '../src/commands/search.js';
import { cmdConfigMgmt } from '../src/commands/config-mgmt.js';
import { cmdChangelog }  from '../src/commands/changelog.js';
import { cmdTag }        from '../src/commands/tag.js';
import { cmdCleanup }    from '../src/commands/cleanup.js';
import { cmdTemplate }   from '../src/commands/template.js';
import { cmdBatch }      from '../src/commands/batch.js';
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
  .version('2.20.0');

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
  .alias('down')
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
  .alias('up')
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
  .alias('st')
  .description(t('cli.cmd.status'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdStatus(opts));
  });

// ── diff ────────────────────────────────────────────────────────
program
  .command('diff')
  .alias('d')
  .description(t('cli.cmd.diff'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdDiff(opts));
  });

// ── list ────────────────────────────────────────────────────────
program
  .command('list')
  .alias('ls')
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
  .alias('s')
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
  .command('agent <action> [name] [path]')
  .description(t('cli.cmd.agent.desc'))
  .action(async (action: string, name?: string, agentPath?: string) => {
    await run(() => cmdAgent({ action, name, path: agentPath }));
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
  .alias('doc')
  .description(t('cli.cmd.doctor'))
  .option('--fix', t('cli.cmd.doctor.fix'), false)
  .action(async (opts: { fix?: boolean }) => {
    await run(() => cmdDoctor({ fix: opts.fix }));
  });

// ── history ─────────────────────────────────────────────────
program
  .command('history')
  .alias('hist')
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

// ── search ──────────────────────────────────────────────────
program
  .command('search <query>')
  .description(t('cli.cmd.search'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .option('-i, --ignore-case', t('cli.cmd.search.ignoreCase'), false)
  .option('--regex', t('cli.cmd.search.regex'), false)
  .option('-C, --context <lines>', t('cli.cmd.search.context'), parseInt)
  .action(async (query: string, opts: { agent?: AgentName; ignoreCase?: boolean; regex?: boolean; context?: number }) => {
    await run(() => cmdSearch({ query, ...opts }));
  });

// ── config export/import ────────────────────────────────────
program
  .command('config <action> [file]')
  .description(t('cli.cmd.config'))
  .action(async (action: string, file?: string) => {
    await run(() => cmdConfigMgmt({ action, file }));
  });

// ── changelog ───────────────────────────────────────────────
program
  .command('changelog')
  .description(t('cli.cmd.changelog'))
  .option('-l, --limit <n>', t('cli.cmd.changelog.limit'), parseInt)
  .action(async (opts: { limit?: number }) => {
    await run(() => cmdChangelog({ limit: opts.limit ?? 5 }));
  });

// ── tag ──────────────────────────────────────────────────────
program
  .command('tag <action> [pattern] [tags...]')
  .description(t('cli.cmd.tag'))
  .action(async (action: string, pattern?: string, tags?: string[]) => {
    await run(() => cmdTag({ action, pattern, tags: tags ?? [] }));
  });

// ── cleanup ──────────────────────────────────────────────────
program
  .command('cleanup')
  .description(t('cli.cmd.cleanup'))
  .option('-a, --agent <name>', t('cli.cmd.agent'), parseAgent)
  .option('--auto', t('cli.cmd.cleanup.auto'), false)
  .option('--days <n>', t('cli.cmd.cleanup.days'), parseInt)
  .action(async (opts: { agent?: AgentName; auto?: boolean; days?: number }) => {
    await run(() => cmdCleanup(opts));
  });

// ── template ──────────────────────────────────────────────────
program
  .command('template <action> [name]')
  .description(t('cli.cmd.template'))
  .action(async (action: string, name?: string) => {
    await run(() => cmdTemplate({ action, name }));
  });

// ── batch ─────────────────────────────────────────────────────
program
  .command('batch <commands...>')
  .description(t('cli.cmd.batch'))
  .option('--continue-on-error', t('cli.cmd.batch.continueOnError'), false)
  .action(async (commands: string[], opts: { continueOnError?: boolean }) => {
    await run(() => cmdBatch({ commands, continueOnError: opts.continueOnError ?? false }));
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
