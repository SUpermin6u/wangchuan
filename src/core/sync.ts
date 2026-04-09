/**
 * sync.ts — Core sync engine
 *
 * Three directions:
 *   stageToRepo      workspace → local repo directory (pre-push staging)
 *   restoreFromRepo  local repo directory → workspace (post-pull restore)
 *   diff             compare both sides, return diff summary
 *
 * Supports two-tier sync:
 *   shared   — cross-agent sharing (skills, MCP templates, shared memory)
 *   agents/* — per-agent cross-environment sync
 *
 * All methods accept an optional agent filter parameter to operate on a specific agent's files only.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import crypto from 'crypto';
import { cryptoEngine } from './crypto.js';
import { jsonField }    from './json-field.js';
import { validator }    from '../utils/validator.js';
import { logger }       from '../utils/logger.js';
import { askConflict }  from '../utils/prompt.js';
import { threeWayMerge } from './merge.js';
import { gitEngine }    from './git.js';
import { t }            from '../i18n.js';
import chalk            from 'chalk';
import type {
  WangchuanConfig,
  FileEntry,
  StageResult,
  RestoreResult,
  DiffResult,
  AgentName,
  AgentProfile,
  FilterOptions,
} from '../types.js';
import { AGENT_NAMES } from '../types.js';

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
  // Normalize to forward slashes for matching
  const normalized = relPath.split(path.sep).join('/');

  for (const pattern of patterns) {
    if (pattern.includes('/') || pattern.includes('**')) {
      // Path pattern — match against the full relative path
      if (globMatch(normalized, pattern)) return true;
    } else {
      // Basename-only pattern — match against filename
      if (globMatch(basename, pattern)) return true;
    }
  }
  return false;
}

/**
 * Minimal glob matcher supporting `*` (any chars except `/`) and `**` (any path segments).
 * Converts the glob to a regex for matching.
 */
function globMatch(str: string, pattern: string): boolean {
  // Build regex from glob pattern
  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      // ** matches any path segments
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
      // Escape regex special chars
      regex += pattern[i]!.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  regex += '$';
  return new RegExp(regex).test(str);
}

function walkDir(dirAbs: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dirAbs)) return results;
  const ignorePatterns = loadIgnorePatterns();
  function walk(subPath: string): void {
    const full = path.join(dirAbs, subPath);
    if (fs.statSync(full).isDirectory()) {
      fs.readdirSync(full).forEach(f => walk(path.join(subPath, f)));
    } else {
      if (ignorePatterns.length > 0 && matchesIgnore(subPath, ignorePatterns)) return;
      results.push(subPath);
    }
  }
  fs.readdirSync(dirAbs).forEach(f => walk(f));
  return results;
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

/** Log a colorized progress line for stage/restore operations */
function logProgress(
  index: number,
  total: number,
  tag: 'enc' | 'field' | 'decrypted' | 'copy',
  filePath: string,
): void {
  const counter = chalk.gray(`[${index}/${total}]`);
  const tagColors: Record<string, string> = {
    enc:       chalk.magenta(t('sync.progress.enc')),
    field:     chalk.yellow(t('sync.progress.field')),
    decrypted: chalk.cyan(t('sync.progress.decrypted')),
    copy:      chalk.white(t('sync.progress.copy')),
  };
  const coloredTag = tagColors[tag] ?? tag;
  logger.info(`  ${counter} ${coloredTag} ${chalk.white(filePath)}`);
}

/**
 * Build syncFiles + syncDirs + jsonFields entries for a given agent profile.
 */
function buildAgentEntries(
  name: AgentName,
  profile: AgentProfile,
  repoDirBase?: string,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const wsPath = expandHome(profile.workspacePath);
  const repoPrefix = `agents/${name}`;

  // syncFiles
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

  // syncDirs
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

  // jsonFields — field-level JSON extraction
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
 */
function buildSharedEntries(
  cfg: WangchuanConfig,
  repoDirBase?: string,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const shared = cfg.shared;
  if (!shared) return entries;
  const profiles = cfg.profiles.default;

  // ── shared skills: multi-source aggregation ────────────────
  for (const source of shared.skills.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const wsPath = expandHome(p.workspacePath);
    const scanBase = repoDirBase
      ? path.join(repoDirBase, 'shared', 'skills')
      : path.join(wsPath, source.dir);
    if (!fs.existsSync(scanBase)) continue;

    for (const relFile of walkDir(scanBase)) {
      // Skip system files like .DS_Store
      if (path.basename(relFile).startsWith('.')) continue;
      entries.push({
        srcAbs:    path.join(wsPath, source.dir, relFile),
        repoRel:   path.join('shared', 'skills', relFile),
        plainRel:  path.join('shared', 'skills', relFile),
        encrypt:   false,
        agentName: 'shared',
      });
    }
  }

  // ── shared MCP: extract mcpServers from each agent's JSON ──
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

  // ── shared syncFiles ───────────────────────────────────────
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

  return entries;
}

/**
 * Apply --only / --exclude filtering to file entries.
 * --only: keep entries whose repoRel contains any of the patterns (substring match)
 * --exclude: drop entries whose repoRel contains any of the patterns
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
 *
 * @param repoDirBase  Pass local repo root to scan syncDirs from repo side (pull direction)
 * @param agent        Only return entries for specified agent, undefined = all
 * @param filter       Optional --only / --exclude filtering
 */
export function buildFileEntries(
  cfg: WangchuanConfig,
  repoDirBase?: string,
  agent?: AgentName,
  filter?: FilterOptions,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const profiles = cfg.profiles.default;

  // per-agent entries
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (!p.enabled || (agent && agent !== name)) continue;
    entries.push(...buildAgentEntries(name, p, repoDirBase));
  }

  // shared entries (excluded when --agent filter is active, since shared belongs to no single agent)
  if (!agent) {
    entries.push(...buildSharedEntries(cfg, repoDirBase));
  }

  return applyFilter(deduplicateEntries(entries), filter);
}

/**
 * Distribute shared content (skills, MCP configs) to each agent's local directory.
 * Called before push to ensure all agents have the latest shared resources.
 */
function distributeShared(cfg: WangchuanConfig): void {
  const shared = cfg.shared;
  if (!shared) return;
  const profiles = cfg.profiles.default;

  // ── Distribute skills: collect from each source, only add skills the target is missing ──
  // Collect each agent's current skill set
  const agentSkills = new Map<string, Map<string, string>>(); // agent → relPath → absPath
  for (const source of shared.skills.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const skillsDir = path.join(expandHome(p.workspacePath), source.dir);
    const skills = new Map<string, string>();
    if (fs.existsSync(skillsDir)) {
      for (const relFile of walkDir(skillsDir)) {
        if (path.basename(relFile).startsWith('.')) continue;
        skills.set(relFile, path.join(skillsDir, relFile));
      }
    }
    agentSkills.set(source.agent, skills);
  }

  // Merge all agents' skills — for each relPath, pick the NEWEST version (latest mtime)
  const allSkills = new Map<string, string>(); // relPath → absPath (newest)
  const allSkillMtimes = new Map<string, number>(); // relPath → mtime ms
  for (const skills of agentSkills.values()) {
    for (const [rel, abs] of skills) {
      try {
        const mtime = fs.statSync(abs).mtimeMs;
        if (!allSkills.has(rel) || mtime > allSkillMtimes.get(rel)!) {
          allSkills.set(rel, abs);
          allSkillMtimes.set(rel, mtime);
        }
      } catch {
        if (!allSkills.has(rel)) allSkills.set(rel, abs);
      }
    }
  }

  // Distribute: copy skills that are missing OR outdated in each agent
  for (const source of shared.skills.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const skillsDir = path.join(expandHome(p.workspacePath), source.dir);
    for (const [relFile, srcAbs] of allSkills) {
      const dest = path.join(skillsDir, relFile);
      // Skip if the target file is the same as the source (same agent owns it)
      if (fs.existsSync(dest) && path.resolve(dest) === path.resolve(srcAbs)) continue;
      // Skip if target content is identical (no update needed)
      if (fs.existsSync(dest)) {
        try {
          if (fs.readFileSync(dest).equals(fs.readFileSync(srcAbs))) continue;
        } catch { /* fall through to copy */ }
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(srcAbs, dest);
      logger.debug(`  ${t('sync.distributeSkill', { file: relFile, agent: source.agent })}`);
    }
  }

  // ── Distribute MCP configs: extract from each source, merge by newest mtime ──
  const mergedMcp: Record<string, unknown> = {};
  const mcpMtimes: Record<string, number> = {}; // server key → mtime of source file
  for (const source of shared.mcp.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const srcPath = path.join(expandHome(p.workspacePath), source.src);
    if (!fs.existsSync(srcPath)) continue;
    try {
      const mtime = fs.statSync(srcPath).mtimeMs;
      const json = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Record<string, unknown>;
      const mcpField = json[source.field];
      if (mcpField && typeof mcpField === 'object') {
        for (const [key, val] of Object.entries(mcpField as Record<string, unknown>)) {
          // Keep the version from the most recently modified source file
          if (!(key in mergedMcp) || mtime > (mcpMtimes[key] ?? 0)) {
            mergedMcp[key] = val;
            mcpMtimes[key] = mtime;
          }
        }
      }
    } catch { /* ignore parse failures */ }
  }
  // Write back to each source agent's MCP config (create file if missing)
  if (Object.keys(mergedMcp).length > 0) {
    for (const source of shared.mcp.sources) {
      const p = profiles[source.agent];
      if (!p.enabled) continue;
      const srcPath = path.join(expandHome(p.workspacePath), source.src);
      try {
        let json: Record<string, unknown> = {};
        if (fs.existsSync(srcPath)) {
          json = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Record<string, unknown>;
        }
        const currentMcp = (json[source.field] ?? {}) as Record<string, unknown>;
        // Add new MCP servers AND update existing ones if config changed
        let changed = false;
        for (const [key, val] of Object.entries(mergedMcp)) {
          if (!(key in currentMcp)) {
            // New server — add it
            currentMcp[key] = val;
            changed = true;
          } else if (JSON.stringify(currentMcp[key]) !== JSON.stringify(val)) {
            // Existing server with updated config — take the newer version
            // (mergedMcp is built by iterating sources in order, last write wins)
            currentMcp[key] = val;
            changed = true;
          }
        }
        if (changed) {
          json[source.field] = currentMcp;
          fs.mkdirSync(path.dirname(srcPath), { recursive: true });
          fs.writeFileSync(srcPath, JSON.stringify(json, null, 2), 'utf-8');
          logger.debug(`  ${t('sync.distributeMcp', { agent: source.agent })}`);
        }
      } catch { /* ignore */ }
    }
  }
}

/**
 * Prune stale files from repo — delete entries present in repo but absent from current entries.
 * Only prunes files under agents/ and shared/ directories (does not touch .git etc.).
 */
function pruneRepoStaleFiles(repoPath: string, entries: FileEntry[]): string[] {
  const activeRepoRels = new Set(entries.map(e => e.repoRel));
  const deleted: string[] = [];

  for (const topDir of ['agents', 'shared']) {
    const scanRoot = path.join(repoPath, topDir);
    if (!fs.existsSync(scanRoot)) continue;

    for (const relFile of walkDir(scanRoot)) {
      if (path.basename(relFile).startsWith('.')) continue;
      const repoRel = path.join(topDir, relFile);
      if (!activeRepoRels.has(repoRel)) {
        const abs = path.join(repoPath, repoRel);
        fs.unlinkSync(abs);
        deleted.push(repoRel);
        logger.debug(`  ${t('sync.pruneStale', { file: repoRel })}`);

        // Clean up empty directories
        let dir = path.dirname(abs);
        while (dir !== scanRoot && dir.startsWith(scanRoot)) {
          const remaining = fs.readdirSync(dir);
          if (remaining.length === 0) {
            fs.rmdirSync(dir);
            dir = path.dirname(dir);
          } else {
            break;
          }
        }
      }
    }
  }
  return deleted;
}

/** Sync metadata stored in repo root */
export interface SyncMeta {
  readonly lastSyncAt: string;
  readonly hostname: string;
  readonly environment: string;
}

const SYNC_META_FILE = 'sync-meta.json';

function writeSyncMeta(repoPath: string, cfg: WangchuanConfig): void {
  const meta: SyncMeta = {
    lastSyncAt:  new Date().toISOString(),
    hostname:    cfg.hostname || os.hostname(),
    environment: cfg.environment ?? 'default',
  };
  fs.writeFileSync(
    path.join(repoPath, SYNC_META_FILE),
    JSON.stringify(meta, null, 2),
    'utf-8',
  );
}

function readSyncMeta(repoPath: string): SyncMeta | null {
  const metaPath = path.join(repoPath, SYNC_META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SyncMeta;
  } catch {
    return null;
  }
}

// ── Integrity checksum ──────────────────────────────────────────

const INTEGRITY_FILE = 'integrity.json';

interface IntegrityManifest {
  readonly generatedAt: string;
  readonly checksums: Record<string, string>;
}

/** Compute SHA-256 hash of a file */
function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Write integrity.json to repo root after staging */
function writeIntegrity(repoPath: string, syncedFiles: readonly string[]): void {
  const checksums: Record<string, string> = {};
  for (const repoRel of syncedFiles) {
    const absPath = path.join(repoPath, repoRel);
    if (fs.existsSync(absPath)) {
      checksums[repoRel] = sha256File(absPath);
    }
  }
  const manifest: IntegrityManifest = {
    generatedAt: new Date().toISOString(),
    checksums,
  };
  fs.writeFileSync(
    path.join(repoPath, INTEGRITY_FILE),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
  logger.debug(t('integrity.writing'));
}

/** Verify integrity.json checksums against repo files, return mismatched file list */
function verifyIntegrity(repoPath: string): string[] {
  const manifestPath = path.join(repoPath, INTEGRITY_FILE);
  if (!fs.existsSync(manifestPath)) {
    logger.debug(t('integrity.missingChecksum'));
    return [];
  }
  let manifest: IntegrityManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as IntegrityManifest;
  } catch {
    return [];
  }

  const mismatched: string[] = [];
  for (const [repoRel, expectedHash] of Object.entries(manifest.checksums)) {
    const absPath = path.join(repoPath, repoRel);
    if (!fs.existsSync(absPath)) continue;
    const actualHash = sha256File(absPath);
    if (actualHash !== expectedHash) {
      mismatched.push(repoRel);
      logger.warn(t('integrity.mismatch', { file: repoRel }));
    }
  }
  if (mismatched.length === 0) {
    const count = Object.keys(manifest.checksums).length;
    logger.debug(t('integrity.verified', { count }));
  } else {
    logger.warn(t('integrity.mismatchCount', { count: mismatched.length }));
  }
  return mismatched;
}

// ── Backup before destructive pull ──────────────────────────────

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const BACKUPS_DIR   = path.join(WANGCHUAN_DIR, 'backups');
const MAX_BACKUPS   = 5;

/**
 * Create a timestamped backup of local files that would be overwritten by restore.
 * Returns the backup directory path, or null if no files needed backup.
 */
function backupBeforeRestore(
  entries: readonly FileEntry[],
  repoPath: string,
): string | null {
  // Collect local files that exist and have a corresponding repo file
  const filesToBackup: Array<{ srcAbs: string; repoRel: string }> = [];
  for (const entry of entries) {
    const srcRepo = path.join(repoPath, entry.repoRel);
    if (!fs.existsSync(srcRepo) || !fs.existsSync(entry.srcAbs)) continue;
    // For jsonExtract entries, check the original path
    const localPath = entry.jsonExtract ? entry.jsonExtract.originalPath : entry.srcAbs;
    if (!fs.existsSync(localPath)) continue;

    // Only backup if content actually differs
    const localBuf = fs.readFileSync(localPath);
    const repoBuf  = fs.readFileSync(srcRepo);
    if (!localBuf.equals(repoBuf)) {
      filesToBackup.push({ srcAbs: localPath, repoRel: entry.repoRel });
    }
  }

  if (filesToBackup.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(BACKUPS_DIR, timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  logger.info(t('backup.creating', { count: filesToBackup.length }));

  // Deduplicate by srcAbs (jsonExtract entries may share originalPath)
  const seen = new Set<string>();
  for (const { srcAbs, repoRel } of filesToBackup) {
    if (seen.has(srcAbs)) continue;
    seen.add(srcAbs);
    const dest = path.join(backupDir, repoRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcAbs, dest);
  }

  logger.info(t('backup.created', { path: backupDir }));
  return backupDir;
}

/** Keep only the N most recent backup directories, delete the rest */
function rotateBackups(): void {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const dirs = fs.readdirSync(BACKUPS_DIR)
    .filter(d => fs.statSync(path.join(BACKUPS_DIR, d)).isDirectory())
    .sort()
    .reverse(); // newest first

  if (dirs.length <= MAX_BACKUPS) return;

  const toRemove = dirs.slice(MAX_BACKUPS);
  for (const dir of toRemove) {
    fs.rmSync(path.join(BACKUPS_DIR, dir), { recursive: true, force: true });
  }
  logger.debug(t('backup.rotated', { kept: MAX_BACKUPS, removed: toRemove.length }));
}

/** Check if a file's content matches a buffer (byte-equal for <64KB, SHA-256 for larger) */
function contentUnchanged(existingPath: string, newContent: Buffer): boolean {
  if (!fs.existsSync(existingPath)) return false;
  const existingBuf = fs.readFileSync(existingPath);
  if (existingBuf.length !== newContent.length) return false;
  // For small files (<64KB), direct byte comparison; otherwise hash
  if (newContent.length < 65536) return existingBuf.equals(newContent);
  const h1 = crypto.createHash('sha256').update(existingBuf).digest('hex');
  const h2 = crypto.createHash('sha256').update(newContent).digest('hex');
  return h1 === h2;
}

export const syncEngine = {
  expandHome,
  buildFileEntries,
  readSyncMeta,

  /**
   * Push: distribute shared content to all agents, then collect files to repo.
   */
  async stageToRepo(cfg: WangchuanConfig, agent?: AgentName, filter?: FilterOptions): Promise<StageResult> {
    // Distribute shared resources to all agents before full push
    if (!agent) {
      distributeShared(cfg);
    }
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, undefined, agent, filter);
    const result: StageResult = { synced: [], skipped: [], encrypted: [], deleted: [], unchanged: [] };
    let progressIdx = 0;
    const totalEntries = entries.length;

    for (const entry of entries) {
      if (!fs.existsSync(entry.srcAbs)) {
        logger.debug(t('sync.skipNotFound', { path: entry.srcAbs }));
        (result.skipped as string[]).push(entry.srcAbs);
        continue;
      }

      const destAbs = path.join(repoPath, entry.repoRel);
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });

      // ── JSON field-level extraction ────────────────────────────
      if (entry.jsonExtract) {
        try {
          const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
          const partial  = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
          const content  = JSON.stringify(partial, null, 2);

          if (entry.encrypt) {
            const encrypted = cryptoEngine.encryptString(content, keyPath);
            const newBuf = Buffer.from(encrypted, 'utf-8');
            if (contentUnchanged(destAbs, newBuf)) {
              (result.unchanged as string[]).push(entry.repoRel);
              continue;
            }
            fs.writeFileSync(destAbs, encrypted, 'utf-8');
            (result.encrypted as string[]).push(entry.repoRel);
          } else {
            const newBuf = Buffer.from(content, 'utf-8');
            if (contentUnchanged(destAbs, newBuf)) {
              (result.unchanged as string[]).push(entry.repoRel);
              continue;
            }
            fs.writeFileSync(destAbs, content, 'utf-8');
          }
          (result.synced as string[]).push(entry.repoRel);
          progressIdx++;
          logProgress(progressIdx, totalEntries, 'field', entry.repoRel);
        } catch (err) {
          logger.warn(t('sync.skipJsonParse', { path: entry.srcAbs, error: (err as Error).message }));
          (result.skipped as string[]).push(entry.repoRel);
        }
        continue;
      }

      // ── Whole-file sync ────────────────────────────────────────
      if (!entry.encrypt) {
        // Incremental check: skip if content is identical
        const srcBuf = fs.readFileSync(entry.srcAbs);
        if (contentUnchanged(destAbs, srcBuf)) {
          (result.unchanged as string[]).push(entry.repoRel);
          continue;
        }
        const content = srcBuf.toString('utf-8');
        if (validator.containsSensitiveData(content)) {
          logger.warn(`⚠  ${t('sync.sensitiveData', { path: entry.srcAbs })}`);
          logger.warn(`   ${t('sync.suggestEncrypt')}`);
        }
      }
      if (entry.encrypt) {
        cryptoEngine.encryptFile(entry.srcAbs, destAbs, keyPath);
        (result.encrypted as string[]).push(entry.repoRel);
        progressIdx++;
        logProgress(progressIdx, totalEntries, 'enc', entry.repoRel);
      } else {
        fs.copyFileSync(entry.srcAbs, destAbs);
        progressIdx++;
        logProgress(progressIdx, totalEntries, 'copy', entry.repoRel);
      }
      (result.synced as string[]).push(entry.repoRel);
    }

    // ── Prune stale files from repo (full push only) ──────────────
    // Only prune using entries actually written to repo, excluding skipped entries with missing local files
    if (!agent) {
      const syncedEntries = entries.filter(e => fs.existsSync(e.srcAbs));
      const pruned = pruneRepoStaleFiles(repoPath, syncedEntries);
      (result.deleted as string[]).push(...pruned);
    }

    // Write sync metadata to repo root
    writeSyncMeta(repoPath, cfg);

    // Write integrity checksums for all synced files
    if (result.synced.length > 0) {
      writeIntegrity(repoPath, result.synced);
    }

    return result;
  },

  async restoreFromRepo(cfg: WangchuanConfig, agent?: AgentName, filter?: FilterOptions): Promise<RestoreResult> {
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, repoPath, agent, filter);
    const result: RestoreResult = { synced: [], skipped: [], decrypted: [], conflicts: [], localOnly: [], skippedAgents: [] };
    let restoreIdx = 0;
    const restoreTotal = entries.length;

    // ── Detect skipped agents (workspace dir doesn't exist) ──────
    const profiles = cfg.profiles.default;
    for (const name of AGENT_NAMES) {
      const p = profiles[name];
      if (p.enabled || (agent && agent !== name)) continue;
      const wsPath = expandHome(p.workspacePath);
      if (!fs.existsSync(wsPath)) {
        (result.skippedAgents as string[]).push(name);
      }
    }

    // ── Verify integrity checksums before restore ────────────────
    verifyIntegrity(repoPath);

    // ── Backup local files before overwriting ────────────────────
    backupBeforeRestore(entries, repoPath);
    rotateBackups();

    let batchDecision: 'overwrite_all' | 'skip_all' | undefined;

    for (const entry of entries) {
      const srcRepo = path.join(repoPath, entry.repoRel);
      if (!fs.existsSync(srcRepo)) {
        // Not in repo but exists locally → mark as localOnly
        // jsonFields entries: srcAbs is the full JSON (always exists), check if extracted fields are non-empty
        if (entry.jsonExtract) {
          try {
            const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
            const extracted = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
            if (Object.keys(extracted).length > 0) {
              (result.localOnly as string[]).push(entry.repoRel);
            }
          } catch { /* ignore JSON parse failures */ }
        } else if (fs.existsSync(entry.srcAbs)) {
          (result.localOnly as string[]).push(entry.repoRel);
        }
        logger.debug(t('sync.skipNotInRepo', { file: entry.repoRel }));
        (result.skipped as string[]).push(entry.repoRel);
        continue;
      }

      // ── JSON field-level merge-back ────────────────────────────
      if (entry.jsonExtract) {
        let partialContent: string;
        if (entry.encrypt) {
          partialContent = cryptoEngine.decryptString(
            fs.readFileSync(srcRepo, 'utf-8').trim(), keyPath,
          );
        } else {
          partialContent = fs.readFileSync(srcRepo, 'utf-8');
        }
        const partial = JSON.parse(partialContent) as Record<string, unknown>;

        // Read local full JSON, merge into it (without destroying other fields)
        const targetPath = entry.jsonExtract.originalPath;
        let fullJson: Record<string, unknown> = {};
        if (fs.existsSync(targetPath)) {
          fullJson = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as Record<string, unknown>;
        }
        const merged = jsonField.mergeFields(fullJson, partial);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2), 'utf-8');

        // shared MCP entry: also distribute to all other agents
        if (entry.agentName === 'shared' && cfg.shared) {
          for (const source of cfg.shared.mcp.sources) {
            const p = cfg.profiles.default[source.agent];
            if (!p.enabled) continue;
            const otherPath = path.join(expandHome(p.workspacePath), source.src);
            if (otherPath === targetPath) continue; // already handled
            let otherJson: Record<string, unknown> = {};
            if (fs.existsSync(otherPath)) {
              try { otherJson = JSON.parse(fs.readFileSync(otherPath, 'utf-8')) as Record<string, unknown>; } catch { /* */ }
            }
            const otherMerged = jsonField.mergeFields(otherJson, partial);
            fs.mkdirSync(path.dirname(otherPath), { recursive: true });
            fs.writeFileSync(otherPath, JSON.stringify(otherMerged, null, 2), 'utf-8');
          }
        }

        (result.synced as string[]).push(entry.repoRel);
        if (entry.encrypt) (result.decrypted as string[]).push(entry.repoRel);
        restoreIdx++;
        logProgress(restoreIdx, restoreTotal, entry.encrypt ? 'decrypted' : 'field', entry.repoRel);
        continue;
      }

      // ── Distribute shared skills to all agents ─────────────────
      if (entry.agentName === 'shared' && entry.repoRel.startsWith('shared/skills/')) {
        const relInSkills = entry.repoRel.slice('shared/skills/'.length);
        const shared = cfg.shared;
        if (shared) {
          for (const source of shared.skills.sources) {
            const p = cfg.profiles.default[source.agent];
            if (!p.enabled) continue;
            const dest = path.join(expandHome(p.workspacePath), source.dir, relInSkills);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(srcRepo, dest);
          }
        }
        (result.synced as string[]).push(entry.repoRel);
        restoreIdx++;
        logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
        continue;
      }

      // ── Conflict detection (whole-file sync) ──────────────────
      if (fs.existsSync(entry.srcAbs)) {
        let isDiff = false;
        const localBuf = fs.readFileSync(entry.srcAbs);
        let remoteContent: string | undefined;
        if (entry.encrypt) {
          try {
            const decrypted = cryptoEngine.decryptString(
              fs.readFileSync(srcRepo, 'utf-8').trim(), keyPath,
            );
            isDiff = localBuf.toString('utf-8') !== decrypted;
            remoteContent = decrypted;
          } catch {
            isDiff = true;
          }
        } else {
          const repoBuf = fs.readFileSync(srcRepo);
          isDiff = !localBuf.equals(repoBuf);
          remoteContent = repoBuf.toString('utf-8');
        }

        if (isDiff) {
          // ── Three-way merge for non-encrypted plain text files ──
          const isTextMergeable = !entry.encrypt &&
            (entry.repoRel.endsWith('.md') || entry.repoRel.endsWith('.txt'));
          if (isTextMergeable && remoteContent !== undefined) {
            // Try to get the base version from git history (pre-pull version)
            const baseContent = await gitEngine.showFile(repoPath, 'HEAD~1', entry.repoRel);
            if (baseContent !== null) {
              const localContent = localBuf.toString('utf-8');
              const mergeResult = threeWayMerge(baseContent, localContent, remoteContent);
              if (!mergeResult.hasConflicts) {
                // Auto-resolved — write merged content
                fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
                fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
                logger.info(`  ${t('merge.autoResolved', { file: entry.repoRel })}`);
                (result.synced as string[]).push(entry.repoRel);
                restoreIdx++;
                logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
                continue;
              }
              // Has conflicts — write merged content with conflict markers
              fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
              fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
              logger.warn(`  ${t('merge.conflictsFound', { file: entry.repoRel })}`);
              (result.conflicts as string[]).push(entry.repoRel);
              (result.synced as string[]).push(entry.repoRel);
              restoreIdx++;
              logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
              continue;
            }
          }

          // ── Fallback: interactive overwrite/skip/merge prompt ──
          (result.conflicts as string[]).push(entry.repoRel);

          if (batchDecision === 'skip_all') {
            logger.info(`  ↷ ${t('sync.skippedKeepLocal', { file: entry.repoRel })}`);
            (result.skipped as string[]).push(entry.repoRel);
            continue;
          }
          if (batchDecision !== 'overwrite_all') {
            const localStr = localBuf.toString('utf-8');
            const canMerge = isTextMergeable && remoteContent !== undefined;
            const ans = await askConflict(entry.repoRel, localStr, remoteContent, canMerge);
            if (ans === 'skip' || ans === 'skip_all') {
              if (ans === 'skip_all') batchDecision = 'skip_all';
              logger.info(`  ↷ ${t('sync.skippedKeepLocal', { file: entry.repoRel })}`);
              (result.skipped as string[]).push(entry.repoRel);
              continue;
            }
            if (ans === 'overwrite_all') batchDecision = 'overwrite_all';
            if (ans === 'merge' && canMerge) {
              // Manual merge attempt via three-way merge (with conflict markers)
              const baseContent = await gitEngine.showFile(repoPath, 'HEAD~1', entry.repoRel);
              const base = baseContent ?? '';
              const mergeResult = threeWayMerge(base, localStr, remoteContent!);
              fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
              fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
              if (mergeResult.hasConflicts) {
                logger.warn(`  ${t('merge.conflictsFound', { file: entry.repoRel })}`);
              } else {
                logger.info(`  ${t('merge.autoResolved', { file: entry.repoRel })}`);
              }
              (result.synced as string[]).push(entry.repoRel);
              restoreIdx++;
              logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
              continue;
            }
          }
        }
      }

      // ── Write file ───────────────────────────────────────────
      fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
      if (entry.encrypt) {
        cryptoEngine.decryptFile(srcRepo, entry.srcAbs, keyPath);
        (result.decrypted as string[]).push(entry.repoRel);
      } else {
        fs.copyFileSync(srcRepo, entry.srcAbs);
      }
      (result.synced as string[]).push(entry.repoRel);
      restoreIdx++;
      logProgress(restoreIdx, restoreTotal, entry.encrypt ? 'decrypted' : 'copy', entry.repoRel);
    }

    // Log sync-meta freshness info
    const meta = readSyncMeta(repoPath);
    if (meta) {
      logger.info(t('sync.meta.lastSync', {
        time:     meta.lastSyncAt,
        hostname: meta.hostname,
        env:      meta.environment,
      }));
      const ageMs  = Date.now() - new Date(meta.lastSyncAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (ageDays >= 3) {
        logger.warn(t('sync.meta.staleDays', { days: ageDays }));
      }
    }

    return result;
  },

  async diff(cfg: WangchuanConfig, agent?: AgentName, filter?: FilterOptions): Promise<DiffResult> {
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, undefined, agent, filter);
    const diff: DiffResult = { added: [], modified: [], missing: [] };

    for (const entry of entries) {
      const srcExists  = fs.existsSync(entry.srcAbs);
      const repoExists = fs.existsSync(path.join(repoPath, entry.repoRel));

      if (!srcExists && !repoExists) continue;
      if (srcExists  && !repoExists) { (diff.added   as string[]).push(entry.repoRel); continue; }
      if (!srcExists && repoExists)  { (diff.missing  as string[]).push(entry.repoRel); continue; }

      // For JSON field extraction, compare the extracted content
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
            (diff.modified as string[]).push(entry.repoRel);
          }
        } catch {
          (diff.modified as string[]).push(entry.repoRel);
        }
        continue;
      }

      // Whole-file comparison
      const srcBuf  = fs.readFileSync(entry.srcAbs);
      const repoBuf = fs.readFileSync(path.join(repoPath, entry.repoRel));

      if (entry.encrypt) {
        try {
          const decrypted = cryptoEngine.decryptString(repoBuf.toString('utf-8').trim(), keyPath);
          if (srcBuf.toString('utf-8') !== decrypted) {
            (diff.modified as string[]).push(entry.repoRel);
          }
        } catch {
          (diff.modified as string[]).push(entry.repoRel);
        }
      } else {
        if (!srcBuf.equals(repoBuf)) (diff.modified as string[]).push(entry.repoRel);
      }
    }
    return diff;
  },
} as const;
