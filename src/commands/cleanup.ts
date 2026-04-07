/**
 * cleanup.ts — wangchuan cleanup command
 *
 * Scans all synced files and detects:
 *   - stale: not modified in >N days (default 90) — yellow warning
 *   - dormant: not modified in >2N days (default 180) — red warning
 *   - phantom: configured but file doesn't exist locally — gray
 *
 * Options:
 *   --auto   auto-disable agent profiles where all files are phantom
 *   --days   customize stale threshold (default 90)
 */

import fs   from 'fs';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { buildFileEntries, expandHome } from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import chalk               from 'chalk';
import type { AgentName, FileEntry, WangchuanConfig } from '../types.js';
import { AGENT_NAMES } from '../types.js';

export interface CleanupOptions {
  readonly agent?: AgentName | undefined;
  readonly auto?: boolean | undefined;
  readonly days?: number | undefined;
}

type FileStatus = 'ok' | 'stale' | 'dormant' | 'phantom';

interface CleanupEntry {
  readonly repoRel: string;
  readonly agentName: string;
  readonly status: FileStatus;
  readonly daysSinceModified: number | null;
}

function classifyEntry(entry: FileEntry, staleDays: number): CleanupEntry {
  if (!fs.existsSync(entry.srcAbs)) {
    return {
      repoRel: entry.repoRel,
      agentName: entry.agentName,
      status: 'phantom',
      daysSinceModified: null,
    };
  }

  const stat = fs.statSync(entry.srcAbs);
  const ageMs = Date.now() - stat.mtimeMs;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const dormantDays = staleDays * 2;

  let status: FileStatus = 'ok';
  if (ageDays >= dormantDays) {
    status = 'dormant';
  } else if (ageDays >= staleDays) {
    status = 'stale';
  }

  return {
    repoRel: entry.repoRel,
    agentName: entry.agentName,
    status,
    daysSinceModified: ageDays,
  };
}

const STATUS_ICON: Record<FileStatus, string> = {
  ok:      chalk.green('✔'),
  stale:   chalk.yellow('⚠'),
  dormant: chalk.red('●'),
  phantom: chalk.gray('◌'),
};

const STATUS_LABEL_KEY: Record<FileStatus, string> = {
  ok:      'cleanup.ok',
  stale:   'cleanup.stale',
  dormant: 'cleanup.dormant',
  phantom: 'cleanup.phantom',
};

export async function cmdCleanup(opts: CleanupOptions): Promise<void> {
  logger.banner(t('cleanup.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  if (opts.agent) {
    console.log(chalk.bold(`  ${t('cleanup.filterAgent', { agent: opts.agent })}`));
  }

  const staleDays = opts.days ?? 90;
  const entries = buildFileEntries(cfg, undefined, opts.agent);
  const classified = entries.map(e => classifyEntry(e, staleDays));

  const staleEntries   = classified.filter(e => e.status === 'stale');
  const dormantEntries = classified.filter(e => e.status === 'dormant');
  const phantomEntries = classified.filter(e => e.status === 'phantom');
  const okEntries      = classified.filter(e => e.status === 'ok');

  // Print results grouped by status
  if (phantomEntries.length > 0) {
    console.log(`\n  ${chalk.gray(chalk.bold(t('cleanup.phantomHeader')))}`);
    for (const e of phantomEntries) {
      console.log(`    ${STATUS_ICON.phantom} ${chalk.gray(e.repoRel)}`);
    }
  }

  if (dormantEntries.length > 0) {
    console.log(`\n  ${chalk.red(chalk.bold(t('cleanup.dormantHeader')))}`);
    for (const e of dormantEntries) {
      console.log(`    ${STATUS_ICON.dormant} ${chalk.white(e.repoRel)}  ${chalk.red(`${e.daysSinceModified}d`)}`);
    }
  }

  if (staleEntries.length > 0) {
    console.log(`\n  ${chalk.yellow(chalk.bold(t('cleanup.staleHeader')))}`);
    for (const e of staleEntries) {
      console.log(`    ${STATUS_ICON.stale} ${chalk.white(e.repoRel)}  ${chalk.yellow(`${e.daysSinceModified}d`)}`);
    }
  }

  // Summary
  console.log();
  console.log(`  ${t('cleanup.summary', {
    total:   classified.length,
    ok:      okEntries.length,
    stale:   staleEntries.length,
    dormant: dormantEntries.length,
    phantom: phantomEntries.length,
  })}`);

  // Auto-cleanup: disable agents where ALL files are phantom
  if (opts.auto && phantomEntries.length > 0) {
    console.log();
    const agentPhantomCounts = new Map<string, number>();
    const agentTotalCounts   = new Map<string, number>();

    for (const e of classified) {
      agentTotalCounts.set(e.agentName, (agentTotalCounts.get(e.agentName) ?? 0) + 1);
      if (e.status === 'phantom') {
        agentPhantomCounts.set(e.agentName, (agentPhantomCounts.get(e.agentName) ?? 0) + 1);
      }
    }

    const toDisable: AgentName[] = [];
    for (const name of AGENT_NAMES) {
      const total   = agentTotalCounts.get(name)   ?? 0;
      const phantom = agentPhantomCounts.get(name) ?? 0;
      if (total > 0 && phantom === total) {
        toDisable.push(name);
      }
    }

    if (toDisable.length > 0) {
      const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      const profiles = (raw['profiles'] as Record<string, Record<string, Record<string, unknown>>>)['default']!;
      for (const name of toDisable) {
        profiles[name]!['enabled'] = false;
        console.log(`  ${chalk.yellow('→')} ${t('cleanup.autoDisabled', { agent: name })}`);
      }
      config.save(raw as unknown as WangchuanConfig);
    } else {
      logger.info(t('cleanup.noAutoAction'));
    }
  }
}
