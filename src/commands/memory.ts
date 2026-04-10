/**
 * memory.ts — wangchuan memory command
 *
 * Browse and copy memory/config files across agents.
 * Subcommands: list, show, copy, broadcast
 */

import fs   from 'fs';
import path from 'path';
import { config }         from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { syncEngine }     from '../core/sync.js';
import { cryptoEngine }   from '../core/crypto.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { t }              from '../i18n.js';
import { AGENT_NAMES }    from '../types.js';
import type { MemoryOptions, AgentName, WangchuanConfig, FileEntry } from '../types.js';
import chalk from 'chalk';

export async function cmdMemory({ action, args, agent, file }: MemoryOptions): Promise<void> {
  logger.banner(t('memory.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  switch (action) {
    case 'list':      return memoryList(cfg, agent);
    case 'show':      return memoryShow(cfg, args);
    case 'copy':      return memoryCopy(cfg, args, file);
    case 'broadcast': return memoryBroadcast(cfg, args, file);
    default:
      throw new Error(t('memory.unknownAction', { action }));
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/** Get syncFiles entries for a given agent (only whole-file entries, not jsonFields) */
function getAgentFileEntries(cfg: WangchuanConfig, agentName: AgentName): FileEntry[] {
  return syncEngine.buildFileEntries(cfg, undefined, agentName)
    .filter(e => e.agentName === agentName);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(mtime: Date): string {
  return mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

// ── list ──────────────────────────────────────────────────────────

function memoryList(cfg: WangchuanConfig, agent?: AgentName): void {
  const profiles = cfg.profiles.default;
  const agents = agent ? [agent] : [...AGENT_NAMES];
  let anyFound = false;

  for (const name of agents) {
    const p = profiles[name as AgentName];
    if (!p.enabled) continue;

    const entries = getAgentFileEntries(cfg, name as AgentName);
    const existing = entries.filter(e => fs.existsSync(e.srcAbs));
    if (existing.length === 0) continue;

    anyFound = true;
    console.log(chalk.bold.cyan(`  ${t('memory.list.agentHeader', { agent: name })}`));
    for (const e of existing) {
      const stat = fs.statSync(e.srcAbs);
      const size = formatSize(stat.size);
      const time = formatTime(stat.mtime);
      const fileName = path.basename(e.srcAbs);
      const encLabel = e.encrypt ? chalk.magenta(' [enc]') : '';
      console.log(`    ${chalk.white(fileName)}  ${chalk.gray(size)}  ${chalk.gray(time)}${encLabel}`);
    }
    console.log();
  }

  if (!anyFound) {
    logger.info(t('memory.list.empty'));
  }
}

// ── show ──────────────────────────────────────────────────────────

function memoryShow(cfg: WangchuanConfig, args: readonly string[]): void {
  if (args.length < 1) {
    throw new Error(t('memory.argsRequired', { action: 'show' }));
  }
  const agentName = args[0] as AgentName;

  const entries = getAgentFileEntries(cfg, agentName);

  // When no filename is provided, list available files for this agent
  if (!args[1]) {
    console.log(chalk.bold(`  ${t('memory.show.fileList', { agent: agentName })}`));
    console.log();
    if (entries.length === 0) {
      logger.info(t('memory.list.empty'));
      return;
    }
    for (const e of entries) {
      const exists = fs.existsSync(e.srcAbs);
      const statusIcon = exists ? chalk.green('\u2713') : chalk.red('\u2717');
      const statusLabel = exists ? t('memory.show.exists') : t('memory.show.missing');
      const fileName = path.basename(e.srcAbs);
      const encLabel = e.encrypt ? chalk.magenta(' [enc]') : '';
      if (exists) {
        const stat = fs.statSync(e.srcAbs);
        const size = formatSize(stat.size);
        console.log(`    ${statusIcon} ${chalk.white(fileName)}  ${chalk.gray(size)}  ${chalk.gray(statusLabel)}${encLabel}`);
      } else {
        console.log(`    ${statusIcon} ${chalk.gray(fileName)}  ${chalk.gray(statusLabel)}${encLabel}`);
      }
    }
    console.log();
    return;
  }

  const fileName = args[1]!;
  const entry = entries.find(e => path.basename(e.srcAbs) === fileName || e.repoRel.endsWith(fileName));

  if (!entry || !fs.existsSync(entry.srcAbs)) {
    // Fuzzy match: substring against basenames and repoRels
    const lowerInput = fileName.toLowerCase();
    const suggestions = entries
      .filter(e => {
        const base = path.basename(e.srcAbs).toLowerCase();
        const rel = e.repoRel.toLowerCase();
        return base.includes(lowerInput) || rel.includes(lowerInput);
      })
      .map(e => path.basename(e.srcAbs));

    if (suggestions.length > 0) {
      throw new Error(t('memory.show.fuzzyHint', {
        agent: agentName,
        file: fileName,
        suggestions: suggestions.join(', '),
      }));
    }
    throw new Error(t('memory.show.notFound', { agent: agentName, file: fileName }));
  }

  console.log(chalk.bold(`  ${t('memory.show.header', { agent: agentName, file: fileName })}`));
  console.log();

  if (entry.encrypt) {
    const keyPath = syncEngine.expandHome(cfg.keyPath);
    const repoPath = syncEngine.expandHome(cfg.localRepoPath);
    const repoAbs = path.join(repoPath, entry.repoRel);
    if (fs.existsSync(repoAbs)) {
      const decrypted = cryptoEngine.decryptString(
        fs.readFileSync(repoAbs, 'utf-8').trim(), keyPath,
      );
      console.log(decrypted);
    } else {
      // Encrypt from local source for display
      console.log(fs.readFileSync(entry.srcAbs, 'utf-8'));
    }
  } else {
    console.log(fs.readFileSync(entry.srcAbs, 'utf-8'));
  }
}

// ── copy ──────────────────────────────────────────────────────────

function memoryCopy(cfg: WangchuanConfig, args: readonly string[], filePattern?: string): void {
  if (args.length < 2) {
    throw new Error(t('memory.argsRequired', { action: 'copy' }));
  }
  const fromAgent = args[0] as AgentName;
  const toAgent   = args[1] as AgentName;

  if (fromAgent === toAgent) {
    throw new Error(t('memory.sameAgent'));
  }

  const copied = copyFiles(cfg, fromAgent, toAgent, filePattern);
  if (copied === 0) {
    logger.info(t('memory.copy.noFiles'));
  } else {
    logger.ok(t('memory.copy.done', { count: copied, from: fromAgent, to: toAgent }));
  }
}

// ── broadcast ────────────────────────────────────────────────────

function memoryBroadcast(cfg: WangchuanConfig, args: readonly string[], filePattern?: string): void {
  if (args.length < 1) {
    throw new Error(t('memory.argsRequired', { action: 'broadcast' }));
  }
  const fromAgent = args[0] as AgentName;
  const profiles = cfg.profiles.default;
  const targets: AgentName[] = [];
  let totalCopied = 0;

  for (const name of AGENT_NAMES) {
    if (name === fromAgent) continue;
    const p = profiles[name];
    if (!p.enabled) continue;
    const copied = copyFiles(cfg, fromAgent, name, filePattern);
    if (copied > 0) {
      targets.push(name);
      totalCopied += copied;
    }
  }

  if (totalCopied === 0) {
    logger.info(t('memory.copy.noFiles'));
  } else {
    logger.ok(t('memory.broadcast.done', {
      count: totalCopied,
      from: fromAgent,
      agents: targets.join(', '),
    }));
  }
}

// ── Shared copy logic ────────────────────────────────────────────

function copyFiles(
  cfg: WangchuanConfig,
  fromAgent: AgentName,
  toAgent: AgentName,
  filePattern?: string,
): number {
  const fromEntries = getAgentFileEntries(cfg, fromAgent);
  const toProfile = cfg.profiles.default[toAgent];
  const toWsPath = syncEngine.expandHome(toProfile.workspacePath);
  let copied = 0;

  for (const entry of fromEntries) {
    if (!fs.existsSync(entry.srcAbs)) continue;
    if (entry.jsonExtract) continue; // skip json field entries

    const relFile = path.relative(
      syncEngine.expandHome(cfg.profiles.default[fromAgent].workspacePath),
      entry.srcAbs,
    );
    if (filePattern && !relFile.includes(filePattern)) continue;

    const destPath = path.join(toWsPath, relFile);
    if (fs.existsSync(destPath)) {
      logger.warn(t('memory.copy.overwrite', { file: relFile }));
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(entry.srcAbs, destPath);
    copied++;
  }

  return copied;
}
