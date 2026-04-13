/**
 * shared-registry.ts — Explicit registry of shared resources
 *
 * Tracks which skills and custom agents are explicitly shared across agents.
 * A resource is shared ONLY when the user explicitly confirms sharing.
 * Resources not in the registry are agent-specific.
 *
 * Registry file: ~/.wangchuan/shared-registry.json
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
let registryPath = path.join(WANGCHUAN_DIR, 'shared-registry.json');

/** Override registry path (for testing) */
export function setRegistryPath(p: string): void {
  registryPath = p;
}

/** Reset registry path to default */
export function resetRegistryPath(): void {
  registryPath = path.join(WANGCHUAN_DIR, 'shared-registry.json');
}

export interface SharedRegistryEntry {
  /** Resource name (top-level dir name, e.g. "wangchuan", "ci-cd") */
  readonly name: string;
  /** Resource type */
  readonly kind: 'skill' | 'agent';
  /** Which agent owns the canonical copy (newest version used as source) */
  readonly sourceAgent: string;
  /** Timestamp when the resource was registered as shared */
  readonly sharedAt: string;
}

interface SharedRegistryData {
  readonly entries: SharedRegistryEntry[];
}

/** Load the shared registry */
export function loadRegistry(): SharedRegistryData {
  try {
    if (!fs.existsSync(registryPath)) return { entries: [] };
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as SharedRegistryData;
  } catch { return { entries: [] }; }
}

/** Save the shared registry */
export function saveRegistry(data: SharedRegistryData): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2), 'utf-8');
}

/** Check if a resource is registered as shared */
export function isShared(kind: 'skill' | 'agent', name: string): boolean {
  const data = loadRegistry();
  return data.entries.some(e => e.kind === kind && e.name === name);
}

/** Extract top-level resource name from a relFile (e.g. "wangchuan/SKILL.md" → "wangchuan") */
export function resourceName(relFile: string): string {
  const first = relFile.split(path.sep)[0] ?? relFile.split('/')[0];
  return first ?? relFile;
}

/** Register a resource as shared */
export function registerShared(kind: 'skill' | 'agent', name: string, sourceAgent: string): void {
  const data = loadRegistry();
  const existing = data.entries.find(e => e.kind === kind && e.name === name);
  if (existing) return;
  saveRegistry({
    entries: [...data.entries, { name, kind, sourceAgent, sharedAt: new Date().toISOString() }],
  });
}

/** Unregister a resource from shared (demote to agent-specific) */
export function unregisterShared(kind: 'skill' | 'agent', name: string): void {
  const data = loadRegistry();
  saveRegistry({
    entries: data.entries.filter(e => !(e.kind === kind && e.name === name)),
  });
}

/** Get all shared resource names for a given kind */
export function getSharedNames(kind: 'skill' | 'agent'): string[] {
  const data = loadRegistry();
  return data.entries.filter(e => e.kind === kind).map(e => e.name);
}

/**
 * Migrate existing shared skills from repo to registry.
 * Called once during first run after upgrade — reads repo/shared/skills/ and
 * registers all existing skills as shared (preserving backward compatibility).
 */
export function migrateExistingToRegistry(repoPath: string): void {
  if (!fs.existsSync(repoPath)) return;
  const data = loadRegistry();
  if (data.entries.length > 0) return; // already migrated

  const entries: SharedRegistryEntry[] = [];

  // Skills
  const skillsDir = path.join(repoPath, 'shared', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      if (name.startsWith('.')) continue;
      const stat = fs.statSync(path.join(skillsDir, name));
      if (stat.isDirectory()) {
        entries.push({ name, kind: 'skill', sourceAgent: 'migrated', sharedAt: new Date().toISOString() });
      }
    }
  }

  // Custom agents
  const agentsDir = path.join(repoPath, 'shared', 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const name of fs.readdirSync(agentsDir)) {
      if (name.startsWith('.')) continue;
      const stat = fs.statSync(path.join(agentsDir, name));
      if (stat.isDirectory()) {
        entries.push({ name, kind: 'agent', sourceAgent: 'migrated', sharedAt: new Date().toISOString() });
      }
    }
  }

  if (entries.length > 0) {
    saveRegistry({ entries });
  }
}
