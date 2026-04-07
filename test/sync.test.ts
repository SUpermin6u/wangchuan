/**
 * sync.test.ts — Sync engine unit tests
 *
 * Coverage:
 *   - buildFileEntries entry generation (agents + shared + jsonFields + dedup)
 *   - distributeShared (skills distribution, MCP distribution)
 *   - stageToRepo + restoreFromRepo round-trip consistency
 *   - jsonFields field-level extraction/merge without data loss
 *   - New skill/MCP cross-agent sharing
 *   - Behavior after skill deletion (add-only model)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { syncEngine, buildFileEntries } from '../src/core/sync.js';
import { cryptoEngine } from '../src/core/crypto.js';
import type { WangchuanConfig } from '../src/types.js';

// ── Test utilities ──────────────────────────────────────────────────

const TMP     = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-sync-'));
const KEY     = path.join(TMP, 'master.key');
const REPO    = path.join(TMP, 'repo');
const WS_OC   = path.join(TMP, 'openclaw');
const WS_CL   = path.join(TMP, 'claude');
const WS_GE   = path.join(TMP, 'gemini');
const WS_CB   = path.join(TMP, 'codebuddy');
const WS_WB   = path.join(TMP, 'workbuddy');
const WS_CU   = path.join(TMP, 'cursor');
const WS_CX   = path.join(TMP, 'codex');

function mkCfg(overrides?: Partial<WangchuanConfig>): WangchuanConfig {
  return {
    repo: 'git@example.com:test.git',
    branch: 'main',
    localRepoPath: REPO,
    keyPath: KEY,
    hostname: 'test-host',
    version: 2,
    profiles: {
      default: {
        openclaw: {
          enabled: true,
          workspacePath: WS_OC,
          syncFiles: [
            { src: 'MEMORY.md', encrypt: true },
            { src: 'SOUL.md',   encrypt: false },
          ],
        },
        claude: {
          enabled: true,
          workspacePath: WS_CL,
          syncFiles: [
            { src: 'CLAUDE.md', encrypt: false },
          ],
          jsonFields: [
            { src: '.claude.json', fields: ['mcpServers'], repoName: 'mcpServers.json', encrypt: true },
          ],
        },
        gemini: {
          enabled: true,
          workspacePath: WS_GE,
          syncFiles: [],
          jsonFields: [
            { src: 'settings.json', fields: ['security', 'model'], repoName: 'settings-sync.json', encrypt: false },
          ],
        },
        codebuddy: {
          enabled: true,
          workspacePath: WS_CB,
          syncFiles: [
            { src: 'MEMORY.md',    encrypt: true  },
            { src: 'CODEBUDDY.md', encrypt: false },
          ],
          jsonFields: [
            { src: 'mcp.json', fields: ['mcpServers'], repoName: 'mcpServers.json', encrypt: true },
            { src: 'settings.json', fields: ['enabledPlugins'], repoName: 'settings-sync.json', encrypt: true },
          ],
        },
        workbuddy: {
          enabled: true,
          workspacePath: WS_WB,
          syncFiles: [
            { src: 'MEMORY.md',   encrypt: true  },
            { src: 'IDENTITY.md', encrypt: false },
            { src: 'SOUL.md',     encrypt: false },
            { src: 'USER.md',     encrypt: true  },
          ],
          jsonFields: [
            { src: 'mcp.json', fields: ['mcpServers'], repoName: 'mcpServers.json', encrypt: true },
            { src: 'settings.json', fields: ['enabledPlugins'], repoName: 'settings-sync.json', encrypt: true },
          ],
        },
        cursor: {
          enabled: true,
          workspacePath: WS_CU,
          syncFiles: [],
          jsonFields: [
            { src: 'mcp.json', fields: ['mcpServers'], repoName: 'mcpServers.json', encrypt: true },
            { src: 'cli-config.json', fields: ['permissions', 'model', 'enabledPlugins'], repoName: 'cli-config-sync.json', encrypt: true },
          ],
        },
        codex: {
          enabled: true,
          workspacePath: WS_CX,
          syncFiles: [
            { src: 'MEMORY.md',       encrypt: true  },
            { src: 'instructions.md', encrypt: false },
          ],
        },
      },
    },
    shared: {
      skills: {
        sources: [
          { agent: 'claude',    dir: 'skills/' },
          { agent: 'openclaw',  dir: 'skills/' },
          { agent: 'codebuddy', dir: 'skills/' },
        ],
      },
      mcp: {
        sources: [
          { agent: 'claude',    src: '.claude.json',         field: 'mcpServers' },
          { agent: 'openclaw',  src: 'config/mcporter.json', field: 'mcpServers' },
          { agent: 'codebuddy', src: 'mcp.json',             field: 'mcpServers' },
          { agent: 'workbuddy', src: 'mcp.json',             field: 'mcpServers' },
          { agent: 'cursor',    src: 'mcp.json',             field: 'mcpServers' },
        ],
      },
      syncFiles: [],
    },
    ...overrides,
  } as WangchuanConfig;
}

/** Write file, auto-creating parent dirs */
function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** CodeBuddy MCP config is at workspacePath/mcp.json */
const CB_MCP = path.join(WS_CB, 'mcp.json');

/** Prepare empty MCP configs for all agents that participate in shared MCP */
function prepareEmptyMcpFiles(): void {
  writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
  writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');
  writeFile(CB_MCP, '{"mcpServers":{}}');
  writeFile(path.join(WS_WB, 'mcp.json'), '{"mcpServers":{}}');
  writeFile(path.join(WS_CU, 'mcp.json'), '{"mcpServers":{}}');
}

// ── Setup / Teardown ────────────────────────────────────────────────

before(() => {
  cryptoEngine.generateKey(KEY);
  for (const d of [REPO, WS_OC, WS_CL, WS_GE, WS_CB, WS_WB, WS_CU, WS_CX]) {
    fs.mkdirSync(d, { recursive: true });
  }
  // Pre-create empty MCP configs for all shared MCP source agents
  prepareEmptyMcpFiles();
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ── buildFileEntries tests ──────────────────────────────────────────

describe('buildFileEntries', () => {
  it('generates agents/<name>/ prefixed entries for each agent', () => {
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg);
    const ocEntries = entries.filter(e => e.agentName === 'openclaw');
    assert.ok(ocEntries.length >= 2);
    assert.ok(ocEntries.every(e => e.repoRel.startsWith('agents/openclaw/')));

    const clEntries = entries.filter(e => e.agentName === 'claude');
    assert.ok(clEntries.length >= 1);
    assert.ok(clEntries.every(e =>
      e.repoRel.startsWith('agents/claude/') || e.repoRel.startsWith('shared/'),
    ));
  });

  it('jsonFields entries carry jsonExtract metadata', () => {
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg);
    const jfEntries = entries.filter(e => e.jsonExtract);
    assert.ok(jfEntries.length >= 2); // claude mcpServers + gemini settings

    const claudeJf = jfEntries.find(e => e.repoRel.includes('mcpServers'));
    assert.ok(claudeJf);
    assert.deepStrictEqual(claudeJf.jsonExtract!.fields, ['mcpServers']);
    assert.ok(claudeJf.encrypt);
  });

  it('--agent filter returns only specified agent entries', () => {
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg, undefined, 'gemini');
    assert.ok(entries.length > 0);
    assert.ok(entries.every(e => e.agentName === 'gemini'));
  });

  it('shared skills entries carry shared identifier', () => {
    // Create skill file so walkDir can find it
    writeFile(path.join(WS_CL, 'skills', 'test.md'), '# test skill');
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg);
    const sharedSkills = entries.filter(
      e => e.agentName === 'shared' && e.repoRel.startsWith('shared/skills/'),
    );
    assert.ok(sharedSkills.length >= 1);
    fs.rmSync(path.join(WS_CL, 'skills'), { recursive: true, force: true });
  });

  it('repoRel dedup: same-name skill across agents keeps only first', () => {
    writeFile(path.join(WS_CL, 'skills', 'dup.md'), 'claude version');
    writeFile(path.join(WS_OC, 'skills', 'dup.md'), 'openclaw version');
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg);
    const dupEntries = entries.filter(e => e.repoRel === path.join('shared', 'skills', 'dup.md'));
    assert.equal(dupEntries.length, 1, 'same-name skill should be deduped to 1 entry');
    // Cleanup
    fs.rmSync(path.join(WS_CL, 'skills'), { recursive: true, force: true });
    fs.rmSync(path.join(WS_OC, 'skills'), { recursive: true, force: true });
  });
});

// ── stageToRepo + restoreFromRepo round-trip tests ──────────────────

describe('stageToRepo → restoreFromRepo round-trip', () => {
  it('whole-file sync: push then pull content matches', async () => {
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# 记忆内容 v1');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# 灵魂');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# Claude 指令');
    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });

    const pushResult = await syncEngine.stageToRepo(cfg);
    assert.ok(pushResult.synced.length >= 3);

    // Repo files should exist
    assert.ok(fs.existsSync(path.join(REPO, 'agents/openclaw/MEMORY.md.enc')));
    assert.ok(fs.existsSync(path.join(REPO, 'agents/openclaw/SOUL.md')));
    assert.ok(fs.existsSync(path.join(REPO, 'agents/claude/CLAUDE.md')));

    // Simulate new environment: delete local files
    fs.unlinkSync(path.join(WS_OC, 'MEMORY.md'));
    fs.unlinkSync(path.join(WS_CL, 'CLAUDE.md'));

    const pullResult = await syncEngine.restoreFromRepo(cfg);
    assert.ok(pullResult.synced.length >= 3);

    // Restored content should match
    assert.equal(fs.readFileSync(path.join(WS_OC, 'MEMORY.md'), 'utf-8'), '# 记忆内容 v1');
    assert.equal(fs.readFileSync(path.join(WS_CL, 'CLAUDE.md'), 'utf-8'), '# Claude 指令');
  });

  it('jsonFields: push extracts specified fields only, pull merge-back preserves others', async () => {
    const claudeJson = {
      mcpServers: { playwright: { type: 'stdio', cmd: 'npx' } },
      tipsHistory: { tip1: 5 },
      numStartups: 42,
      projects: { '/tmp/proj': { cost: 100 } },
    };
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify(claudeJson, null, 2));
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# Claude');

    const geminiJson = {
      security: { auth: 'gongfeng' },
      model: { name: 'opus' },
      ide: { seen: true },
      cache: { size: 999 },
    };
    writeFile(path.join(WS_GE, 'settings.json'), JSON.stringify(geminiJson, null, 2));

    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });
    await syncEngine.stageToRepo(cfg);

    // Repo: Claude mcpServers.json.enc should only contain mcpServers
    const claudeRepoFile = path.join(REPO, 'agents/claude/mcpServers.json.enc');
    assert.ok(fs.existsSync(claudeRepoFile));
    const decrypted = JSON.parse(
      cryptoEngine.decryptString(fs.readFileSync(claudeRepoFile, 'utf-8').trim(), KEY),
    );
    assert.deepStrictEqual(Object.keys(decrypted), ['mcpServers']);
    assert.ok(!('tipsHistory' in decrypted), 'tipsHistory should not be extracted');

    // Repo: Gemini settings-sync.json should only contain security + model
    const geminiRepoFile = path.join(REPO, 'agents/gemini/settings-sync.json');
    assert.ok(fs.existsSync(geminiRepoFile));
    const geminiPartial = JSON.parse(fs.readFileSync(geminiRepoFile, 'utf-8'));
    assert.deepStrictEqual(Object.keys(geminiPartial).sort(), ['model', 'security']);

    // Simulate remote modification of mcpServers (add new server)
    const modified = { mcpServers: { playwright: { type: 'stdio', cmd: 'npx' }, gongfeng: { type: 'sse' } } };
    const enc = cryptoEngine.encryptString(JSON.stringify(modified, null, 2), KEY);
    fs.writeFileSync(claudeRepoFile, enc, 'utf-8');

    // Pull back
    await syncEngine.restoreFromRepo(cfg);

    // .claude.json should preserve tipsHistory/numStartups/projects, mcpServers updated
    const restored = JSON.parse(fs.readFileSync(path.join(WS_CL, '.claude.json'), 'utf-8'));
    assert.deepStrictEqual(restored.mcpServers, modified.mcpServers);
    assert.equal(restored.tipsHistory.tip1, 5, 'tipsHistory should not be destroyed');
    assert.equal(restored.numStartups, 42, 'numStartups should not be destroyed');
    assert.deepStrictEqual(restored.projects, { '/tmp/proj': { cost: 100 } });
  });
});

// ── distributeShared tests (verified indirectly via stageToRepo) ────

describe('cross-agent skill sharing', () => {
  it('Claude adds skill → push distributes to OpenClaw', async () => {
    writeFile(path.join(WS_CL, 'skills', 'new-skill.md'), '# New Skill');
    // OpenClaw does not have this skill
    const ocSkillPath = path.join(WS_OC, 'skills', 'new-skill.md');
    if (fs.existsSync(ocSkillPath)) fs.unlinkSync(ocSkillPath);

    const cfg = mkCfg();
    // Prepare required workspace files
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    await syncEngine.stageToRepo(cfg);

    // distributeShared should copy skill to OpenClaw
    assert.ok(
      fs.existsSync(ocSkillPath),
      'OpenClaw should receive Claude new-skill.md',
    );
    assert.equal(
      fs.readFileSync(ocSkillPath, 'utf-8'),
      '# New Skill',
    );

    // Repo shared/skills/ should also have it
    assert.ok(fs.existsSync(path.join(REPO, 'shared', 'skills', 'new-skill.md')));
  });

  it('deleted skill is copied back from another agent (add-only)', async () => {
    // Both agents have old-skill
    writeFile(path.join(WS_CL, 'skills', 'old-skill.md'), '# Old');
    writeFile(path.join(WS_OC, 'skills', 'old-skill.md'), '# Old');

    // Delete from OpenClaw
    fs.unlinkSync(path.join(WS_OC, 'skills', 'old-skill.md'));

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // distributeShared copies back from Claude to OpenClaw
    assert.ok(
      fs.existsSync(path.join(WS_OC, 'skills', 'old-skill.md')),
      'deleted skill is copied back from another agent',
    );
  });
});

describe('cross-agent MCP sharing', () => {
  it('Claude adds MCP server → push distributes to OpenClaw', async () => {
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify({
      mcpServers: { playwright: { type: 'stdio' }, newServer: { type: 'sse' } },
      tipsHistory: {},
    }, null, 2));
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), JSON.stringify({
      mcpServers: { playwright: { type: 'stdio' } },
    }, null, 2));
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // OpenClaw mcporter.json should contain newServer
    const ocMcp = JSON.parse(
      fs.readFileSync(path.join(WS_OC, 'config', 'mcporter.json'), 'utf-8'),
    );
    assert.ok(
      'newServer' in ocMcp.mcpServers,
      'OpenClaw should receive Claude newServer',
    );
    assert.deepStrictEqual(
      ocMcp.mcpServers.newServer,
      { type: 'sse' },
    );
  });

  it('MCP distribution does not overwrite existing config', async () => {
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify({
      mcpServers: { playwright: { type: 'stdio', version: 'claude' } },
    }, null, 2));
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), JSON.stringify({
      mcpServers: { playwright: { type: 'stdio', version: 'openclaw' } },
    }, null, 2));
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // Both agents' playwright config should retain their own version
    const clMcp = JSON.parse(
      fs.readFileSync(path.join(WS_CL, '.claude.json'), 'utf-8'),
    );
    const ocMcp = JSON.parse(
      fs.readFileSync(path.join(WS_OC, 'config', 'mcporter.json'), 'utf-8'),
    );
    assert.equal(clMcp.mcpServers.playwright.version, 'claude');
    assert.equal(ocMcp.mcpServers.playwright.version, 'openclaw');
  });
});

// ── One-click restore (new server scenario) ─────────────────────────

describe('one-click restore on new environment', () => {
  it('pull fully restores all agent configs when workspace is empty', async () => {
    // Clean repo to avoid leftover data from previous tests
    fs.rmSync(REPO, { recursive: true, force: true });
    fs.mkdirSync(REPO, { recursive: true });

    // Push a complete dataset to repo
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# 永久记忆');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# 灵魂身份');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# Claude 全局指令');
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify({
      mcpServers: { server1: { cmd: 'test' } },
      tipsHistory: { x: 1 },
    }, null, 2));
    writeFile(path.join(WS_GE, 'settings.json'), JSON.stringify({
      security: { auth: 'test' },
      model: { name: 'gemini-2' },
      cache: { big: true },
    }, null, 2));
    writeFile(path.join(WS_CL, 'skills', 'review.md'), '# code review');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');
    // New agents: empty MCP configs for shared MCP sources
    writeFile(CB_MCP, '{"mcpServers":{}}');
    writeFile(path.join(WS_WB, 'mcp.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_CU, 'mcp.json'), '{"mcpServers":{}}');

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // Simulate new server: clear all workspaces
    for (const d of [WS_OC, WS_CL, WS_GE, WS_CB, WS_WB, WS_CU, WS_CX]) {
      fs.rmSync(d, { recursive: true, force: true });
      fs.mkdirSync(d, { recursive: true });
    }

    // Pull restore
    const pullResult = await syncEngine.restoreFromRepo(cfg);
    assert.ok(pullResult.synced.length >= 4);

    // OpenClaw restored
    assert.equal(
      fs.readFileSync(path.join(WS_OC, 'MEMORY.md'), 'utf-8'),
      '# 永久记忆',
    );
    assert.equal(
      fs.readFileSync(path.join(WS_OC, 'SOUL.md'), 'utf-8'),
      '# 灵魂身份',
    );

    // Claude restored
    assert.equal(
      fs.readFileSync(path.join(WS_CL, 'CLAUDE.md'), 'utf-8'),
      '# Claude 全局指令',
    );

    // Claude jsonFields merge-back (new env has no .claude.json → merge from empty {})
    const clJson = JSON.parse(
      fs.readFileSync(path.join(WS_CL, '.claude.json'), 'utf-8'),
    );
    assert.deepStrictEqual(clJson.mcpServers, { server1: { cmd: 'test' } });
    assert.ok(!('tipsHistory' in clJson), 'new env should not have tipsHistory');

    // Gemini jsonFields merge-back
    const geJson = JSON.parse(
      fs.readFileSync(path.join(WS_GE, 'settings.json'), 'utf-8'),
    );
    assert.deepStrictEqual(geJson.security, { auth: 'test' });
    assert.deepStrictEqual(geJson.model, { name: 'gemini-2' });
    assert.ok(!('cache' in geJson), 'new env should not have cache');

    // Shared skills distributed to all agents
    assert.ok(
      fs.existsSync(path.join(WS_CL, 'skills', 'review.md')),
      'Claude should restore skill',
    );
    assert.ok(
      fs.existsSync(path.join(WS_OC, 'skills', 'review.md')),
      'OpenClaw should also receive shared skill',
    );
  });
});

// ── Delete propagation tests ────────────────────────────────────────

describe('delete propagation', () => {
  it('skill deleted from all agents → pruned from repo on push', async () => {
    // Push a skill to repo first
    writeFile(path.join(WS_CL, 'skills', 'obsolete.md'), '# 过时的 skill');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);
    assert.ok(fs.existsSync(path.join(REPO, 'shared', 'skills', 'obsolete.md')));

    // Delete from all agents (Claude has it, OpenClaw and CodeBuddy received it via distribution)
    const clSkill = path.join(WS_CL, 'skills', 'obsolete.md');
    const ocSkill = path.join(WS_OC, 'skills', 'obsolete.md');
    const cbSkill = path.join(WS_CB, 'skills', 'obsolete.md');
    if (fs.existsSync(clSkill)) fs.unlinkSync(clSkill);
    if (fs.existsSync(ocSkill)) fs.unlinkSync(ocSkill);
    if (fs.existsSync(cbSkill)) fs.unlinkSync(cbSkill);

    // Push again
    const result = await syncEngine.stageToRepo(cfg);

    // Repo should be cleaned
    assert.ok(
      !fs.existsSync(path.join(REPO, 'shared', 'skills', 'obsolete.md')),
      'skill deleted from all agents should be pruned from repo',
    );
    assert.ok(result.deleted.includes(path.join('shared', 'skills', 'obsolete.md')));
  });

  it('whole file in repo but absent from all local agents → pruned on push', async () => {
    // Manually create a ghost file in repo (simulating old version leftovers)
    writeFile(path.join(REPO, 'agents', 'openclaw', 'GHOST.md'), '幽灵');

    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    const cfg = mkCfg();
    const result = await syncEngine.stageToRepo(cfg);

    assert.ok(
      !fs.existsSync(path.join(REPO, 'agents', 'openclaw', 'GHOST.md')),
      'ghost file in repo should be pruned',
    );
    assert.ok(result.deleted.includes(path.join('agents', 'openclaw', 'GHOST.md')));
  });

  it('deleted skill from repo is not redistributed on pull', async () => {
    // Create skill and push
    writeFile(path.join(WS_CL, 'skills', 'temp.md'), '# temp');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // Delete from all agents and push (triggers repo cleanup)
    for (const d of [WS_CL, WS_OC, WS_CB]) {
      const f = path.join(d, 'skills', 'temp.md');
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    await syncEngine.stageToRepo(cfg);
    assert.ok(!fs.existsSync(path.join(REPO, 'shared', 'skills', 'temp.md')));

    // Pull — temp.md should not appear in any agent
    await syncEngine.restoreFromRepo(cfg);
    assert.ok(!fs.existsSync(path.join(WS_CL, 'skills', 'temp.md')), 'Claude should not restore deleted skill');
    assert.ok(!fs.existsSync(path.join(WS_OC, 'skills', 'temp.md')), 'OpenClaw should not restore deleted skill');
  });
});

// ── localOnly detection tests ───────────────────────────────────────

describe('pull detects local-only files', () => {
  it('files present locally but absent from repo are marked localOnly', async () => {
    // Clear repo
    fs.rmSync(REPO, { recursive: true, force: true });
    fs.mkdirSync(REPO, { recursive: true });

    // Local files exist
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# 本地记忆');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# 灵魂');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# 指令');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');

    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });
    const result = await syncEngine.restoreFromRepo(cfg);

    // Should detect local-only files
    assert.ok(result.localOnly.length >= 2, `should have localOnly files, actual: ${result.localOnly.length}`);
    assert.ok(
      result.localOnly.some(f => f.includes('MEMORY.md')),
      'MEMORY.md should be marked as localOnly',
    );
  });

  it('jsonFields localOnly no false positive — empty extracted fields not marked', async () => {
    fs.rmSync(REPO, { recursive: true, force: true });
    fs.mkdirSync(REPO, { recursive: true });

    // .claude.json exists but mcpServers field is empty
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify({
      tipsHistory: { x: 1 },
      numStartups: 5,
    }, null, 2));
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_GE, 'settings.json'), '{}');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    // Reset new agents' MCP files to empty (no mcpServers field)
    writeFile(CB_MCP, '{}');
    writeFile(path.join(WS_WB, 'mcp.json'), '{}');
    writeFile(path.join(WS_CU, 'mcp.json'), '{}');

    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });
    const result = await syncEngine.restoreFromRepo(cfg);

    // .claude.json has no mcpServers field, should not be marked as localOnly
    assert.ok(
      !result.localOnly.some(f => f.includes('mcpServers')),
      'empty mcpServers field should not be marked as localOnly',
    );
  });
});

// ── shared MCP cross-agent distribution (on pull) ───────────────────

describe('shared MCP cross-agent distribution on pull', () => {
  it('MCP config pulled from repo is distributed to all agents', async () => {
    // Clean repo
    fs.rmSync(REPO, { recursive: true, force: true });
    fs.mkdirSync(REPO, { recursive: true });

    // Claude has MCP config, OpenClaw does not
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify({
      mcpServers: { playwright: { type: 'stdio' } },
    }, null, 2));
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');

    const cfg = mkCfg();

    // Push first (create repo content)
    await syncEngine.stageToRepo(cfg);

    // Simulate new environment: reset OpenClaw mcporter.json
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    // Pull
    await syncEngine.restoreFromRepo(cfg);

    // OpenClaw should receive playwright from shared MCP
    const ocMcp = JSON.parse(
      fs.readFileSync(path.join(WS_OC, 'config', 'mcporter.json'), 'utf-8'),
    );
    assert.ok(
      'playwright' in (ocMcp.mcpServers ?? {}),
      'OpenClaw should receive Claude MCP config via pull',
    );
  });
});

// ── JSON parse failure tolerance ────────────────────────────────────

describe('JSON parse failure tolerance', () => {
  it('corrupted JSON source file does not crash push', async () => {
    writeFile(path.join(WS_CL, '.claude.json'), '{ invalid json !!!');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });
    // Should not throw
    const result = await syncEngine.stageToRepo(cfg);
    assert.ok(
      result.skipped.some(f => f.includes('mcpServers')),
      'corrupted JSON entry should be skipped',
    );
  });
});
