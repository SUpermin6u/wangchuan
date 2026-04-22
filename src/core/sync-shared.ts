/**
 * sync-shared.ts — Cross-agent sharing distribution logic
 *
 * New architecture (shared registry):
 * - Skills/agents are agent-specific by default
 * - Only resources explicitly registered in shared-registry.json are shared
 * - distributeShared detects NEW resources and saves pending prompts
 * - processPendingDistributions asks user → on confirm: register as shared + copy to agents
 * - On decline: resource stays agent-specific, NOT pushed to shared tier
 * - Delete propagation: when source agent deletes a shared resource, prompt to delete from others
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { expandHome, walkDir } from './sync.js';
import { logger }       from '../utils/logger.js';
import { t }            from '../i18n.js';
import {
  resourceName,
  registerShared,
  unregisterShared,
  getSharedNames,
} from './shared-registry.js';
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
export function savePendingDistributions(items: readonly PendingDistribution[]): void {
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

/** Check if there are any pending actions awaiting user decision */
export function hasPendingActions(): boolean {
  return loadPendingDeletions().length > 0 || loadPendingDistributions().length > 0;
}

// ── Shared distribution logic ──────────────────────────────────────

/**
 * Aggregate resources (skills or custom agents) from multiple agent sources.
 * Returns a merged map and ownership tracking.
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
 *
 * NEW LOGIC (shared registry):
 * 1. For already-shared resources: detect add/update/delete across agents
 * 2. For delete: when a shared resource is removed from ONE agent, ask user
 *    whether to delete it from ALL other agents that still have it
 *
 * Resources are agent-specific by default. Only explicitly shared resources
 * (registered in shared-registry.json) are distributed.
 */
function detectResourceDistributions(
  kind: 'skill' | 'agent',
  sources: ReadonlyArray<{ readonly agent: string; readonly dir: string }>,
  profiles: AgentProfiles,
): PendingDistribution[] {
  const { allFiles, allOwner, agentHas, allSourceAgents, perAgent } = aggregateResources(sources, profiles);
  const items: PendingDistribution[] = [];
  const sharedNames = new Set(getSharedNames(kind));

  // ── 1. Already-shared resources: distribute to agents that don't have them ──
  for (const [relFile, srcAbs] of allFiles) {
    const resName = resourceName(relFile);
    if (!sharedNames.has(resName)) continue;

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
        // Shared resource missing from this agent → add it
        items.push({ kind, action: 'add', relFile, sourceAgent, targetAgents: [targetAgent], sourceAbs: srcAbs });
      } else {
        // Both have it — check for content differences (update)
        if (path.resolve(targetPath) === path.resolve(srcAbs)) continue;
        try {
          if (fs.readFileSync(targetPath).equals(fs.readFileSync(srcAbs))) continue;
        } catch { /* fall through */ }
        items.push({ kind, action: 'update', relFile, sourceAgent, targetAgents: [targetAgent], sourceAbs: srcAbs });
      }
    }
  }

  // ── 2. Delete: shared resource removed from an agent that previously had it ──
  // Only consider agents that have at least one resource in this kind's directory
  // (to avoid false positives from newly enabled agents with empty dirs)
  for (const name of sharedNames) {
    const agentsWithResource: string[] = [];
    const agentsDeletedResource: string[] = [];

    for (const agent of allSourceAgents) {
      const p = profiles[agent as keyof AgentProfiles];
      if (!p?.enabled) continue;
      const source = sources.find(s => s.agent === agent);
      if (!source) continue;
      const dir = path.join(expandHome(p.workspacePath), source.dir, name);
      const agentFiles = perAgent.get(agent);

      // Check if the agent's base directory for this kind exists
      // (distinguishes "active agent that deleted a resource" from "newly enabled agent with no data")
      const baseDir = path.join(expandHome(p.workspacePath), source.dir);
      const baseDirExists = fs.existsSync(baseDir);

      if (fs.existsSync(dir)) {
        agentsWithResource.push(agent);
      } else if (baseDirExists) {
        // Agent has the base dir (skills/ or agents/) but this resource is missing → likely deleted
        agentsDeletedResource.push(agent);
      }
      // else: agent's base dir doesn't exist → newly enabled, skip
    }

    if (agentsDeletedResource.length > 0 && agentsWithResource.length > 0) {
      const srcAgent = agentsDeletedResource[0]!;
      for (const target of agentsWithResource) {
        items.push({
          kind,
          action: 'delete',
          relFile: name,
          sourceAgent: srcAgent,
          targetAgents: [target],
          sourceAbs: '',
        });
      }
    }

    if (agentsWithResource.length === 0 && agentsDeletedResource.length > 0) {
      unregisterShared(kind, name);
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

  // ── MCP: agent-specific by default, no auto-merge ──────────────
  // MCP configs are still pushed to shared/mcp/ for cloud backup,
  // but local distribution is handled manually by the user.

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
 * Groups by resource name, prompts user for each, executes the chosen actions.
 *
 * Key behavior:
 * - User confirms → resource registered as shared + copied to selected agents
 * - User declines → resource stays agent-specific (not registered in shared)
 * - Delete action → resource removed from selected agents; if all agents remove it, unregistered
 */
export async function processPendingDistributions(cfg: WangchuanConfig): Promise<void> {
  // Distributions require interactive user confirmation — never auto-confirm.
  // If stdin is not a TTY, skip and leave pending items for next interactive session.
  if (!process.stdin.isTTY) return;

  const pending = loadPendingDistributions();
  if (pending.length === 0) return;

  const shared = cfg.shared;
  if (!shared) { clearPendingDistributions(); return; }

  // Group by kind + resource name (not relFile, so all files in a skill group together)
  const grouped = new Map<string, PendingDistribution[]>();
  for (const item of pending) {
    const resName = resourceName(item.relFile);
    const key = `${item.kind}:${item.action}:${resName}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  logger.info(t('sync.pendingDistributions', { count: grouped.size }));

  const rl = await import('readline');

  for (const [, items] of grouped) {
    const first = items[0]!;
    const resName = resourceName(first.relFile);
    const allTargets = [...new Set(items.flatMap(i => [...i.targetAgents]))];

    console.log();
    logger.info(t('sync.distItem', {
      kind: first.kind,
      action: first.action,
      file: resName,
      source: first.sourceAgent,
    }));

    let selectedAgents: string[];
    {
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
      selectedAgents = [];

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
    }

    // Execute distribution for selected agents
    for (const targetAgent of selectedAgents) {
      for (const item of items) {
        if (!item.targetAgents.includes(targetAgent)) continue;
        executeDistribution(item, targetAgent, cfg);
      }
    }

    // ── Registry updates based on user choice ──
    if (first.action === 'add' || first.action === 'update') {
      if (selectedAgents.length > 0) {
        // User confirmed sharing → register as shared
        registerShared(first.kind, resName, first.sourceAgent);
        logger.ok(`  ${t('sync.distRegistered', { name: resName })}`);
      } else {
        // User declined → stays agent-specific (not registered)
        logger.info(t('sync.distSkipped'));
      }
    } else if (first.action === 'delete') {
      if (selectedAgents.length > 0) {
        logger.ok(`  ${t('sync.distDeleteApplied', { name: resName, count: selectedAgents.length })}`);
      }
      // If user chose to delete from all targets, check if resource should be unregistered
      if (selectedAgents.length === allTargets.length) {
        unregisterShared(first.kind, resName);
      }
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
    // For delete: remove the resource directory (not just one file)
    const resName = resourceName(item.relFile);
    const resourceDir = path.join(targetDir, resName);
    if (fs.existsSync(resourceDir)) {
      fs.rmSync(resourceDir, { recursive: true, force: true });
      logger.ok(`  ${t('sync.distApplied', { action: 'delete', file: resName, agent: targetAgent })}`);
    }
  } else {
    // Copy entire resource directory (not just one file)
    const resName = resourceName(item.relFile);
    const srcSource = item.kind === 'skill'
      ? shared.skills.sources.find(s => s.agent === item.sourceAgent)
      : shared.agents?.sources.find(s => s.agent === item.sourceAgent);
    if (!srcSource) return;
    const srcAgentProfile = profiles[item.sourceAgent as keyof typeof profiles];
    if (!srcAgentProfile) return;
    const srcBaseDir = path.join(expandHome(srcAgentProfile.workspacePath), srcSource.dir, resName);
    const targetResDir = path.join(targetDir, resName);

    if (fs.existsSync(srcBaseDir)) {
      // Copy entire resource directory
      fs.mkdirSync(targetResDir, { recursive: true });
      for (const relFile of walkDir(srcBaseDir)) {
        const srcFile = path.join(srcBaseDir, relFile);
        const dstFile = path.join(targetResDir, relFile);
        fs.mkdirSync(path.dirname(dstFile), { recursive: true });
        fs.copyFileSync(srcFile, dstFile);
      }
      logger.ok(`  ${t('sync.distApplied', { action: item.action, file: resName, agent: targetAgent })}`);
    } else if (fs.existsSync(item.sourceAbs)) {
      // Fallback: copy single file
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(item.sourceAbs, targetPath);
      logger.ok(`  ${t('sync.distApplied', { action: item.action, file: item.relFile, agent: targetAgent })}`);
    }
  }
}
