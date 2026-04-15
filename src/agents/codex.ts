/**
 * Codex agent definition
 *
 * OpenAI Codex CLI agent. Default workspace: ~/.codex
 * Syncs memory and instruction files.
 */

import os from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';

export const codex: AgentDefinition = {
  name: 'codex',
  profile: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.codex'),
    syncFiles: [
      { src: 'MEMORY.md',       encrypt: true  },
      { src: 'instructions.md', encrypt: false },
      { src: 'AGENTS.md',       encrypt: false },
      { src: 'config.toml',     encrypt: true  },
    ],
    syncDirs: [
      { src: 'skills/',   encrypt: false },
      { src: 'memories/', encrypt: true  },
      { src: 'agents/',   encrypt: false },
    ],
  },
  sharedSkills: { dir: 'skills/' },
};
