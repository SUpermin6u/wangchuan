/**
 * health.ts — wangchuan health command
 *
 * Analyzes quality and freshness of synced memories, producing a 0-100 health score.
 * Score components: Freshness, Coverage, Integrity, Encryption (each 0-100, averaged).
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { config }           from '../core/config.js';
import { ensureMigrated }   from '../core/migrate.js';
import { syncEngine }       from '../core/sync.js';
import { validator }        from '../utils/validator.js';
import { logger }           from '../utils/logger.js';
import { t }                from '../i18n.js';
import { AGENT_NAMES }      from '../types.js';
import type { AgentName, FileEntry } from '../types.js';
import chalk from 'chalk';

interface ScoreBreakdown {
  readonly freshness: number;
  readonly coverage: number;
  readonly integrity: number;
  readonly encryption: number;
  readonly overall: number;
}

interface AgentHealth {
  readonly name: string;
  readonly scores: ScoreBreakdown;
}

/** Clamp value to 0-100 */
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Render a colored bar: ██████████ 85/100 */
function renderBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty  = width - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  const color  = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
  return `${color(bar)} ${score}/100`;
}

/** Compute freshness score: 100 if synced today, -10 per day, min 0 */
function computeFreshness(repoPath: string): number {
  const meta = syncEngine.readSyncMeta(repoPath);
  if (!meta) return 0;
  const ageMs   = Date.now() - new Date(meta.lastSyncAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return clamp(100 - ageDays * 10);
}

/** Compute coverage: % of configured files that exist locally */
function computeCoverage(entries: readonly FileEntry[]): number {
  if (entries.length === 0) return 100;
  const existing = entries.filter(e => fs.existsSync(e.srcAbs)).length;
  return clamp((existing / entries.length) * 100);
}

/** Compute integrity: % of repo files passing checksum verification */
function computeIntegrity(repoPath: string): number {
  const integrityPath = path.join(repoPath, 'integrity.json');
  if (!fs.existsSync(integrityPath)) return 100;
  let manifest: { checksums: Record<string, string> };
  try {
    manifest = JSON.parse(fs.readFileSync(integrityPath, 'utf-8')) as { checksums: Record<string, string> };
  } catch {
    return 100;
  }
  const checksums = manifest.checksums;
  const total = Object.keys(checksums).length;
  if (total === 0) return 100;

  let passing = 0;
  for (const [repoRel, expectedHash] of Object.entries(checksums)) {
    const absPath = path.join(repoPath, repoRel);
    if (!fs.existsSync(absPath)) continue;
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
    if (actualHash === expectedHash) passing++;
  }
  return clamp((passing / total) * 100);
}

/** Compute encryption: % of sensitive-looking entries that are encrypted */
function computeEncryption(entries: readonly FileEntry[]): number {
  if (entries.length === 0) return 100;
  const sensitivePatterns = ['.env', 'key', 'secret', 'token', 'credential', 'password', 'mcp'];
  const sensitiveEntries = entries.filter(e =>
    sensitivePatterns.some(p => e.repoRel.toLowerCase().includes(p)),
  );
  if (sensitiveEntries.length === 0) return 100;
  const encSensitive = sensitiveEntries.filter(e => e.encrypt).length;
  return clamp((encSensitive / sensitiveEntries.length) * 100);
}

function buildScores(
  repoPath: string,
  entries: readonly FileEntry[],
  freshness: number,
): ScoreBreakdown {
  const coverage    = computeCoverage(entries);
  const integrity   = computeIntegrity(repoPath);
  const encryption  = computeEncryption(entries);
  const overall     = clamp((freshness + coverage + integrity + encryption) / 4);
  return { freshness, coverage, integrity, encryption, overall };
}

export async function cmdHealth(): Promise<void> {
  logger.banner(t('health.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath  = syncEngine.expandHome(cfg.localRepoPath);
  const freshness = computeFreshness(repoPath);
  const profiles  = cfg.profiles.default;

  // Freshness display
  const meta = syncEngine.readSyncMeta(repoPath);
  if (meta) {
    const ageMs   = Date.now() - new Date(meta.lastSyncAt).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (ageDays === 0) {
      logger.info(`  ${t('health.lastSyncToday')}`);
    } else {
      logger.info(`  ${t('health.lastSyncDaysAgo', { days: ageDays })}`);
    }
  } else {
    logger.info(`  ${t('health.noSyncHistory')}`);
  }
  console.log();

  // Per-agent scores
  const agentHealths: AgentHealth[] = [];
  console.log(chalk.bold(`  ${t('health.agentHeader')}`));

  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (!p.enabled) continue;
    const entries = syncEngine.buildFileEntries(cfg, undefined, name as AgentName);
    const scores  = buildScores(repoPath, entries, freshness);
    agentHealths.push({ name, scores });

    console.log(`    ${chalk.cyan(name.padEnd(12))} ${renderBar(scores.overall)}`);
    console.log(chalk.gray(`${''.padStart(18)}${t('health.freshness')}: ${scores.freshness}  ${t('health.coverage')}: ${scores.coverage}  ${t('health.integrity')}: ${scores.integrity}  ${t('health.encryption')}: ${scores.encryption}`));
  }

  // Overall score
  const allEntries    = syncEngine.buildFileEntries(cfg);
  const overallScores = buildScores(repoPath, allEntries, freshness);

  console.log();
  console.log(chalk.bold(`  ${t('health.overall')}:`));
  console.log(`    ${t('health.freshness').padEnd(14)} ${renderBar(overallScores.freshness)}`);
  console.log(`    ${t('health.coverage').padEnd(14)} ${renderBar(overallScores.coverage)}`);
  console.log(`    ${t('health.integrity').padEnd(14)} ${renderBar(overallScores.integrity)}`);
  console.log(`    ${t('health.encryption').padEnd(14)} ${renderBar(overallScores.encryption)}`);
  console.log();
  console.log(chalk.bold(`    ${t('health.overall').padEnd(14)} ${renderBar(overallScores.overall)}`));
}
