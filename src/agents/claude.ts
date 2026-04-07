/**
 * Claude agent definition
 */

import os from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';

export const claude: AgentDefinition = {
  name: 'claude',
  profile: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.claude'),
    syncFiles: [
      { src: 'CLAUDE.md',     encrypt: false },
      { src: 'settings.json', encrypt: true  },
    ],
    jsonFields: [
      {
        src:      '.claude.json',
        fields:   ['mcpServers'],
        repoName: 'mcpServers.json',
        encrypt:  true,
      },
    ],
  },
  sharedSkills: { dir: 'skills/' },
  sharedMcp: { src: '.claude.json', field: 'mcpServers' },
};
