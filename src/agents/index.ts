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

import type { AgentDefinition } from './types.js';
import type { AgentProfiles, SharedConfig } from '../types.js';

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

/** Build AgentProfiles from definitions */
export function buildDefaultProfiles(): AgentProfiles {
  const profiles: Record<string, unknown> = {};
  for (const def of AGENT_DEFINITIONS) {
    profiles[def.name] = def.profile;
  }
  return profiles as unknown as AgentProfiles;
}

/** Build SharedConfig from definitions */
export function buildDefaultShared(): SharedConfig {
  const skillSources = AGENT_DEFINITIONS
    .filter(d => d.sharedSkills)
    .map(d => ({ agent: d.name as never, dir: d.sharedSkills!.dir }));

  const mcpSources = AGENT_DEFINITIONS
    .filter(d => d.sharedMcp)
    .map(d => ({ agent: d.name as never, src: d.sharedMcp!.src, field: d.sharedMcp!.field }));

  return {
    skills:    { sources: skillSources },
    mcp:       { sources: mcpSources },
    syncFiles: [
      { src: 'memory/SHARED.md', workspacePath: '~/.openclaw/workspace', encrypt: true },
    ],
  };
}

export type { AgentDefinition } from './types.js';
