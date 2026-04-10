/**
 * Gemini agent definition
 */

import os from 'os';
import path from 'path';
import type { AgentDefinition } from './types.js';

export const gemini: AgentDefinition = {
  name: 'gemini',
  profile: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.gemini'),
    syncFiles: [],
    syncDirs: [
      { src: 'skills/', encrypt: false },
    ],
    jsonFields: [
      {
        src:      'settings.internal.json',
        fields:   ['security', 'model', 'general'],
        repoName: 'settings-sync.json',
        encrypt:  true,
      },
    ],
  },
  sharedSkills: { dir: 'skills/' },
};
