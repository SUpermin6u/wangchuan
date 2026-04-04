/**
 * WorkBuddy agent definition
 */

import os from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';

export const workbuddy: AgentDefinition = {
  name: 'workbuddy',
  profile: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.workbuddy'),
    syncFiles: [
      { src: 'MEMORY.md',   encrypt: true  },
      { src: 'IDENTITY.md', encrypt: false },
      { src: 'SOUL.md',     encrypt: false },
      { src: 'USER.md',     encrypt: true  },
    ],
    jsonFields: [
      {
        src:      'mcp.json',
        fields:   ['mcpServers'],
        repoName: 'mcpServers.json',
        encrypt:  true,
      },
      {
        src:      'settings.json',
        fields:   ['enabledPlugins'],
        repoName: 'settings-sync.json',
        encrypt:  true,
      },
    ],
  },
  sharedMcp: { src: 'mcp.json', field: 'mcpServers' },
};
