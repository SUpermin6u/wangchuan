/**
 * CodeBuddy agent definition
 */

import os from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';

export const codebuddy: AgentDefinition = {
  name: 'codebuddy',
  profile: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.codebuddy'),
    syncFiles: [
      { src: 'MEMORY.md',                        encrypt: true  },
      { src: 'CODEBUDDY.md',                     encrypt: false },
      { src: 'plugins/known_marketplaces.json',   encrypt: false },
      { src: 'plugins/installed_plugins.json',   encrypt: false },
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
