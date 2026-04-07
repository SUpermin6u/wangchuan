/**
 * report.ts — wangchuan report command
 *
 * Generates a human-readable summary of the current sync state.
 * Supports plain text (default) and JSON (--json) output.
 */

import fs from 'fs';
import { config }           from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated }   from '../core/migrate.js';
import { syncEngine }       from '../core/sync.js';
import { readSyncHistory }  from '../core/sync-history.js';
import type { SyncEvent }   from '../core/sync-history.js';
import { validator }        from '../utils/validator.js';
import { logger }           from '../utils/logger.js';
import { t }                from '../i18n.js';
import { AGENT_NAMES }      from '../types.js';
import type { AgentName }   from '../types.js';
import chalk from 'chalk';

export interface ReportOptions {
  readonly json?: boolean;
}

interface AgentReport {
  readonly name: string;
  readonly enabled: boolean;
  readonly fileCount: number;
  readonly encryptedCount: number;
  readonly plaintextCount: number;
  readonly localExists: number;
  readonly repoExists: number;
}

interface ReportData {
  readonly repo: string;
  readonly branch: string;
  readonly environment: string;
  readonly hostname: string;
  readonly lastSyncAt: string | null;
  readonly lastSyncHost: string | null;
  readonly lastSyncEnv: string | null;
  readonly agents: readonly AgentReport[];
  readonly totalFiles: number;
  readonly totalEncrypted: number;
  readonly totalPlaintext: number;
  readonly localOnlyFiles: readonly string[];
  readonly missingFiles: readonly string[];
  readonly syncStats: SyncStats | null;
}

interface SyncStats {
  readonly totalSyncs: number;
  readonly pushCount: number;
  readonly pullCount: number;
  readonly syncCount: number;
  readonly avgFilesPerSync: number;
  readonly mostActiveAgent: string | null;
  readonly mostActiveAgentFiles: number;
  readonly last7DaysSparkline: string;
}

/** Build a 7-day activity sparkline from sync events */
function buildSparkline(events: readonly SyncEvent[]): string {
  const BARS = '▁▂▃▄▅▆▇█';
  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = new Array<number>(7).fill(0);

  for (const ev of events) {
    const age = now - new Date(ev.timestamp).getTime();
    const dayIdx = Math.floor(age / msPerDay);
    if (dayIdx >= 0 && dayIdx < 7) {
      days[6 - dayIdx]! += ev.fileCount; // index 0 = 6 days ago, 6 = today
    }
  }

  const max = Math.max(...days, 1);
  return days.map(d => BARS[Math.round((d / max) * (BARS.length - 1))]!).join('');
}

function buildSyncStats(events: readonly SyncEvent[]): SyncStats | null {
  if (events.length === 0) return null;

  const pushCount = events.filter(e => e.action === 'push').length;
  const pullCount = events.filter(e => e.action === 'pull').length;
  const syncCount = events.filter(e => e.action === 'sync').length;
  const totalFiles = events.reduce((sum, e) => sum + e.fileCount, 0);
  const avgFilesPerSync = Math.round((totalFiles / events.length) * 10) / 10;

  // Most active agent by file count
  const agentFiles = new Map<string, number>();
  for (const ev of events) {
    const agent = ev.agent ?? 'all';
    agentFiles.set(agent, (agentFiles.get(agent) ?? 0) + ev.fileCount);
  }
  let mostActiveAgent: string | null = null;
  let mostActiveAgentFiles = 0;
  for (const [agent, count] of agentFiles) {
    if (count > mostActiveAgentFiles) {
      mostActiveAgent = agent;
      mostActiveAgentFiles = count;
    }
  }

  return {
    totalSyncs: events.length,
    pushCount,
    pullCount,
    syncCount,
    avgFilesPerSync,
    mostActiveAgent,
    mostActiveAgentFiles,
    last7DaysSparkline: buildSparkline(events),
  };
}

function gatherReport(cfg: import('../types.js').WangchuanConfig): ReportData {
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const profiles = cfg.profiles.default;

  // Gather per-agent stats
  const agents: AgentReport[] = [];
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    const entries = syncEngine.buildFileEntries(cfg, undefined, name as AgentName);
    let encrypted = 0;
    let plaintext = 0;
    let localExists = 0;
    let repoExists = 0;
    for (const e of entries) {
      if (e.encrypt) encrypted++; else plaintext++;
      if (fs.existsSync(e.srcAbs)) localExists++;
      if (fs.existsSync(`${repoPath}/${e.repoRel}`)) repoExists++;
    }
    agents.push({
      name,
      enabled: p.enabled,
      fileCount: entries.length,
      encryptedCount: encrypted,
      plaintextCount: plaintext,
      localExists,
      repoExists,
    });
  }

  // Totals (including shared)
  const allEntries = syncEngine.buildFileEntries(cfg);
  let totalEncrypted = 0;
  let totalPlaintext = 0;
  const localOnlyFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const e of allEntries) {
    if (e.encrypt) totalEncrypted++; else totalPlaintext++;
    const localEx = fs.existsSync(e.srcAbs);
    const repoEx  = fs.existsSync(`${repoPath}/${e.repoRel}`);
    if (localEx && !repoEx) localOnlyFiles.push(e.repoRel);
    if (!localEx && repoEx) missingFiles.push(e.repoRel);
  }

  // Sync meta
  const meta = syncEngine.readSyncMeta(repoPath);

  // Sync statistics from history
  const history = readSyncHistory();
  const syncStats = buildSyncStats(history);

  return {
    repo: cfg.repo,
    branch: resolveGitBranch(cfg),
    environment: cfg.environment ?? 'default',
    hostname: cfg.hostname,
    lastSyncAt:   meta?.lastSyncAt ?? null,
    lastSyncHost: meta?.hostname ?? null,
    lastSyncEnv:  meta?.environment ?? null,
    agents,
    totalFiles: allEntries.length,
    totalEncrypted,
    totalPlaintext,
    localOnlyFiles,
    missingFiles,
    syncStats,
  };
}

function printText(data: ReportData): void {
  console.log(chalk.bold(`  ${t('report.repo')}`) + chalk.cyan(data.repo));
  console.log(chalk.bold(`  ${t('report.branch')}`) + chalk.yellow(data.branch));
  console.log(chalk.bold(`  ${t('report.env')}`) + chalk.magenta(data.environment));
  console.log(chalk.bold(`  ${t('report.host')}`) + data.hostname);
  console.log();

  // Last sync
  if (data.lastSyncAt) {
    const ts = new Date(data.lastSyncAt).toLocaleString();
    console.log(chalk.bold(`  ${t('report.lastSync')}`) + `${ts} ${chalk.gray(`(${data.lastSyncHost}, ${data.lastSyncEnv})`)}`);
  } else {
    console.log(chalk.bold(`  ${t('report.lastSync')}`) + chalk.gray(t('report.noSync')));
  }
  console.log();

  // Agent table
  console.log(chalk.bold(`  ${t('report.agentsHeader')}`));
  console.log(chalk.gray(`    ${'Name'.padEnd(12)} ${'Status'.padEnd(10)} ${'Files'.padEnd(7)} ${'Enc'.padEnd(5)} ${'Plain'.padEnd(7)} ${'Local'.padEnd(7)} Repo`));
  for (const a of data.agents) {
    const status = a.enabled ? chalk.green('on') : chalk.gray('off');
    console.log(
      `    ${a.name.padEnd(12)} ${(a.enabled ? 'on' : 'off').padEnd(10)} ${String(a.fileCount).padEnd(7)} ${String(a.encryptedCount).padEnd(5)} ${String(a.plaintextCount).padEnd(7)} ${String(a.localExists).padEnd(7)} ${a.repoExists}`
    );
  }
  console.log();

  // Totals
  console.log(chalk.bold(`  ${t('report.totalFiles', { count: data.totalFiles })}`) +
    ` (${data.totalEncrypted} ${t('report.encrypted')}, ${data.totalPlaintext} ${t('report.plaintext')})`);

  // Local-only / missing
  if (data.localOnlyFiles.length > 0) {
    console.log();
    console.log(chalk.yellow(`  ${t('report.localOnly', { count: data.localOnlyFiles.length })}`));
    for (const f of data.localOnlyFiles) {
      console.log(`    ${chalk.yellow('+')} ${f}`);
    }
  }
  if (data.missingFiles.length > 0) {
    console.log();
    console.log(chalk.red(`  ${t('report.missing', { count: data.missingFiles.length })}`));
    for (const f of data.missingFiles) {
      console.log(`    ${chalk.red('-')} ${f}`);
    }
  }

  // Sync Statistics
  if (data.syncStats) {
    console.log();
    console.log(chalk.bold(`  ${t('report.statsHeader')}`));
    console.log(`    ${t('report.statsTotalSyncs', {
      total: data.syncStats.totalSyncs,
      push:  data.syncStats.pushCount,
      pull:  data.syncStats.pullCount,
      sync:  data.syncStats.syncCount,
    })}`);
    console.log(`    ${t('report.statsAvgFiles', { avg: data.syncStats.avgFilesPerSync })}`);
    if (data.syncStats.mostActiveAgent) {
      console.log(`    ${t('report.statsMostActive', {
        agent: data.syncStats.mostActiveAgent,
        count: data.syncStats.mostActiveAgentFiles,
      })}`);
    }
    console.log(`    ${t('report.statsLast7Days', { sparkline: data.syncStats.last7DaysSparkline })}`);
  }
}

export async function cmdReport({ json = false }: ReportOptions = {}): Promise<void> {
  if (!json) logger.banner(t('report.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const data = gatherReport(cfg);

  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    printText(data);
  }
}
