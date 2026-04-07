/**
 * summary.ts — wangchuan summary command
 *
 * Shows memory footprint: per-agent breakdown, shared tier stats,
 * encryption ratio, and most recently modified files.
 */

import fs   from 'fs';
import path from 'path';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import { AGENT_NAMES }     from '../types.js';
import type { AgentName, FileEntry } from '../types.js';
import chalk from 'chalk';

export interface SummaryOptions {
  readonly json?: boolean;
}

interface AgentBreakdown {
  readonly name: string;
  readonly fileCount: number;
  readonly totalSize: number;
  readonly lastModified: string | null;
}

interface SummaryData {
  readonly agents: readonly AgentBreakdown[];
  readonly sharedSkillsCount: number;
  readonly sharedMcpCount: number;
  readonly encryptedCount: number;
  readonly plaintextCount: number;
  readonly totalFiles: number;
  readonly totalSize: number;
  readonly recentFiles: readonly RecentFile[];
}

interface RecentFile {
  readonly repoRel: string;
  readonly mtime: string;
  readonly size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileStat(filePath: string): { size: number; mtime: Date } | null {
  try {
    const stat = fs.statSync(filePath);
    return { size: stat.size, mtime: stat.mtimeMs ? new Date(stat.mtimeMs) : stat.mtime };
  } catch {
    return null;
  }
}

function gatherSummary(cfg: import('../types.js').WangchuanConfig): SummaryData {
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const profiles = cfg.profiles.default;

  // Per-agent breakdown
  const agents: AgentBreakdown[] = [];
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (!p.enabled) continue;
    const entries = syncEngine.buildFileEntries(cfg, undefined, name as AgentName);
    let totalSize = 0;
    let latestMtime: Date | null = null;

    for (const e of entries) {
      const stat = getFileStat(e.srcAbs);
      if (stat) {
        totalSize += stat.size;
        if (!latestMtime || stat.mtime > latestMtime) latestMtime = stat.mtime;
      }
    }

    agents.push({
      name,
      fileCount: entries.length,
      totalSize,
      lastModified: latestMtime?.toISOString() ?? null,
    });
  }

  // All entries for totals
  const allEntries = syncEngine.buildFileEntries(cfg);
  let encryptedCount = 0;
  let plaintextCount = 0;
  let totalSize = 0;

  // Collect mtime info for recent files
  const fileInfos: Array<{ entry: FileEntry; mtime: Date; size: number }> = [];

  for (const e of allEntries) {
    if (e.encrypt) encryptedCount++; else plaintextCount++;
    const stat = getFileStat(e.srcAbs);
    if (stat) {
      totalSize += stat.size;
      fileInfos.push({ entry: e, mtime: stat.mtime, size: stat.size });
    }
  }

  // Top 5 recently modified
  fileInfos.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  const recentFiles: RecentFile[] = fileInfos.slice(0, 5).map(f => ({
    repoRel: f.entry.repoRel,
    mtime: f.mtime.toISOString(),
    size: f.size,
  }));

  // Shared tier stats
  let sharedSkillsCount = 0;
  let sharedMcpCount = 0;
  for (const e of allEntries) {
    if (e.agentName === 'shared') {
      if (e.repoRel.includes('skills/')) sharedSkillsCount++;
      else if (e.repoRel.includes('mcp/')) sharedMcpCount++;
    }
  }

  return {
    agents,
    sharedSkillsCount,
    sharedMcpCount,
    encryptedCount,
    plaintextCount,
    totalFiles: allEntries.length,
    totalSize,
    recentFiles,
  };
}

function printText(data: SummaryData): void {
  // Per-agent breakdown
  console.log(chalk.bold(`  ${t('summary.agentsHeader')}`));
  console.log(chalk.gray(`    ${'Agent'.padEnd(12)} ${'Files'.padEnd(7)} ${'Size'.padEnd(10)} ${'Last Modified'}`));
  for (const a of data.agents) {
    const modified = a.lastModified
      ? new Date(a.lastModified).toLocaleDateString()
      : chalk.gray('-');
    console.log(
      `    ${a.name.padEnd(12)} ${String(a.fileCount).padEnd(7)} ${formatSize(a.totalSize).padEnd(10)} ${modified}`,
    );
  }
  console.log();

  // Shared tier
  console.log(chalk.bold(`  ${t('summary.sharedHeader')}`));
  console.log(`    ${t('summary.skills')}: ${data.sharedSkillsCount}`);
  console.log(`    ${t('summary.mcpServers')}: ${data.sharedMcpCount}`);
  console.log();

  // Encryption ratio
  const ratio = data.totalFiles > 0
    ? Math.round((data.encryptedCount / data.totalFiles) * 100)
    : 0;
  console.log(chalk.bold(`  ${t('summary.encryption')}`));
  console.log(`    ${data.encryptedCount} ${t('summary.encrypted')} / ${data.plaintextCount} ${t('summary.plaintext')} (${ratio}% ${t('summary.encryptedRatio')})`);
  console.log(`    ${t('summary.totalSize')}: ${formatSize(data.totalSize)}`);
  console.log();

  // Recent files
  if (data.recentFiles.length > 0) {
    console.log(chalk.bold(`  ${t('summary.recentHeader')}`));
    for (const f of data.recentFiles) {
      const date = new Date(f.mtime).toLocaleString();
      console.log(`    ${chalk.cyan(f.repoRel)}  ${chalk.gray(formatSize(f.size))}  ${chalk.gray(date)}`);
    }
  }
}

export async function cmdSummary({ json = false }: SummaryOptions = {}): Promise<void> {
  if (!json) logger.banner(t('summary.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const data = gatherSummary(cfg);

  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    printText(data);
  }
}
