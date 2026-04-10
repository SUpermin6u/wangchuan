/**
 * migrate.test.ts — ensureMigrated unit tests
 *
 * Tests profile reconciliation behavior: verifies that user customizations
 * (enabled state, workspacePath) are preserved while sync definitions are
 * updated from latest agent definitions.
 */

import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'fs';
import os     from 'os';
import path   from 'path';
import { ensureMigrated } from '../src/core/migrate.js';
import { config, CONFIG_VERSION } from '../src/core/config.js';
import { buildDefaultProfiles, buildDefaultShared, AGENT_DEFINITIONS } from '../src/agents/index.js';
import type { WangchuanConfig, AgentProfiles, AgentProfile } from '../src/types.js';
import { AGENT_NAMES } from '../src/types.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-test-migrate-'));

// Create a synthetic ~/.wangchuan structure for config.save() calls inside ensureMigrated
const FAKE_HOME = path.join(TMP, 'home');
const WANGCHUAN_DIR = path.join(FAKE_HOME, '.wangchuan');
const REPO_DIR = path.join(WANGCHUAN_DIR, 'repo');

// Backup real paths and override
const REAL_SAVE = config.save.bind(config);
let savedCfg: WangchuanConfig | null = null;

before(() => {
  fs.mkdirSync(REPO_DIR, { recursive: true });
  fs.mkdirSync(path.join(REPO_DIR, 'agents'), { recursive: true });

  // Monkey-patch config.save to capture output without writing to real ~/.wangchuan
  (config as { save: typeof config.save }).save = (cfg: WangchuanConfig) => {
    savedCfg = cfg;
  };
});

after(() => {
  // Restore real save
  (config as { save: typeof config.save }).save = REAL_SAVE;
  fs.rmSync(TMP, { recursive: true, force: true });
});

/** Build a minimal v2 config for testing */
function buildTestConfig(profileOverrides?: Partial<Record<string, Partial<AgentProfile>>>): WangchuanConfig {
  const defaults = buildDefaultProfiles();
  const profiles: Record<string, AgentProfile> = {};

  for (const name of AGENT_NAMES) {
    const def = defaults[name];
    const override = profileOverrides?.[name];
    profiles[name] = { ...def, ...override } as AgentProfile;
  }

  return {
    repo: 'git@github.com:test/test.git',
    branch: 'main',
    localRepoPath: REPO_DIR,
    keyPath: path.join(WANGCHUAN_DIR, 'master.key'),
    hostname: 'test-host',
    version: CONFIG_VERSION,
    profiles: { default: profiles as unknown as AgentProfiles },
    shared: buildDefaultShared(),
  };
}

describe('ensureMigrated — v2 config reconciliation', () => {
  it('already-current v2 config passes through without error', () => {
    const cfg = buildTestConfig();
    const result = ensureMigrated(cfg);
    assert.equal(result.version, CONFIG_VERSION);
  });

  it('preserves user enabled=true when reconciling', () => {
    const cfg = buildTestConfig({ claude: { enabled: true } });
    const result = ensureMigrated(cfg);
    const claude = result.profiles.default.claude;
    assert.equal(claude.enabled, true);
  });

  it('preserves user enabled=false when reconciling', () => {
    const cfg = buildTestConfig({ openclaw: { enabled: false } });
    const result = ensureMigrated(cfg);
    const oc = result.profiles.default.openclaw;
    assert.equal(oc.enabled, false);
  });

  it('preserves user workspacePath customization', () => {
    const customPath = '/custom/workspace/path';
    const cfg = buildTestConfig({ gemini: { workspacePath: customPath } });
    const result = ensureMigrated(cfg);
    assert.equal(result.profiles.default.gemini.workspacePath, customPath);
  });

  it('updates syncFiles from latest definitions', () => {
    const defaults = buildDefaultProfiles();
    const latestClaudeFiles = defaults.claude.syncFiles;

    // Start with an outdated syncFiles (empty array)
    const cfg = buildTestConfig({ claude: { syncFiles: [] } });
    const result = ensureMigrated(cfg);
    assert.deepEqual(result.profiles.default.claude.syncFiles, latestClaudeFiles);
  });

  it('result contains all agent names', () => {
    const cfg = buildTestConfig();
    const result = ensureMigrated(cfg);
    for (const name of AGENT_NAMES) {
      assert.ok(
        result.profiles.default[name] !== undefined,
        `agent ${name} should be present in reconciled profiles`,
      );
    }
  });

  it('result has shared config', () => {
    const cfg = buildTestConfig();
    const result = ensureMigrated(cfg);
    assert.ok(result.shared !== undefined);
    assert.ok(result.shared!.skills !== undefined);
    assert.ok(result.shared!.mcp !== undefined);
  });
});

describe('ensureMigrated — new agent detection', () => {
  it('adds new agents from definitions with enabled=false', () => {
    // Build a config missing the last agent to simulate an upgrade
    const defaults = buildDefaultProfiles();
    const profiles: Record<string, AgentProfile> = {};
    const allNames = [...AGENT_NAMES];
    const removedAgent = allNames[allNames.length - 1]!;

    for (const name of allNames) {
      if (name === removedAgent) continue;
      profiles[name] = defaults[name as keyof AgentProfiles];
    }

    const cfg: WangchuanConfig = {
      repo: 'git@github.com:test/test.git',
      branch: 'main',
      localRepoPath: REPO_DIR,
      keyPath: path.join(WANGCHUAN_DIR, 'master.key'),
      hostname: 'test-host',
      version: CONFIG_VERSION,
      profiles: { default: profiles as unknown as AgentProfiles },
      shared: buildDefaultShared(),
    };

    const result = ensureMigrated(cfg);
    const added = result.profiles.default[removedAgent as keyof AgentProfiles];
    assert.ok(added !== undefined, `${removedAgent} should be added`);
    assert.equal(added.enabled, false, 'newly added agent should be disabled');
  });
});
