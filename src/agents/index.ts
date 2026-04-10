/**
 * agents/index.ts — Agent registry
 *
 * Each agent is defined in its own file. This module collects them into
 * AGENT_DEFINITIONS, which is the single source of truth for:
 *   - AGENT_NAMES (types.ts)
 *   - DEFAULT_PROFILES and DEFAULT_SHARED (config.ts)
 *
 * To add a new agent, create a new file in src/agents/ and add it to
 * the imports below — no changes needed in types.ts or config.ts.
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';
import type { AgentProfiles, AgentProfile, SharedConfig } from '../types.js';
import { AGENT_NAMES } from '../types.js';

import { openclaw }  from './openclaw.js';
import { claude }    from './claude.js';
import { gemini }    from './gemini.js';
import { codebuddy } from './codebuddy.js';
import { workbuddy } from './workbuddy.js';
import { cursor }    from './cursor.js';
import { codex }     from './codex.js';

/**
 * Ordered list of all agent definitions.
 * The order here determines AGENT_NAMES order and iteration order.
 */
export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  openclaw,
  claude,
  gemini,
  codebuddy,
  workbuddy,
  cursor,
  codex,
] as const;

/** Derive AGENT_NAMES tuple from definitions (keeps type safety) */
export const AGENT_NAMES_FROM_DEFS = AGENT_DEFINITIONS.map(d => d.name);

// Runtime guard: AGENT_DEFINITIONS must match AGENT_NAMES in types.ts.
// If you add/remove an agent, update BOTH AGENT_DEFINITIONS here AND AGENT_NAMES in types.ts.
if (AGENT_NAMES.length !== AGENT_NAMES_FROM_DEFS.length ||
    !AGENT_NAMES.every((n, i) => n === AGENT_NAMES_FROM_DEFS[i])) {
  throw new Error(
    `AGENT_NAMES is out of sync with AGENT_DEFINITIONS.\n` +
    `  types.ts: [${[...AGENT_NAMES].join(', ')}]\n` +
    `  agents/index.ts: [${AGENT_NAMES_FROM_DEFS.join(', ')}]`,
  );
}

/** Build AgentProfiles from definitions */
export function buildDefaultProfiles(): AgentProfiles {
  const profiles: Record<string, unknown> = {};
  for (const def of AGENT_DEFINITIONS) {
    profiles[def.name] = def.profile;
  }
  return profiles as unknown as AgentProfiles;
}

/**
 * Auto-detect which agents are installed by checking workspace directory existence.
 * Returns a new AgentProfiles with only detected agents enabled.
 */
export function autoDetectAgents(profiles: AgentProfiles): AgentProfiles {
  const result: Record<string, unknown> = {};
  for (const def of AGENT_DEFINITIONS) {
    const profile = profiles[def.name as keyof AgentProfiles];
    const wsPath = profile.workspacePath.startsWith('~')
      ? path.join(os.homedir(), profile.workspacePath.slice(1))
      : profile.workspacePath;
    let detected = false;
    try {
      detected = fs.statSync(wsPath).isDirectory();
    } catch { /* does not exist */ }
    result[def.name] = { ...profile, enabled: detected } as AgentProfile;
  }
  return result as unknown as AgentProfiles;
}

/** Build SharedConfig from definitions */
export function buildDefaultShared(): SharedConfig {
  const skillSources = AGENT_DEFINITIONS
    .filter(d => d.sharedSkills)
    .map(d => ({ agent: d.name as never, dir: d.sharedSkills!.dir }));

  const mcpSources = AGENT_DEFINITIONS
    .filter(d => d.sharedMcp)
    .map(d => ({ agent: d.name as never, src: d.sharedMcp!.src, field: d.sharedMcp!.field }));

  const agentSources = AGENT_DEFINITIONS
    .filter(d => d.sharedAgents)
    .map(d => ({ agent: d.name as never, dir: d.sharedAgents!.dir }));

  return {
    skills:    { sources: skillSources },
    mcp:       { sources: mcpSources },
    agents:    { sources: agentSources },
    syncFiles: [
      { src: 'memory/SHARED.md', workspacePath: '~/.openclaw/workspace', encrypt: true },
    ],
  };
}

export type { AgentDefinition } from './types.js';
