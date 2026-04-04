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
