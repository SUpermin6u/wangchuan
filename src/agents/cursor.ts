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
    syncFiles: [
      { src: 'extensions/extensions.json', encrypt: false },
      { src: 'hooks.json',                encrypt: false },
    ],
    syncDirs: [
      { src: 'rules/',   encrypt: false },
      { src: 'skills/',  encrypt: false },
      { src: 'agents/',  encrypt: false },
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
        fields:   ['permissions', 'model', 'enabledPlugins', 'editor', 'approvalMode', 'sandbox', 'attribution', 'network', 'modelParameters'],
        repoName: 'cli-config-sync.json',
        encrypt:  true,
      },
    ],
  },
  sharedSkills: { dir: 'skills/' },
  sharedMcp: { src: 'mcp.json', field: 'mcpServers' },
  sharedAgents: { dir: 'agents/' },
};
