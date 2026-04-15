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
      { src: 'MEMORY.md',               encrypt: true  },
      { src: 'IDENTITY.md',             encrypt: false },
      { src: 'SOUL.md',                 encrypt: false },
      { src: 'USER.md',                 encrypt: true  },
      { src: 'BOOTSTRAP.md',            encrypt: false },  // Agent bootstrap/onboarding instructions
      { src: 'extensions/extensions.json', encrypt: false },
      { src: 'plugins/known_marketplaces.json', encrypt: false },
    ],
    syncDirs: [
      { src: 'skills/', encrypt: false },
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
        fields:   ['enabledPlugins', 'hooks'],
        repoName: 'settings-sync.json',
        encrypt:  true,
      },
    ],
  },
  sharedSkills: { dir: 'skills/' },
  sharedMcp: { src: 'mcp.json', field: 'mcpServers' },
  sharedAgents: { dir: 'agents/' },
};
