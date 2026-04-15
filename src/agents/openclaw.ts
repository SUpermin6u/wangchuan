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
      { src: 'MEMORY.md',     encrypt: true  },
      { src: 'AGENTS.md',     encrypt: false },
      { src: 'SOUL.md',       encrypt: false },
      { src: 'TOOLS.md',      encrypt: false },
      { src: 'IDENTITY.md',   encrypt: false },
      { src: 'USER.md',       encrypt: true  },
      { src: 'HEARTBEAT.md',  encrypt: false },
      { src: 'BOOTSTRAP.md',  encrypt: false },  // Agent bootstrap/onboarding instructions
    ],
    syncDirs: [
      { src: 'memory/', encrypt: true },
      { src: 'skills/', encrypt: false },
    ],
    jsonFields: [
      // openclaw.json is at ~/.openclaw/ (one level up from workspace)
      {
        src: path.join('..', 'openclaw.json'),
        fields: ['agents', 'skills', 'ui'],
        repoName: 'openclaw-config.json',
        encrypt: true,
      },
    ],
  },
  sharedSkills: { dir: 'skills/' },
  sharedMcp: { src: 'config/mcporter.json', field: 'mcpServers' },
};
