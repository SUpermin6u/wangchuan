/**
 * sync-shared.ts — Cross-agent sharing distribution logic
 *
 * Handles distribution of skills, MCP configs, and custom agents between agents.
 * Manages pending distributions and deletions for user confirmation.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { expandHome, walkDir } from './sync.js';
import { logger }       from '../utils/logger.js';
import { t }            from '../i18n.js';
import type {
  WangchuanConfig,
  AgentProfile,
  AgentProfiles,
  PendingDistribution,
} from '../types.js';

const PENDING_DELETIONS_PATH = path.join(os.homedir(), '.wangchuan', 'pending-deletions.json');
const PENDING_DISTRIBUTIONS_PATH = path.join(os.homedir(), '.wangchuan', 'pending-distributions.json');

// ── Pending deletions ──────────────────────────────────────────────

/** Save pending deletions for later user confirmation */
export function savePendingDeletions(files: string[]): void {
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

// ── Pending distributions ──────────────────────────────────────────

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

// ── Shared distribution logic ──────────────────────────────────────

/**
 * Aggregate resources (skills or custom agents) from multiple agent sources.
 * Returns a merged map (relPath → absPath of newest version) and an ownership map (relPath → set of agents).
 */
function aggregateResources(
  sources: ReadonlyArray<{ readonly agent: string; readonly dir: string }>,
  profiles: AgentProfiles,
): {
  allFiles: Map<string, string>;
  allOwner: Map<string, string>;
  agentHas: Map<string, Set<string>>;
  allSourceAgents: string[];
  perAgent: Map<string, Map<string, string>>;
} {
  const perAgent = new Map<string, Map<string, string>>();
  for (const source of sources) {
    const p = profiles[source.agent as keyof AgentProfiles];
    if (!p?.enabled) continue;
    const dir = path.join(expandHome(p.workspacePath), source.dir);
    const files = new Map<string, string>();
    if (fs.existsSync(dir)) {
      for (const relFile of walkDir(dir)) {
        if (path.basename(relFile).startsWith('.')) continue;
        files.set(relFile, path.join(dir, relFile));
      }
    }
    perAgent.set(source.agent, files);
  }

  const allFiles = new Map<string, string>();
  const allMtimes = new Map<string, number>();
  const allOwner = new Map<string, string>();
  for (const [agentName, files] of perAgent) {
    for (const [rel, abs] of files) {
      try {
        const mtime = fs.statSync(abs).mtimeMs;
        if (!allFiles.has(rel) || mtime > allMtimes.get(rel)!) {
          allFiles.set(rel, abs);
          allMtimes.set(rel, mtime);
          allOwner.set(rel, agentName);
        }
      } catch {
        if (!allFiles.has(rel)) {
          allFiles.set(rel, abs);
          allOwner.set(rel, agentName);
        }
      }
    }
  }

  const agentHas = new Map<string, Set<string>>();
  for (const [agentName, files] of perAgent) {
    for (const rel of files.keys()) {
      if (!agentHas.has(rel)) agentHas.set(rel, new Set());
      agentHas.get(rel)!.add(agentName);
    }
  }

  const allSourceAgents = sources
    .map(s => s.agent)
    .filter(a => {
      const p = profiles[a as keyof AgentProfiles];
      return p?.enabled === true;
    });

  return { allFiles, allOwner, agentHas, allSourceAgents, perAgent };
}

/**
 * Detect pending distributions for a resource type (skills or agents).
 * Returns pending items without executing them.
 */
function detectResourceDistributions(
  kind: 'skill' | 'agent',
  sources: ReadonlyArray<{ readonly agent: string; readonly dir: string }>,
  profiles: AgentProfiles,
): PendingDistribution[] {
  const { allFiles, allOwner, agentHas, allSourceAgents, perAgent: _perAgent } = aggregateResources(sources, profiles);
  const items: PendingDistribution[] = [];

  for (const [relFile, srcAbs] of allFiles) {
    const owners = agentHas.get(relFile) ?? new Set<string>();
    const sourceAgent = allOwner.get(relFile) ?? '';

    for (const targetAgent of allSourceAgents) {
      if (targetAgent === sourceAgent) continue;
      const targetHasIt = owners.has(targetAgent);
      const targetDir = path.join(
        expandHome((profiles[targetAgent as keyof AgentProfiles] as AgentProfile).workspacePath),
        sources.find(s => s.agent === targetAgent)!.dir,
      );
      const targetPath = path.join(targetDir, relFile);

      if (!targetHasIt) {
        if (owners.size === 1) {
          items.push({ kind, action: 'add', relFile, sourceAgent, targetAgents: [targetAgent], sourceAbs: srcAbs });
        }
      } else {
        if (path.resolve(targetPath) === path.resolve(srcAbs)) continue;
        try {
          if (fs.readFileSync(targetPath).equals(fs.readFileSync(srcAbs))) continue;
        } catch { /* fall through */ }
        items.push({ kind, action: 'update', relFile, sourceAgent, targetAgents: [targetAgent], sourceAbs: srcAbs });
      }
    }
  }

  // Detect delete cases
  for (const [relFile, owners] of agentHas) {
    const missingFrom = allSourceAgents.filter(a => !owners.has(a));
    if (missingFrom.length > 0 && owners.size > 1) {
      const srcAgent = [...owners][0]!;
      const srcAbs = allFiles.get(relFile) ?? '';
      for (const target of missingFrom) {
        items.push({ kind, action: 'delete', relFile, sourceAgent: srcAgent, targetAgents: [target], sourceAbs: srcAbs });
      }
    }
  }

  return items;
}

/**
 * Distribute shared content (skills, MCP configs, custom agents) to each agent's local directory.
 * Skills and custom agents: collect pending distributions for user confirmation (no files written).
 * MCP configs: distributed automatically (low-risk config merges).
 * Called before push to prepare cross-agent sharing.
 */
export function distributeShared(cfg: WangchuanConfig): void {
  const shared = cfg.shared;
  if (!shared) return;
  const profiles = cfg.profiles.default;
  const pendingItems: PendingDistribution[] = [];

  // ── Skills: collect pending distributions (no file writes) ──────
  pendingItems.push(...detectResourceDistributions('skill', shared.skills.sources, profiles));

  // ── Distribute MCP configs: automatic (unchanged) ──────────────
  const mergedMcp: Record<string, unknown> = {};
  const mcpMtimes: Record<string, number> = {};
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
          if (!(key in mergedMcp) || mtime > (mcpMtimes[key] ?? 0)) {
            mergedMcp[key] = val;
            mcpMtimes[key] = mtime;
          }
        }
      }
    } catch { /* ignore parse failures */ }
  }
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
        let changed = false;
        for (const [key, val] of Object.entries(mergedMcp)) {
          if (!(key in currentMcp)) {
            currentMcp[key] = val;
            changed = true;
          } else if (JSON.stringify(currentMcp[key]) !== JSON.stringify(val)) {
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
    pendingItems.push(...detectResourceDistributions('agent', shared.agents.sources, profiles));
  }

  // ── Write pending distributions if any ──────────────────────────
  if (pendingItems.length > 0) {
    const merged = mergePendingItems(pendingItems);
    savePendingDistributions(merged);
  }
}

/**
 * Process pending distributions interactively.
 * Groups by relFile, prompts user for each, executes the chosen actions.
 */
export async function processPendingDistributions(cfg: WangchuanConfig): Promise<void> {
  const pending = loadPendingDistributions();
  if (pending.length === 0) return;

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
    const allTargets = [...new Set(items.flatMap(i => [...i.targetAgents]))];

    console.log();
    logger.info(t('sync.distItem', {
      kind: first.kind,
      action: first.action,
      file: first.relFile,
      source: first.sourceAgent,
    }));
    logger.info(t('sync.distPrompt'));

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
    if (!fs.existsSync(item.sourceAbs)) return;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(item.sourceAbs, targetPath);
    logger.ok(`  ${t('sync.distApplied', { action: item.action, file: item.relFile, agent: targetAgent })}`);
  }
}
