/**
 * OpenClaw agent definition
 */

import os from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';

export const openclaw: AgentDefinition = {
  name: 'openclaw',
  profile: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.openclaw', 'workspace'),
    syncFiles: [
      { src: 'MEMORY.md',   encrypt: true  },
      { src: 'AGENTS.md',   encrypt: false },
      { src: 'SOUL.md',     encrypt: false },
      { src: 'IDENTITY.md', encrypt: false },
      { src: 'USER.md',     encrypt: true  },
    ],
    syncDirs: [
      { src: 'memory/', encrypt: true },
    ],
  },
  sharedSkills: { dir: 'skills/' },
  sharedMcp: { src: 'config/mcporter.json', field: 'mcpServers' },
};
