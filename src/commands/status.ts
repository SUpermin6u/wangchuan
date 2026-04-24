/**
 * status.ts — wangchuan status command (enhanced)
 *
 * Default (no flag): compact one-screen summary:
 *   - Repo + branch + environment
 *   - Health score bar
 *   - "3 files changed since last sync"
 *   - Last sync timestamp
 *   - "Run `wangchuan pull` to update" hint
 *
 * --verbose / -v: full detail:
 *   - All managed files with local/repo status (from list.ts logic)
 *   - Line-level diff for changed files (from diff.ts logic)
 *   - Recent sync history (last 5)
 *   - Per-agent breakdown
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config }           from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated }   from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { cryptoEngine }    from '../core/crypto.js';
import { syncLock }        from '../core/sync-lock.js';
import { readSyncHistory } from '../core/sync-history.js';
import { validator }       from '../utils/validator.js';
import { diffText }        from '../utils/linediff.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import { AGENT_NAMES }     from '../types.js';
import type { AgentName, FileEntry, SyncTier, WangchuanConfig } from '../types.js';
import chalk from 'chalk';

export interface StatusOptions {
  readonly agent?: AgentName | undefined;
  readonly verbose?: boolean | undefined;
}

// ── Health score helpers (from health.ts) ───────────────────────

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function renderBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty  = width - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  const color  = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
  return `${color(bar)} ${score}/100`;
}

function computeFreshness(repoPath: string): number {
  const meta = syncEngine.readSyncMeta(repoPath);
  if (!meta) return 0;
  const ageMs   = Date.now() - new Date(meta.lastSyncAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return clamp(100 - ageDays * 10);
}

function computeCoverage(entries: readonly FileEntry[]): number {
  if (entries.length === 0) return 100;
  const existing = entries.filter(e => fs.existsSync(e.srcAbs)).length;
  return clamp((existing / entries.length) * 100);
}

function computeIntegrity(repoPath: string): number {
  const integrityPath = path.join(repoPath, 'integrity.json');
  if (!fs.existsSync(integrityPath)) return 100;
  let manifest: { checksums: Record<string, string> };
  try {
    manifest = JSON.parse(fs.readFileSync(integrityPath, 'utf-8')) as { checksums: Record<string, string> };
  } catch { return 100; }
  const total = Object.keys(manifest.checksums).length;
  if (total === 0) return 100;
  let passing = 0;
  for (const [repoRel, expectedHash] of Object.entries(manifest.checksums)) {
    const absPath = path.join(repoPath, repoRel);
    if (!fs.existsSync(absPath)) continue;
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
    if (actualHash === expectedHash) passing++;
  }
  return clamp((passing / total) * 100);
}

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

function computeOverall(repoPath: string, entries: readonly FileEntry[]): number {
  const freshness  = computeFreshness(repoPath);
  const coverage   = computeCoverage(entries);
  const integrity  = computeIntegrity(repoPath);
  const encryption = computeEncryption(entries);
  return clamp((freshness + coverage + integrity + encryption) / 4);
}

// ── Tier labels for list view ──────────────────────────────────

const TIER_LABELS: Record<SyncTier, string> = {
  openclaw:  'OpenClaw',
  claude:    'Claude',
  gemini:    'Gemini',
  codebuddy: 'CodeBuddy',
  workbuddy: 'WorkBuddy',
  cursor:    'Cursor',
  codex:     'Codex',
  shared:    '', // filled via t()
};

// ── Main command ────────────────────────────────────────────────

export async function cmdStatus({ agent, verbose }: StatusOptions = {}): Promise<void> {
  logger.banner(t('status.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);

  if (verbose) {
    await renderVerbose(cfg, repoPath, agent);
  } else {
    await renderCompact(cfg, repoPath, agent);
  }
}

// ── Compact view (default) ──────────────────────────────────────

async function renderCompact(cfg: WangchuanConfig, repoPath: string, agent?: AgentName): Promise<void> {
  // Header
  console.log(chalk.bold('  ' + t('status.repo')) + chalk.cyan(cfg.repo));
  console.log(chalk.bold('  ' + t('status.branch')) + chalk.yellow(resolveGitBranch(cfg)));
  console.log(chalk.bold('  ' + t('status.env')) + chalk.magenta(cfg.environment ?? 'default'));
  if (agent) console.log(chalk.bold('  ' + t('status.agent')) + chalk.cyan(agent));
  console.log();

  // Health score bar
  const entries = syncEngine.buildFileEntries(cfg, undefined, agent);
  const health = computeOverall(repoPath, entries);
  console.log(chalk.bold('  ' + t('status.healthLabel')) + renderBar(health));
  console.log();

  // Sync lock warning
  renderLockWarning();

  // Workspace diff summary
  try {
    const diff = await syncEngine.diff(cfg, agent);
    const total = diff.added.length + diff.modified.length + diff.missing.length;

    if (total === 0) {
      logger.ok('  ' + t('status.noSync'));
    } else {
      console.log(
        `  ${chalk.yellow('+')} ${diff.added.length} ${t('status.addedLabel')}  ` +
        `${chalk.yellow('~')} ${diff.modified.length} ${t('status.modifiedLabel')}  ` +
        `${chalk.red('-')} ${diff.missing.length} ${t('status.missingLabel')}`
      );
    }
  } catch (err) {
    logger.warn(t('status.diffFailed', { error: (err as Error).message }));
  }

  // Last sync
  const meta = syncEngine.readSyncMeta(repoPath);
  if (meta) {
    const ts = new Date(meta.lastSyncAt).toLocaleString();
    console.log();
    console.log(`  ${t('status.lastSync')} ${chalk.gray(ts)} ${chalk.gray(`(${meta.hostname})`)}`);
  }

  // Multi-machine info
  await renderMultiMachineInfo(repoPath);

  // Agent discovery hints
  renderDiscoveryHints(cfg);

  // Pending actions notice
  if (syncEngine.hasPendingActions()) {
    const pendingCount = syncEngine.loadPendingDistributions().length + syncEngine.loadPendingDeletions().length;
    console.log();
    logger.warn(`  ${t('sync.pendingNotice', { count: pendingCount })}`);
  }

  // Hint
  console.log();
  logger.info(`  ${t('status.syncHint')}`);
  logger.info(`  ${t('status.verboseHint')}`);
}

// ── Verbose view (--verbose) ────────────────────────────────────

async function renderVerbose(cfg: WangchuanConfig, repoPath: string, agent?: AgentName): Promise<void> {
  // Header
  console.log(chalk.bold('  ' + t('status.repo')) + chalk.cyan(cfg.repo));
  console.log(chalk.bold('  ' + t('status.local')) + repoPath);
  console.log(chalk.bold('  ' + t('status.branch')) + chalk.yellow(resolveGitBranch(cfg)));
  console.log(chalk.bold('  ' + t('status.env')) + chalk.magenta(cfg.environment ?? 'default'));
  if (agent) console.log(chalk.bold('  ' + t('status.agent')) + chalk.cyan(agent));
  console.log();

  // Sync lock warning
  renderLockWarning();

  // ── Health score ────────────────────────────────────────────
  const allEntries = syncEngine.buildFileEntries(cfg, undefined, agent);
  const freshness  = computeFreshness(repoPath);
  const coverage   = computeCoverage(allEntries);
  const integrity  = computeIntegrity(repoPath);
  const encryption = computeEncryption(allEntries);
  const overall    = clamp((freshness + coverage + integrity + encryption) / 4);

  console.log(chalk.bold(`  ${t('status.healthLabel')}`));
  console.log(`    ${t('health.freshness').padEnd(14)} ${renderBar(freshness)}`);
  console.log(`    ${t('health.coverage').padEnd(14)} ${renderBar(coverage)}`);
  console.log(`    ${t('health.integrity').padEnd(14)} ${renderBar(integrity)}`);
  console.log(`    ${t('health.encryption').padEnd(14)} ${renderBar(encryption)}`);
  console.log(chalk.bold(`    ${t('health.overall').padEnd(14)} ${renderBar(overall)}`));
  console.log();

  // ── Recent commits ─────────────────────────────────────────
  try {
    const logs = await gitEngine.log(repoPath, 3);
    if (logs.length > 0) {
      console.log(chalk.bold('  ' + t('status.recentCommits')));
      for (const c of logs) {
        const date = new Date(c.date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(
          `    ${chalk.gray(c.hash.slice(0, 7))}  ${chalk.white(c.message.slice(0, 60))}  ${chalk.gray(date)}`
        );
      }
      console.log();
    }
  } catch {
    logger.warn(t('status.cannotReadLog'));
  }

  // ── Workspace diff ─────────────────────────────────────────
  try {
    const diff = await syncEngine.diff(cfg, agent);
    const total = diff.added.length + diff.modified.length + diff.missing.length;

    if (total === 0) {
      logger.ok('  ' + t('status.noSync'));
    } else {
      console.log(chalk.bold('  ' + t('status.workspaceDiff')));
      diff.added.forEach(f    => console.log(`    ${chalk.green('+')} ${f}  ${chalk.gray(t('status.newTag'))}`));
      diff.modified.forEach(f => console.log(`    ${chalk.yellow('~')} ${f}  ${chalk.gray(t('status.modifiedTag'))}`));
      diff.missing.forEach(f  => console.log(`    ${chalk.red('-')} ${f}  ${chalk.gray(t('status.missingTag'))}`));
      console.log();
      console.log(
        `  ${chalk.yellow('+')} ${diff.added.length} ${t('status.addedLabel')}  ` +
        `${chalk.yellow('~')} ${diff.modified.length} ${t('status.modifiedLabel')}  ` +
        `${chalk.red('-')} ${diff.missing.length} ${t('status.missingLabel')}`
      );
    }

    // Conflict detection
    if (diff.modified.length > 0) {
      const meta = syncEngine.readSyncMeta(repoPath);
      if (meta) {
        const lastSyncTs = new Date(meta.lastSyncAt).getTime();
        const conflictFiles: string[] = [];
        const entries = syncEngine.buildFileEntries(cfg, undefined, agent);

        for (const repoRel of diff.modified) {
          const entry = entries.find(e => e.repoRel === repoRel);
          if (!entry || !fs.existsSync(entry.srcAbs)) continue;
          const stat = fs.statSync(entry.srcAbs);
          if (stat.mtimeMs > lastSyncTs) {
            conflictFiles.push(repoRel);
          }
        }

        if (conflictFiles.length > 0) {
          try {
            const branch = resolveGitBranch(cfg);
            const ahead = await gitEngine.fetchAndCheckRemoteAhead(repoPath, branch);
            if (ahead > 0) {
              console.log();
              console.log(chalk.bold.yellow(`  ${t('status.conflictWarning')}`));
              for (const f of conflictFiles) {
                console.log(`    ${chalk.yellow(t('status.conflictFile', { file: f }))}`);
              }
              console.log();
              logger.info(`  ${t('status.conflictHint')}`);
            }
          } catch { /* Fetch failed — skip conflict check */ }
        }
      }
    }
  } catch (err) {
    logger.warn(t('status.diffFailed', { error: (err as Error).message }));
  }

  // ── Line-level diff ────────────────────────────────────────
  console.log();
  await renderLineDiff(cfg, repoPath, agent);

  // ── File inventory (from list.ts) ──────────────────────────
  console.log();
  renderFileInventory(cfg, repoPath, agent);

  // ── Sync history (last 5) ──────────────────────────────────
  console.log();
  renderHistory(5);

  // ── Multi-machine info ────────────────────────────────────
  await renderMultiMachineInfo(repoPath);

  // ── Agent discovery hints ──────────────────────────────────
  renderDiscoveryHints(cfg);
}

// ── Shared helpers ──────────────────────────────────────────────

function renderLockWarning(): void {
  const lock = syncLock.read();
  if (!lock) return;

  let lockAlive: boolean;
  try { process.kill(lock.pid, 0); lockAlive = true; } catch { lockAlive = false; }

  if (lockAlive) {
    console.log(chalk.yellow(`  ⚠ ${t('status.lockActive', { pid: lock.pid, startedAt: lock.startedAt })}`));
  } else {
    console.log(chalk.red(`  🔴 ${t('status.lockStale', { pid: lock.pid })}`));
  }
  console.log();
}

function renderDiscoveryHints(cfg: WangchuanConfig): void {
  const profiles = cfg.profiles.default;
  const discovered: string[] = [];
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (p.enabled) continue;
    const wsPath = syncEngine.expandHome(p.workspacePath);
    if (fs.existsSync(wsPath)) {
      discovered.push(name);
    }
  }
  if (discovered.length > 0) {
    console.log();
    for (const name of discovered) {
      const p = profiles[name as AgentName];
      const wsPath = syncEngine.expandHome(p.workspacePath);
      logger.info(t('status.discoveredAgent', { name, path: wsPath }));
    }
  }
}

async function renderLineDiff(cfg: WangchuanConfig, repoPath: string, agent?: AgentName): Promise<void> {
  const keyPath  = syncEngine.expandHome(cfg.keyPath);
  const entries  = syncEngine.buildFileEntries(cfg, undefined, agent);
  let totalChanged = 0;

  for (const entry of entries) {
    const srcExists  = fs.existsSync(entry.srcAbs);
    const repoAbs    = path.join(repoPath, entry.repoRel);
    const repoExists = fs.existsSync(repoAbs);

    if (srcExists && !repoExists) {
      console.log(chalk.bold.green(`  +++ ${entry.repoRel}`) + chalk.gray('  ' + t('diff.newFile')));
      console.log();
      totalChanged++;
      continue;
    }
    if (!srcExists && repoExists) {
      console.log(chalk.bold.red(`  --- ${entry.repoRel}`) + chalk.gray('  ' + t('diff.missingFile')));
      console.log();
      totalChanged++;
      continue;
    }
    if (!srcExists && !repoExists) continue;

    const localText = fs.readFileSync(entry.srcAbs, 'utf-8');
    let repoText: string;

    if (entry.encrypt) {
      try {
        repoText = cryptoEngine.decryptString(
          fs.readFileSync(repoAbs, 'utf-8').trim(),
          keyPath,
        );
      } catch {
        console.log(chalk.yellow(`  ~ ${entry.repoRel}`) + chalk.gray('  ' + t('diff.cannotDecrypt')));
        console.log();
        totalChanged++;
        continue;
      }
    } else {
      repoText = fs.readFileSync(repoAbs, 'utf-8');
    }

    const diffLines = diffText(repoText, localText);
    if (diffLines.length === 0) continue;

    const encLabel = entry.encrypt ? chalk.gray(' [enc]') : '';
    console.log(chalk.bold(`  ~~~ ${entry.repoRel}`) + encLabel);
    for (const line of diffLines) {
      if (line.content === '...') {
        console.log(chalk.gray('      ...'));
      } else if (line.type === 'added') {
        console.log(chalk.green(`  +   ${line.content}`));
      } else if (line.type === 'removed') {
        console.log(chalk.red(`  -   ${line.content}`));
      } else {
        console.log(chalk.gray(`      ${line.content}`));
      }
    }
    console.log();
    totalChanged++;
  }

  if (totalChanged === 0) {
    logger.ok('  ' + t('diff.noDiff'));
  } else {
    logger.info('  ' + t('diff.filesDiffer', { count: totalChanged }));
  }
}

function renderFileInventory(cfg: WangchuanConfig, repoPath: string, agent?: AgentName): void {
  const entries = syncEngine.buildFileEntries(cfg, undefined, agent);

  // Group by agentName
  const groups = new Map<SyncTier, FileEntry[]>();
  for (const e of entries) {
    if (!groups.has(e.agentName)) groups.set(e.agentName, []);
    groups.get(e.agentName)!.push(e);
  }

  let totalFiles = 0;

  const order: SyncTier[] = ['shared', ...AGENT_NAMES];
  for (const tier of order) {
    const group = groups.get(tier);
    if (!group || group.length === 0) continue;

    const label = tier === 'shared' ? t('list.tierShared') : TIER_LABELS[tier];
    console.log(chalk.bold.cyan(`  ▸ ${label}`));

    for (const e of group) {
      const localExists = fs.existsSync(e.srcAbs);
      const repoExists  = fs.existsSync(`${repoPath}/${e.repoRel}`);

      const localMark = localExists ? chalk.green('✔') : chalk.red('✖');
      const repoMark  = repoExists  ? chalk.green('✔') : chalk.gray('·');
      const encLabel  = e.encrypt   ? chalk.magenta('[enc]') : '     ';
      const jsonLabel = e.jsonExtract ? chalk.yellow(t('list.fieldLabel')) : '            ';

      console.log(
        `    ${localMark} ${t('list.localLabel')}  ${repoMark} ${t('list.repoLabel')}  ${encLabel} ${jsonLabel}  ${chalk.white(e.repoRel)}`
      );
    }
    console.log();
    totalFiles += group.length;
  }

  console.log(chalk.gray(`  ${t('list.totalFiles', { count: totalFiles })}`));
  console.log(chalk.gray(`  ${t('list.legend')}`));
}

function renderHistory(limit: number): void {
  const events = readSyncHistory();
  if (events.length === 0) {
    logger.info('  ' + t('history.empty'));
    return;
  }

  const shown = events.slice(-limit).reverse();

  console.log(chalk.bold(`  ${t('status.historyLabel')}`));
  for (const ev of shown) {
    const time      = ev.timestamp.replace('T', ' ').slice(0, 19);
    const action    = ev.action.padEnd(6);
    const files     = String(ev.fileCount).padStart(3);
    const host      = ev.hostname;

    const actionColor = ev.action === 'push' ? chalk.green(action)
                      : ev.action === 'pull' ? chalk.cyan(action)
                      : chalk.yellow(action);

    console.log(`    ${chalk.white(time)}  ${actionColor}  ${files} files  ${chalk.gray(host)}`);
  }
}

/** Show multi-machine information from git log commit messages */
async function renderMultiMachineInfo(repoPath: string): Promise<void> {
  try {
    const logs = await gitEngine.log(repoPath, 20);
    const hostnames = new Set<string>();
    const hostnamePattern = /\[([^\]]+)\]\s*$/;
    for (const c of logs) {
      const match = hostnamePattern.exec(c.message);
      if (match?.[1]) hostnames.add(match[1]);
    }
    if (hostnames.size > 0) {
      const hosts = [...hostnames].join(', ');
      console.log(`  ${t('status.activeMachines', { count: hostnames.size, hosts })}`);
    }
  } catch {
    // Ignore — git log may not be available
  }
}

