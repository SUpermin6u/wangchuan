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
import { keyFingerprint } from './crypto.js';
import { jsonField }    from './json-field.js';
import { validator }    from '../utils/validator.js';
import { logger }       from '../utils/logger.js';
import { walkDir as walkDirBase } from '../utils/fs.js';
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
  CustomAgentProfile,
  FilterOptions,
  PendingDistribution,
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

/** Walk directory with .wangchuanignore filtering */
function walkDir(dirAbs: string): string[] {
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
  name: AgentName | string,
  profile: AgentProfile | CustomAgentProfile,
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

  // ── shared agents: multi-source aggregation (same pattern as skills) ──
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
  agent?: AgentName | string,
  filter?: FilterOptions,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const profiles = cfg.profiles.default;

  // per-agent entries (built-in agents)
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (!p.enabled || (agent && agent !== name)) continue;
    entries.push(...buildAgentEntries(name, p, repoDirBase));
  }

  // custom agents (config-driven, basic file sync only)
  if (cfg.customAgents) {
    for (const [name, profile] of Object.entries(cfg.customAgents)) {
      if (agent && agent !== name) continue;
      entries.push(...buildAgentEntries(name, profile, repoDirBase));
    }
  }

  // shared entries (excluded when --agent filter is active, since shared belongs to no single agent)
  if (!agent) {
    entries.push(...buildSharedEntries(cfg, repoDirBase));
  }

  return applyFilter(deduplicateEntries(entries), filter);
}

/**
 * Distribute shared content (skills, MCP configs, custom agents) to each agent's local directory.
 * Skills and custom agents: collect pending distributions for user confirmation (no files written).
 * MCP configs: distributed automatically (low-risk config merges).
 * Called before push to prepare cross-agent sharing.
 */
function distributeShared(cfg: WangchuanConfig): void {
  const shared = cfg.shared;
  if (!shared) return;
  const profiles = cfg.profiles.default;
  const pendingItems: PendingDistribution[] = [];

  // ── Skills: collect pending distributions (no file writes) ──────
  {
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
    const allSkillMtimes = new Map<string, number>();
    const allSkillOwner = new Map<string, string>(); // relPath → agent name that owns newest
    for (const [agentName, skills] of agentSkills) {
      for (const [rel, abs] of skills) {
        try {
          const mtime = fs.statSync(abs).mtimeMs;
          if (!allSkills.has(rel) || mtime > allSkillMtimes.get(rel)!) {
            allSkills.set(rel, abs);
            allSkillMtimes.set(rel, mtime);
            allSkillOwner.set(rel, agentName);
          }
        } catch {
          if (!allSkills.has(rel)) {
            allSkills.set(rel, abs);
            allSkillOwner.set(rel, agentName);
          }
        }
      }
    }

    // Build ownership map: relPath → set of agent names that have it
    const agentHasSkill = new Map<string, Set<string>>();
    for (const [agentName, skills] of agentSkills) {
      for (const rel of skills.keys()) {
        if (!agentHasSkill.has(rel)) agentHasSkill.set(rel, new Set());
        agentHasSkill.get(rel)!.add(agentName);
      }
    }

    const allSourceAgents = shared.skills.sources.map(s => s.agent).filter(a => profiles[a].enabled);

    // Detect pending distributions for each skill
    for (const [relFile, srcAbs] of allSkills) {
      const owners = agentHasSkill.get(relFile) ?? new Set<string>();
      const sourceAgent = allSkillOwner.get(relFile) ?? '';

      for (const targetAgent of allSourceAgents) {
        if (targetAgent === sourceAgent) continue;
        const targetHasIt = owners.has(targetAgent);
        const targetSkillsDir = path.join(expandHome(profiles[targetAgent]!.workspacePath),
          shared.skills.sources.find(s => s.agent === targetAgent)!.dir);
        const targetPath = path.join(targetSkillsDir, relFile);

        if (!targetHasIt) {
          // Target doesn't have this skill.
          // If only one agent has it → genuinely new skill → "add" pending
          // If multiple agents have it but this one doesn't → likely deleted → "delete" pending
          if (owners.size === 1) {
            pendingItems.push({
              kind: 'skill',
              action: 'add',
              relFile,
              sourceAgent,
              targetAgents: [targetAgent],
              sourceAbs: srcAbs,
            });
          }
          // Multi-owner missing case handled in the delete detection loop below
        } else {
          // Target has it — check if content differs (needs update)
          if (path.resolve(targetPath) === path.resolve(srcAbs)) continue;
          try {
            if (fs.readFileSync(targetPath).equals(fs.readFileSync(srcAbs))) continue;
          } catch { /* fall through */ }
          pendingItems.push({
            kind: 'skill',
            action: 'update',
            relFile,
            sourceAgent,
            targetAgents: [targetAgent],
            sourceAbs: srcAbs,
          });
        }
      }
    }

    // Detect delete cases: skill missing from some agents but present in multiple others
    for (const [relFile, owners] of agentHasSkill) {
      const missingFrom = allSourceAgents.filter(a => !owners.has(a));
      if (missingFrom.length > 0 && owners.size > 1) {
        const srcAgent = [...owners][0]!;
        const srcAbs = agentSkills.get(srcAgent)?.get(relFile) ?? '';
        for (const target of missingFrom) {
          pendingItems.push({
            kind: 'skill',
            action: 'delete',
            relFile,
            sourceAgent: srcAgent,
            targetAgents: [target],
            sourceAbs: srcAbs,
          });
        }
      }
    }
  }

  // ── Distribute MCP configs: automatic (unchanged) ──────────────
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

  // ── Custom agents: collect pending distributions (no file writes) ──
  if (shared.agents && shared.agents.sources.length > 0) {
    // Collect each agent's current custom agent files
    const agentAgents = new Map<string, Map<string, string>>(); // agent → relPath → absPath
    for (const source of shared.agents.sources) {
      const p = profiles[source.agent];
      if (!p.enabled) continue;
      const agentsDir = path.join(expandHome(p.workspacePath), source.dir);
      const agents = new Map<string, string>();
      if (fs.existsSync(agentsDir)) {
        for (const relFile of walkDir(agentsDir)) {
          if (path.basename(relFile).startsWith('.')) continue;
          agents.set(relFile, path.join(agentsDir, relFile));
        }
      }
      agentAgents.set(source.agent, agents);
    }

    // Merge all agents' custom agent files — pick NEWEST version by mtime
    const allAgentFiles = new Map<string, string>();
    const allAgentMtimes = new Map<string, number>();
    const allAgentOwner = new Map<string, string>();
    for (const [agentName, agents] of agentAgents) {
      for (const [rel, abs] of agents) {
        try {
          const mtime = fs.statSync(abs).mtimeMs;
          if (!allAgentFiles.has(rel) || mtime > allAgentMtimes.get(rel)!) {
            allAgentFiles.set(rel, abs);
            allAgentMtimes.set(rel, mtime);
            allAgentOwner.set(rel, agentName);
          }
        } catch {
          if (!allAgentFiles.has(rel)) {
            allAgentFiles.set(rel, abs);
            allAgentOwner.set(rel, agentName);
          }
        }
      }
    }

    // Build ownership map: relPath → set of agent names that have it
    const agentHasFile = new Map<string, Set<string>>();
    for (const [agentName, agents] of agentAgents) {
      for (const rel of agents.keys()) {
        if (!agentHasFile.has(rel)) agentHasFile.set(rel, new Set());
        agentHasFile.get(rel)!.add(agentName);
      }
    }

    const allSourceAgents = shared.agents.sources.map(s => s.agent).filter(a => profiles[a].enabled);

    // Detect pending distributions for each custom agent file
    for (const [relFile, srcAbs] of allAgentFiles) {
      const owners = agentHasFile.get(relFile) ?? new Set<string>();
      const sourceAgent = allAgentOwner.get(relFile) ?? '';

      for (const targetAgent of allSourceAgents) {
        if (targetAgent === sourceAgent) continue;
        const targetHasIt = owners.has(targetAgent);
        const targetAgentsDir = path.join(expandHome(profiles[targetAgent]!.workspacePath),
          shared.agents.sources.find(s => s.agent === targetAgent)!.dir);
        const targetPath = path.join(targetAgentsDir, relFile);

        if (!targetHasIt) {
          // Only create add if genuinely new (single owner)
          if (owners.size === 1) {
            pendingItems.push({
              kind: 'agent',
              action: 'add',
              relFile,
              sourceAgent,
              targetAgents: [targetAgent],
              sourceAbs: srcAbs,
            });
          }
        } else {
          if (path.resolve(targetPath) === path.resolve(srcAbs)) continue;
          try {
            if (fs.readFileSync(targetPath).equals(fs.readFileSync(srcAbs))) continue;
          } catch { /* fall through */ }
          pendingItems.push({
            kind: 'agent',
            action: 'update',
            relFile,
            sourceAgent,
            targetAgents: [targetAgent],
            sourceAbs: srcAbs,
          });
        }
      }
    }

    // Detect delete cases
    for (const [relFile, owners] of agentHasFile) {
      const missingFrom = allSourceAgents.filter(a => !owners.has(a));
      if (missingFrom.length > 0 && owners.size > 1) {
        const srcAgent = [...owners][0]!;
        const srcAbs = agentAgents.get(srcAgent)?.get(relFile) ?? '';
        for (const target of missingFrom) {
          pendingItems.push({
            kind: 'agent',
            action: 'delete',
            relFile,
            sourceAgent: srcAgent,
            targetAgents: [target],
            sourceAbs: srcAbs,
          });
        }
      }
    }
  }

  // ── Write pending distributions if any ──────────────────────────
  if (pendingItems.length > 0) {
    // Merge same-kind/same-action/same-relFile items by combining targetAgents
    const merged = mergePendingItems(pendingItems);
    savePendingDistributions(merged);
  }
}

/**
 * Detect stale files in repo (present in repo but absent from current entries).
 * Returns the list of stale repoRel paths WITHOUT deleting them.
 */
function detectStaleFiles(repoPath: string, entries: FileEntry[]): string[] {
  const activeRepoRels = new Set(entries.map(e => e.repoRel));
  const stale: string[] = [];

  for (const topDir of ['agents', 'shared']) {
    const scanRoot = path.join(repoPath, topDir);
    if (!fs.existsSync(scanRoot)) continue;

    for (const relFile of walkDir(scanRoot)) {
      if (path.basename(relFile).startsWith('.')) continue;
      const repoRel = path.join(topDir, relFile);
      if (!activeRepoRels.has(repoRel)) {
        stale.push(repoRel);
      }
    }
  }
  return stale;
}

/**
 * Actually delete stale files from repo (after user confirmation).
 */
export function deleteStaleFiles(repoPath: string, staleFiles: string[]): void {
  for (const repoRel of staleFiles) {
    const abs = path.join(repoPath, repoRel);
    if (!fs.existsSync(abs)) continue;
    fs.unlinkSync(abs);
    logger.debug(`  ${t('sync.pruneStale', { file: repoRel })}`);

    // Clean up empty directories
    const topDir = repoRel.split(path.sep)[0]!;
    const scanRoot = path.join(repoPath, topDir);
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

const PENDING_DELETIONS_PATH = path.join(os.homedir(), '.wangchuan', 'pending-deletions.json');
const PENDING_DISTRIBUTIONS_PATH = path.join(os.homedir(), '.wangchuan', 'pending-distributions.json');

/** Save pending deletions for later user confirmation */
function savePendingDeletions(files: string[]): void {
  const existing = loadPendingDeletions();
  const merged = [...new Set([...existing, ...files])];
  fs.mkdirSync(path.dirname(PENDING_DELETIONS_PATH), { recursive: true });
  fs.writeFileSync(PENDING_DELETIONS_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}

/** Load pending deletions */
export function loadPendingDeletions(): string[] {
  try {
    if (!fs.existsSync(PENDING_DELETIONS_PATH)) return [];
    return JSON.parse(fs.readFileSync(PENDING_DELETIONS_PATH, 'utf-8')) as string[];
  } catch { return []; }
}

/** Clear pending deletions after confirmation */
export function clearPendingDeletions(): void {
  try { if (fs.existsSync(PENDING_DELETIONS_PATH)) fs.unlinkSync(PENDING_DELETIONS_PATH); } catch { /* */ }
}

/** Merge pending distribution items with same kind/action/relFile by combining targetAgents */
function mergePendingItems(items: PendingDistribution[]): PendingDistribution[] {
  const map = new Map<string, PendingDistribution & { targetAgents: string[] }>();
  for (const item of items) {
    const key = `${item.kind}:${item.action}:${item.relFile}:${item.sourceAgent}`;
    const existing = map.get(key);
    if (existing) {
      for (const t of item.targetAgents) {
        if (!existing.targetAgents.includes(t)) existing.targetAgents.push(t);
      }
    } else {
      map.set(key, { ...item, targetAgents: [...item.targetAgents] });
    }
  }
  return [...map.values()];
}

/** Save pending distributions for user confirmation */
function savePendingDistributions(items: readonly PendingDistribution[]): void {
  fs.mkdirSync(path.dirname(PENDING_DISTRIBUTIONS_PATH), { recursive: true });
  fs.writeFileSync(PENDING_DISTRIBUTIONS_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

/** Load pending distributions */
export function loadPendingDistributions(): PendingDistribution[] {
  try {
    if (!fs.existsSync(PENDING_DISTRIBUTIONS_PATH)) return [];
    return JSON.parse(fs.readFileSync(PENDING_DISTRIBUTIONS_PATH, 'utf-8')) as PendingDistribution[];
  } catch { return []; }
}

/** Clear pending distributions after processing */
export function clearPendingDistributions(): void {
  try { if (fs.existsSync(PENDING_DISTRIBUTIONS_PATH)) fs.unlinkSync(PENDING_DISTRIBUTIONS_PATH); } catch { /* */ }
}

/**
 * Process pending distributions interactively.
 * Groups by relFile, prompts user for each, executes the chosen actions.
 */
export async function processPendingDistributions(cfg: WangchuanConfig): Promise<void> {
  const pending = loadPendingDistributions();
  if (pending.length === 0) return;

  const profiles = cfg.profiles.default;
  const shared = cfg.shared;
  if (!shared) { clearPendingDistributions(); return; }

  // Group by kind + relFile
  const grouped = new Map<string, PendingDistribution[]>();
  for (const item of pending) {
    const key = `${item.kind}:${item.relFile}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  logger.info(t('sync.pendingDistributions', { count: pending.length }));

  const rl = await import('readline');

  for (const [, items] of grouped) {
    const first = items[0]!;
    // Collect all unique target agents across all actions for this file
    const allTargets = [...new Set(items.flatMap(i => [...i.targetAgents]))];

    console.log();
    logger.info(t('sync.distItem', {
      kind: first.kind,
      action: first.action,
      file: first.relFile,
      source: first.sourceAgent,
    }));
    logger.info(t('sync.distPrompt'));

    // Build choices
    const choices: string[] = [];
    choices.push(`[0] ${t('sync.distAll')} (${allTargets.join(', ')})`);
    for (let i = 0; i < allTargets.length; i++) {
      choices.push(`[${i + 1}] ${allTargets[i]}`);
    }
    choices.push(`[${allTargets.length + 1}] ${t('sync.distNone')}`);
    for (const c of choices) console.log(`  ${c}`);

    const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      iface.question(t('sync.distInputPrompt'), (ans: string) => { iface.close(); resolve(ans.trim()); });
    });

    // Parse selection
    const indices = answer.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    let selectedAgents: string[] = [];

    if (indices.includes(0)) {
      selectedAgents = [...allTargets];
    } else if (indices.includes(allTargets.length + 1)) {
      selectedAgents = [];
    } else {
      selectedAgents = indices
        .filter(i => i > 0 && i <= allTargets.length)
        .map(i => allTargets[i - 1]!)
        .filter((a): a is string => a !== undefined);
    }

    // Execute the distribution for selected agents
    for (const targetAgent of selectedAgents) {
      for (const item of items) {
        if (!item.targetAgents.includes(targetAgent)) continue;
        executeDistribution(item, targetAgent, cfg);
      }
    }

    if (selectedAgents.length === 0) {
      logger.info(t('sync.distSkipped'));
    }
  }

  clearPendingDistributions();
}

/** Execute a single distribution action for a target agent */
function executeDistribution(
  item: PendingDistribution,
  targetAgent: string,
  cfg: WangchuanConfig,
): void {
  const profiles = cfg.profiles.default;
  const shared = cfg.shared;
  if (!shared) return;

  const p = profiles[targetAgent as keyof typeof profiles];
  if (!p) return;

  // Resolve target directory based on kind
  let targetDir: string;
  if (item.kind === 'skill') {
    const source = shared.skills.sources.find(s => s.agent === targetAgent);
    if (!source) return;
    targetDir = path.join(expandHome(p.workspacePath), source.dir);
  } else {
    const source = shared.agents?.sources.find(s => s.agent === targetAgent);
    if (!source) return;
    targetDir = path.join(expandHome(p.workspacePath), source.dir);
  }

  const targetPath = path.join(targetDir, item.relFile);

  if (item.action === 'delete') {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      // Clean up empty parent dirs
      let dir = path.dirname(targetPath);
      while (dir !== targetDir && dir.startsWith(targetDir)) {
        try {
          const remaining = fs.readdirSync(dir);
          if (remaining.length === 0) { fs.rmdirSync(dir); dir = path.dirname(dir); }
          else break;
        } catch { break; }
      }
      logger.ok(`  ${t('sync.distApplied', { action: 'delete', file: item.relFile, agent: targetAgent })}`);
    }
  } else {
    // add or update — copy the source file
    if (!fs.existsSync(item.sourceAbs)) return;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(item.sourceAbs, targetPath);
    logger.ok(`  ${t('sync.distApplied', { action: item.action, file: item.relFile, agent: targetAgent })}`);
  }
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

// ── Key fingerprint validation ──────────────────────────────────

const KEY_FINGERPRINT_FILE = 'key-fingerprint.json';

interface KeyFingerprintManifest {
  readonly fingerprint: string;
  readonly updatedAt: string;
}

/**
 * Write the local key's SHA-256 fingerprint to the repo.
 * Called after successful push so other machines can verify key match.
 */
function writeKeyFingerprint(repoPath: string, keyPath: string): void {
  const fp = keyFingerprint(keyPath);
  const manifest: KeyFingerprintManifest = {
    fingerprint: fp,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(repoPath, KEY_FINGERPRINT_FILE),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
}

/**
 * Verify the local key matches the fingerprint stored in the repo.
 * Throws with a clear message on mismatch. Skips silently if no fingerprint exists
 * (first-time push, or migrated from older version).
 */
function verifyKeyFingerprint(repoPath: string, keyPath: string): void {
  const fpPath = path.join(repoPath, KEY_FINGERPRINT_FILE);
  if (!fs.existsSync(fpPath)) {
    logger.debug(t('keyFingerprint.notFound'));
    return; // first push or migrated — no fingerprint yet
  }
  let manifest: KeyFingerprintManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(fpPath, 'utf-8')) as KeyFingerprintManifest;
  } catch {
    return; // corrupt file — skip validation
  }
  const localFp = keyFingerprint(keyPath);
  if (localFp !== manifest.fingerprint) {
    throw new Error(t('keyFingerprint.mismatch'));
  }
  logger.debug(t('keyFingerprint.verified'));
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

/**
 * Check if an encrypted file's plaintext matches new plaintext content.
 * Decrypts the existing .enc file and compares with the new plaintext,
 * avoiding false-positive diffs caused by random IV in AES-256-GCM.
 */
function encryptedPlaintextUnchanged(existingEncPath: string, newPlaintext: Buffer, keyPath: string): boolean {
  if (!fs.existsSync(existingEncPath)) return false;
  try {
    const existingEnc = fs.readFileSync(existingEncPath, 'utf-8').trim();
    const existingPlain = cryptoEngine.decryptString(existingEnc, keyPath);
    return Buffer.from(existingPlain, 'utf-8').equals(newPlaintext);
  } catch {
    // Decryption failure (key changed, corrupted file) → treat as changed
    return false;
  }
}

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

  /**
   * Push: distribute shared content to all agents, then collect files to repo.
   */
  async stageToRepo(cfg: WangchuanConfig, agent?: AgentName | string, filter?: FilterOptions): Promise<StageResult> {
    // Distribute shared resources to all agents before full push
    if (!agent) {
      distributeShared(cfg);
    }
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);

    // ── Verify key fingerprint before pushing (prevents overwriting cloud with wrong key) ──
    verifyKeyFingerprint(repoPath, keyPath);
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
            // Compare plaintext to avoid false diffs from random IV
            if (encryptedPlaintextUnchanged(destAbs, Buffer.from(content, 'utf-8'), keyPath)) {
              (result.unchanged as string[]).push(entry.repoRel);
              continue;
            }
            const encrypted = cryptoEngine.encryptString(content, keyPath);
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
        // Compare plaintext to avoid false diffs from random IV
        const srcBuf = fs.readFileSync(entry.srcAbs);
        if (encryptedPlaintextUnchanged(destAbs, srcBuf, keyPath)) {
          (result.unchanged as string[]).push(entry.repoRel);
          continue;
        }
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

    // ── Detect stale files in repo (full push only, skip when filtering) ──
    // When --only/--exclude is active, the entry set is incomplete — stale detection
    // would wrongly flag legitimately synced files as stale, causing data loss.
    if (!agent && !filter) {
      const syncedEntries = entries.filter(e => fs.existsSync(e.srcAbs));
      const stale = detectStaleFiles(repoPath, syncedEntries);
      if (stale.length > 0) {
        const isTTY = process.stdin.isTTY === true;
        if (isTTY) {
          // Interactive mode: ask user for confirmation before deleting
          logger.warn(t('sync.pendingDeletions', { count: stale.length }));
          for (const f of stale) logger.warn(`  ${t('sync.pruneCandidate', { file: f })}`);

          const rl = await import('readline');
          const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await new Promise<string>(resolve => {
            iface.question(t('sync.confirmDelete'), (ans: string) => { iface.close(); resolve(ans.trim().toLowerCase()); });
          });

          if (answer === 'y' || answer === 'yes' || answer === '') {
            deleteStaleFiles(repoPath, stale);
            (result.deleted as string[]).push(...stale);
          } else {
            logger.info(t('sync.deletionSkipped'));
          }
        } else {
          // Non-interactive mode (watch daemon): save to pending file for later confirmation
          savePendingDeletions(stale);
          logger.info(t('sync.deletionDeferred', { count: stale.length }));
        }
      }
    }

    // Write sync metadata to repo root
    writeSyncMeta(repoPath, cfg);

    // Write integrity checksums for all synced files
    if (result.synced.length > 0) {
      writeIntegrity(repoPath, result.synced);
    }

    // Write key fingerprint so other machines can verify key match before pull
    writeKeyFingerprint(repoPath, keyPath);

    return result;
  },

  async restoreFromRepo(cfg: WangchuanConfig, agent?: AgentName | string, filter?: FilterOptions): Promise<RestoreResult> {
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);

    // ── Verify key fingerprint before pulling (prevents decrypt failures mid-restore) ──
    verifyKeyFingerprint(repoPath, keyPath);

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
    // Also check custom agents
    if (cfg.customAgents) {
      for (const [name, profile] of Object.entries(cfg.customAgents)) {
        if (agent && agent !== name) continue;
        const wsPath = expandHome(profile.workspacePath);
        if (!fs.existsSync(wsPath)) {
          (result.skippedAgents as string[]).push(name);
        }
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

      // ── Distribute shared custom agents to all agents ──────────
      if (entry.agentName === 'shared' && entry.repoRel.startsWith('shared/agents/')) {
        const relInAgents = entry.repoRel.slice('shared/agents/'.length);
        const shared = cfg.shared;
        if (shared?.agents) {
          for (const source of shared.agents.sources) {
            const p = cfg.profiles.default[source.agent];
            if (!p.enabled) continue;
            const dest = path.join(expandHome(p.workspacePath), source.dir, relInAgents);
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
          const ext = path.extname(entry.repoRel).toLowerCase();
          const MERGEABLE_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);
          const isTextMergeable = !entry.encrypt && MERGEABLE_EXTS.has(ext);
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

  async diff(cfg: WangchuanConfig, agent?: AgentName | string, filter?: FilterOptions): Promise<DiffResult> {
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
