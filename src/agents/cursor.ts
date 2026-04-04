/**
 * Cursor agent definition
 */

import os from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';

export const cursor: AgentDefinition = {
  name: 'cursor',
  profile: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.cursor'),
    syncFiles: [],
    syncDirs: [
      { src: 'rules/', encrypt: false },
    ],
    jsonFields: [
      {
        src:      'mcp.json',
        fields:   ['mcpServers'],
        repoName: 'mcpServers.json',
        encrypt:  true,
      },
      {
        src:      'cli-config.json',
        fields:   ['permissions', 'model', 'enabledPlugins'],
        repoName: 'cli-config-sync.json',
        encrypt:  true,
      },
    ],
  },
  sharedMcp: { src: 'mcp.json', field: 'mcpServers' },
};
