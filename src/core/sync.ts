/**
 * sync.ts — Core sync engine barrel module
 *
 * Re-exports from sub-modules:
 *   sync-shared.ts   — cross-agent sharing distribution
 *   sync-stage.ts    — push direction (workspace → repo)
 *   sync-restore.ts  — pull direction (repo → workspace)
 *
 * Keeps shared utilities: expandHome, ignore patterns, file entry building, diff.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { cryptoEngine } from './crypto.js';
import { jsonField }    from './json-field.js';
import { logger }       from '../utils/logger.js';
import { walkDir as walkDirBase } from '../utils/fs.js';
import { t }            from '../i18n.js';
import { isShared, resourceName, migrateExistingToRegistry } from './shared-registry.js';
import type {
  WangchuanConfig,
  FileEntry,
  DiffResult,
  AgentName,
  AgentProfile,
  CustomAgentProfile,
  FilterOptions,
} from '../types.js';
import { AGENT_NAMES } from '../types.js';

// ── Re-exports from sub-modules ────────────────────────────────────

export {
  distributeShared,
  loadPendingDeletions,
  clearPendingDeletions,
  loadPendingDistributions,
  clearPendingDistributions,
  processPendingDistributions,
  savePendingDistributions,
  hasPendingActions,
} from './sync-shared.js';

export {
  stageToRepo,
  writeSyncMeta,
  readSyncMeta,
  writeIntegrity,
  verifyIntegrity,
  writeKeyFingerprint,
  verifyKeyFingerprint,
  detectStaleFiles,
  deleteStaleFiles,
  logProgress,
  contentUnchanged,
  encryptedPlaintextUnchanged,
  readPlaintextHashes,
  loadStageProgress,
  clearStageProgress,
} from './sync-stage.js';

export type { SyncMeta, IntegrityManifest } from './sync-stage.js';

export {
  restoreFromRepo,
  backupBeforeRestore,
  rotateBackups,
} from './sync-restore.js';



// ── Shared utilities ───────────────────────────────────────────────

export function expandHome(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

// ── Ignore patterns (.wangchuanignore) ─────────────────────────────

const IGNORE_FILE = path.join(os.homedir(), '.wangchuan', '.wangchuanignore');

let cachedIgnorePatterns: string[] | undefined;

/**
 * Load ignore patterns from ~/.wangchuan/.wangchuanignore.
 * One glob per line, '#' comments and empty lines are skipped.
 */
export function loadIgnorePatterns(): string[] {
  if (cachedIgnorePatterns !== undefined) return cachedIgnorePatterns;
  if (!fs.existsSync(IGNORE_FILE)) {
    cachedIgnorePatterns = [];
    return cachedIgnorePatterns;
  }
  const lines = fs.readFileSync(IGNORE_FILE, 'utf-8').split('\n');
  cachedIgnorePatterns = lines
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
  return cachedIgnorePatterns;
}

/** Reset the cached ignore patterns (for testing) */
export function resetIgnoreCache(): void {
  cachedIgnorePatterns = undefined;
}

/**
 * Check if a relative path matches any ignore pattern.
 * Supports:
 *   - Simple globs with `*` (matches anything except `/`)
 *   - `**` matches any number of path segments (including zero)
 *   - Basename-only patterns (no `/`) match against the filename
 */
export function matchesIgnore(relPath: string, patterns: readonly string[]): boolean {
  const basename = path.basename(relPath);
  const normalized = relPath.split(path.sep).join('/');

  for (const pattern of patterns) {
    if (pattern.includes('/') || pattern.includes('**')) {
      if (globMatch(normalized, pattern)) return true;
    } else {
      if (globMatch(basename, pattern)) return true;
    }
  }
  return false;
}

/**
 * Minimal glob matcher supporting `*` (any chars except `/`) and `**` (any path segments).
 */
function globMatch(str: string, pattern: string): boolean {
  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        regex += '(?:.+/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
    } else if (pattern[i] === '*') {
      regex += '[^/]*';
      i++;
    } else if (pattern[i] === '?') {
      regex += '[^/]';
      i++;
    } else {
      regex += pattern[i]!.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  regex += '$';
  return new RegExp(regex).test(str);
}

/** Walk directory with .wangchuanignore filtering */
export function walkDir(dirAbs: string): string[] {
  const ignorePatterns = loadIgnorePatterns();
  const filter = ignorePatterns.length > 0
    ? (relPath: string) => !matchesIgnore(relPath, ignorePatterns)
    : undefined;
  return walkDirBase(dirAbs, filter);
}

/** Deduplicate by repoRel, keeping the first occurrence */
function deduplicateEntries(entries: FileEntry[]): FileEntry[] {
  const seen = new Set<string>();
  return entries.filter(e => {
    if (seen.has(e.repoRel)) return false;
    seen.add(e.repoRel);
    return true;
  });
}

// ── File entry building ────────────────────────────────────────────

/**
 * Build syncFiles + syncDirs + jsonFields entries for a given agent profile.
 */
function buildAgentEntries(
  name: AgentName | string,
  profile: AgentProfile | CustomAgentProfile,
  repoDirBase?: string,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const wsPath = expandHome(profile.workspacePath);
  const repoPrefix = `agents/${name}`;

  for (const item of profile.syncFiles) {
    const suffix = item.encrypt ? '.enc' : '';
    entries.push({
      srcAbs:    path.join(wsPath, item.src),
      repoRel:   path.join(repoPrefix, item.src + suffix),
      plainRel:  path.join(repoPrefix, item.src),
      encrypt:   item.encrypt,
      agentName: name,
    });
  }

  for (const dir of (profile.syncDirs ?? [])) {
    const scanBase = repoDirBase
      ? path.join(repoDirBase, repoPrefix, dir.src)
      : path.join(wsPath, dir.src);
    if (!fs.existsSync(scanBase)) continue;

    for (const relFile of walkDir(scanBase)) {
      const suffix    = dir.encrypt ? '.enc' : '';
      const plainFile = relFile.endsWith('.enc') ? relFile.slice(0, -4) : relFile;
      entries.push({
        srcAbs:    path.join(wsPath, dir.src, plainFile),
        repoRel:   path.join(repoPrefix, dir.src, plainFile + suffix),
        plainRel:  path.join(repoPrefix, dir.src, plainFile),
        encrypt:   dir.encrypt,
        agentName: name,
      });
    }
  }

  for (const jf of (profile.jsonFields ?? [])) {
    const suffix = jf.encrypt ? '.enc' : '';
    entries.push({
      srcAbs:    path.join(wsPath, jf.src),
      repoRel:   path.join(repoPrefix, jf.repoName + suffix),
      plainRel:  path.join(repoPrefix, jf.repoName),
      encrypt:   jf.encrypt,
      agentName: name,
      jsonExtract: {
        fields:       jf.fields,
        originalPath: path.join(wsPath, jf.src),
      },
    });
  }

  return entries;
}

/**
 * Build shared tier entries (skills, MCP templates, shared files).
 * Only includes skills/agents explicitly registered in the shared registry.
 */
function buildSharedEntries(
  cfg: WangchuanConfig,
  repoDirBase?: string,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const shared = cfg.shared;
  if (!shared) return entries;
  const profiles = cfg.profiles.default;

  // Auto-migrate existing repo shared skills to registry on first run
  if (repoDirBase) {
    migrateExistingToRegistry(repoDirBase);
  } else {
    const repoPath = expandHome(cfg.localRepoPath);
    migrateExistingToRegistry(repoPath);
  }

  for (const source of shared.skills.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const wsPath = expandHome(p.workspacePath);
    const scanBase = repoDirBase
      ? path.join(repoDirBase, 'shared', 'skills')
      : path.join(wsPath, source.dir);
    if (!fs.existsSync(scanBase)) continue;

    for (const relFile of walkDir(scanBase)) {
      if (path.basename(relFile).startsWith('.')) continue;
      // Only include files belonging to shared-registered resources
      const resName = resourceName(relFile);
      if (!isShared('skill', resName)) continue;

      entries.push({
        srcAbs:    path.join(wsPath, source.dir, relFile),
        repoRel:   path.join('shared', 'skills', relFile),
        plainRel:  path.join('shared', 'skills', relFile),
        encrypt:   false,
        agentName: 'shared',
      });
    }
  }

  for (const source of shared.mcp.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const wsPath   = expandHome(p.workspacePath);
    const srcPath  = path.join(wsPath, source.src);
    const repoName = `mcp/${source.agent}-${source.field}.json`;
    entries.push({
      srcAbs:    srcPath,
      repoRel:   path.join('shared', repoName + '.enc'),
      plainRel:  path.join('shared', repoName),
      encrypt:   true,
      agentName: 'shared',
      jsonExtract: {
        fields:       [source.field],
        originalPath: srcPath,
      },
    });
  }

  for (const item of shared.syncFiles) {
    const wsPath = expandHome(item.workspacePath);
    const suffix = item.encrypt ? '.enc' : '';
    entries.push({
      srcAbs:    path.join(wsPath, item.src),
      repoRel:   path.join('shared', item.src + suffix),
      plainRel:  path.join('shared', item.src),
      encrypt:   item.encrypt,
      agentName: 'shared',
    });
  }

  if (shared.agents) {
    for (const source of shared.agents.sources) {
      const p = profiles[source.agent];
      if (!p.enabled) continue;
      const wsPath = expandHome(p.workspacePath);
      const scanBase = repoDirBase
        ? path.join(repoDirBase, 'shared', 'agents')
        : path.join(wsPath, source.dir);
      if (!fs.existsSync(scanBase)) continue;

      for (const relFile of walkDir(scanBase)) {
        if (path.basename(relFile).startsWith('.')) continue;
        // Only include agents registered in shared registry
        const resName = resourceName(relFile);
        if (!isShared('agent', resName)) continue;

        entries.push({
          srcAbs:    path.join(wsPath, source.dir, relFile),
          repoRel:   path.join('shared', 'agents', relFile),
          plainRel:  path.join('shared', 'agents', relFile),
          encrypt:   false,
          agentName: 'shared',
        });
      }
    }
  }

  return entries;
}

/**
 * Apply --only / --exclude filtering to file entries.
 */
function applyFilter(entries: FileEntry[], filter?: FilterOptions): FileEntry[] {
  if (!filter) return entries;
  let result = entries;
  if (filter.only && filter.only.length > 0) {
    const patterns = filter.only;
    result = result.filter(e => patterns.some(p => e.repoRel.includes(p)));
  }
  if (filter.exclude && filter.exclude.length > 0) {
    const patterns = filter.exclude;
    result = result.filter(e => !patterns.some(p => e.repoRel.includes(p)));
  }
  return result;
}

/**
 * Build the list of file entries to sync (single source of truth for all sync directions).
 */
export function buildFileEntries(
  cfg: WangchuanConfig,
  repoDirBase?: string,
  agent?: AgentName | string,
  filter?: FilterOptions,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const profiles = cfg.profiles.default;

  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (!p.enabled || (agent && agent !== name)) continue;
    entries.push(...buildAgentEntries(name, p, repoDirBase));
  }

  if (cfg.customAgents) {
    for (const [name, profile] of Object.entries(cfg.customAgents)) {
      if (agent && agent !== name) continue;
      entries.push(...buildAgentEntries(name, profile, repoDirBase));
    }
  }

  if (!agent) {
    entries.push(...buildSharedEntries(cfg, repoDirBase));
  }

  return applyFilter(deduplicateEntries(entries), filter);
}

// ── Diff (stays in barrel — small, uses both stage and restore helpers) ──

async function diff(cfg: WangchuanConfig, agent?: AgentName | string, filter?: FilterOptions): Promise<DiffResult> {
  const repoPath = expandHome(cfg.localRepoPath);
  const keyPath  = expandHome(cfg.keyPath);
  const entries  = buildFileEntries(cfg, undefined, agent, filter);
  const diffResult: DiffResult = { added: [], modified: [], missing: [] };

  for (const entry of entries) {
    const srcExists  = fs.existsSync(entry.srcAbs);
    const repoExists = fs.existsSync(path.join(repoPath, entry.repoRel));

    if (!srcExists && !repoExists) continue;
    if (srcExists  && !repoExists) { (diffResult.added   as string[]).push(entry.repoRel); continue; }
    if (!srcExists && repoExists)  { (diffResult.missing  as string[]).push(entry.repoRel); continue; }

    if (entry.jsonExtract) {
      try {
        const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
        const localPartial = JSON.stringify(jsonField.extractFields(fullJson, entry.jsonExtract.fields), null, 2);

        let repoContent: string;
        if (entry.encrypt) {
          repoContent = cryptoEngine.decryptString(
            fs.readFileSync(path.join(repoPath, entry.repoRel), 'utf-8').trim(), keyPath,
          );
        } else {
          repoContent = fs.readFileSync(path.join(repoPath, entry.repoRel), 'utf-8');
        }
        if (localPartial !== repoContent) {
          (diffResult.modified as string[]).push(entry.repoRel);
        }
      } catch {
        (diffResult.modified as string[]).push(entry.repoRel);
      }
      continue;
    }

    const srcBuf  = fs.readFileSync(entry.srcAbs);
    const repoBuf = fs.readFileSync(path.join(repoPath, entry.repoRel));

    if (entry.encrypt) {
      try {
        const decrypted = cryptoEngine.decryptString(repoBuf.toString('utf-8').trim(), keyPath);
        if (srcBuf.toString('utf-8') !== decrypted) {
          (diffResult.modified as string[]).push(entry.repoRel);
        }
      } catch {
        (diffResult.modified as string[]).push(entry.repoRel);
      }
    } else {
      if (!srcBuf.equals(repoBuf)) (diffResult.modified as string[]).push(entry.repoRel);
    }
  }
  return diffResult;
}

// ── Backward-compatible syncEngine object ──────────────────────────

// Import sub-module functions for syncEngine assembly
import { stageToRepo }                from './sync-stage.js';
import { readSyncMeta }               from './sync-stage.js';
import { deleteStaleFiles }           from './sync-stage.js';
import { restoreFromRepo }            from './sync-restore.js';
import {
  loadPendingDeletions,
  clearPendingDeletions,
  loadPendingDistributions,
  clearPendingDistributions,
  processPendingDistributions,
  savePendingDistributions,
  hasPendingActions,
} from './sync-shared.js';

export const syncEngine = {
  expandHome,
  buildFileEntries,
  readSyncMeta,
  loadPendingDeletions,
  clearPendingDeletions,
  deleteStaleFiles,
  loadPendingDistributions,
  clearPendingDistributions,
  processPendingDistributions,
  savePendingDistributions,
  hasPendingActions,
  stageToRepo,
  restoreFromRepo,
  diff,
} as const;
