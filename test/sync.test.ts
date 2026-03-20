/**
 * sync.test.ts — 同步引擎单元测试
 *
 * 覆盖：
 *   - buildFileEntries 条目生成（agents + shared + jsonFields + 去重）
 *   - distributeShared（skills 分发、MCP 分发）
 *   - stageToRepo + restoreFromRepo 往返一致性
 *   - jsonFields 字段级提取/合并不丢数据
 *   - 新增 skill/MCP 的跨 agent 共享
 *   - 删除 skill 后的行为（当前：只增不删）
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { syncEngine, buildFileEntries } from '../src/core/sync.js';
import { cryptoEngine } from '../src/core/crypto.js';
import type { WangchuanConfig } from '../src/types.js';

// ── 测试工具 ────────────────────────────────────────────────────────

const TMP     = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-sync-'));
const KEY     = path.join(TMP, 'master.key');
const REPO    = path.join(TMP, 'repo');
const WS_OC   = path.join(TMP, 'openclaw');
const WS_CL   = path.join(TMP, 'claude');
const WS_GE   = path.join(TMP, 'gemini');

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
      },
    },
    shared: {
      skills: {
        sources: [
          { agent: 'claude',   dir: 'skills/' },
          { agent: 'openclaw', dir: 'skills/' },
        ],
      },
      mcp: {
        sources: [
          { agent: 'claude',   src: '.claude.json',       field: 'mcpServers' },
          { agent: 'openclaw', src: 'config/mcporter.json', field: 'mcpServers' },
        ],
      },
      syncFiles: [],
    },
    ...overrides,
  } as WangchuanConfig;
}

/** 写文件，自动建目录 */
function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ── Setup / Teardown ────────────────────────────────────────────────

before(() => {
  cryptoEngine.generateKey(KEY);
  for (const d of [REPO, WS_OC, WS_CL, WS_GE]) {
    fs.mkdirSync(d, { recursive: true });
  }
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ── buildFileEntries 测试 ───────────────────────────────────────────

describe('buildFileEntries', () => {
  it('为每个 agent 生成 agents/<name>/ 前缀的条目', () => {
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

  it('jsonFields 条目带 jsonExtract 元数据', () => {
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg);
    const jfEntries = entries.filter(e => e.jsonExtract);
    assert.ok(jfEntries.length >= 2); // claude mcpServers + gemini settings

    const claudeJf = jfEntries.find(e => e.repoRel.includes('mcpServers'));
    assert.ok(claudeJf);
    assert.deepStrictEqual(claudeJf.jsonExtract!.fields, ['mcpServers']);
    assert.ok(claudeJf.encrypt);
  });

  it('--agent 过滤只返回指定 agent 条目', () => {
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg, undefined, 'gemini');
    assert.ok(entries.length > 0);
    assert.ok(entries.every(e => e.agentName === 'gemini'));
  });

  it('shared skills 条目带 shared 标识', () => {
    // 先创建 skill 文件让 walkDir 能扫到
    writeFile(path.join(WS_CL, 'skills', 'test.md'), '# test skill');
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg);
    const sharedSkills = entries.filter(
      e => e.agentName === 'shared' && e.repoRel.startsWith('shared/skills/'),
    );
    assert.ok(sharedSkills.length >= 1);
    fs.rmSync(path.join(WS_CL, 'skills'), { recursive: true, force: true });
  });

  it('repoRel 去重：多 agent 同名 skill 只保留先出现者', () => {
    writeFile(path.join(WS_CL, 'skills', 'dup.md'), 'claude version');
    writeFile(path.join(WS_OC, 'skills', 'dup.md'), 'openclaw version');
    const cfg = mkCfg();
    const entries = buildFileEntries(cfg);
    const dupEntries = entries.filter(e => e.repoRel === path.join('shared', 'skills', 'dup.md'));
    assert.equal(dupEntries.length, 1, '同名 skill 应去重为 1 条');
    // 清理
    fs.rmSync(path.join(WS_CL, 'skills'), { recursive: true, force: true });
    fs.rmSync(path.join(WS_OC, 'skills'), { recursive: true, force: true });
  });
});

// ── stageToRepo + restoreFromRepo 往返测试 ──────────────────────────

describe('stageToRepo → restoreFromRepo 往返', () => {
  it('整文件同步：push 后 pull 内容一致', async () => {
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# 记忆内容 v1');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# 灵魂');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# Claude 指令');
    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });

    const pushResult = await syncEngine.stageToRepo(cfg);
    assert.ok(pushResult.synced.length >= 3);

    // repo 中文件应存在
    assert.ok(fs.existsSync(path.join(REPO, 'agents/openclaw/MEMORY.md.enc')));
    assert.ok(fs.existsSync(path.join(REPO, 'agents/openclaw/SOUL.md')));
    assert.ok(fs.existsSync(path.join(REPO, 'agents/claude/CLAUDE.md')));

    // 模拟新环境：删除本地文件
    fs.unlinkSync(path.join(WS_OC, 'MEMORY.md'));
    fs.unlinkSync(path.join(WS_CL, 'CLAUDE.md'));

    const pullResult = await syncEngine.restoreFromRepo(cfg);
    assert.ok(pullResult.synced.length >= 3);

    // 还原后内容一致
    assert.equal(fs.readFileSync(path.join(WS_OC, 'MEMORY.md'), 'utf-8'), '# 记忆内容 v1');
    assert.equal(fs.readFileSync(path.join(WS_CL, 'CLAUDE.md'), 'utf-8'), '# Claude 指令');
  });

  it('jsonFields：push 只提取指定字段，pull merge 回不丢其他字段', async () => {
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

    // repo 中 claude 的 mcpServers.json.enc 应只含 mcpServers
    const claudeRepoFile = path.join(REPO, 'agents/claude/mcpServers.json.enc');
    assert.ok(fs.existsSync(claudeRepoFile));
    const decrypted = JSON.parse(
      cryptoEngine.decryptString(fs.readFileSync(claudeRepoFile, 'utf-8').trim(), KEY),
    );
    assert.deepStrictEqual(Object.keys(decrypted), ['mcpServers']);
    assert.ok(!('tipsHistory' in decrypted), 'tipsHistory 不应被提取');

    // repo 中 gemini 的 settings-sync.json 应只含 security + model
    const geminiRepoFile = path.join(REPO, 'agents/gemini/settings-sync.json');
    assert.ok(fs.existsSync(geminiRepoFile));
    const geminiPartial = JSON.parse(fs.readFileSync(geminiRepoFile, 'utf-8'));
    assert.deepStrictEqual(Object.keys(geminiPartial).sort(), ['model', 'security']);

    // 模拟远端修改 mcpServers（添加新 server）
    const modified = { mcpServers: { playwright: { type: 'stdio', cmd: 'npx' }, gongfeng: { type: 'sse' } } };
    const enc = cryptoEngine.encryptString(JSON.stringify(modified, null, 2), KEY);
    fs.writeFileSync(claudeRepoFile, enc, 'utf-8');

    // pull 回来
    await syncEngine.restoreFromRepo(cfg);

    // .claude.json 应保留 tipsHistory/numStartups/projects，mcpServers 被更新
    const restored = JSON.parse(fs.readFileSync(path.join(WS_CL, '.claude.json'), 'utf-8'));
    assert.deepStrictEqual(restored.mcpServers, modified.mcpServers);
    assert.equal(restored.tipsHistory.tip1, 5, 'tipsHistory 不应被破坏');
    assert.equal(restored.numStartups, 42, 'numStartups 不应被破坏');
    assert.deepStrictEqual(restored.projects, { '/tmp/proj': { cost: 100 } });
  });
});

// ── distributeShared 测试（通过 stageToRepo 间接验证） ───────────────

describe('skill 跨 agent 共享', () => {
  it('Claude 新增 skill → push 后 OpenClaw 也获得该 skill', async () => {
    writeFile(path.join(WS_CL, 'skills', 'new-skill.md'), '# New Skill');
    // OpenClaw 没有这个 skill
    const ocSkillPath = path.join(WS_OC, 'skills', 'new-skill.md');
    if (fs.existsSync(ocSkillPath)) fs.unlinkSync(ocSkillPath);

    const cfg = mkCfg();
    // 准备必需的工作区文件
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    await syncEngine.stageToRepo(cfg);

    // distributeShared 应将 skill 复制到 OpenClaw
    assert.ok(
      fs.existsSync(ocSkillPath),
      'OpenClaw 应获得 Claude 的 new-skill.md',
    );
    assert.equal(
      fs.readFileSync(ocSkillPath, 'utf-8'),
      '# New Skill',
    );

    // repo 中 shared/skills/ 也应有
    assert.ok(fs.existsSync(path.join(REPO, 'shared', 'skills', 'new-skill.md')));
  });

  it('删除 skill 后 push — 另一个 agent 有则复制回来（只增不删）', async () => {
    // 两个 agent 都有 old-skill
    writeFile(path.join(WS_CL, 'skills', 'old-skill.md'), '# Old');
    writeFile(path.join(WS_OC, 'skills', 'old-skill.md'), '# Old');

    // 从 OpenClaw 删除
    fs.unlinkSync(path.join(WS_OC, 'skills', 'old-skill.md'));

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // distributeShared 会从 Claude 复制回 OpenClaw
    assert.ok(
      fs.existsSync(path.join(WS_OC, 'skills', 'old-skill.md')),
      '删除的 skill 被从另一个 agent 复制回来',
    );
  });
});

describe('MCP 跨 agent 共享', () => {
  it('Claude 新增 MCP server → push 后 OpenClaw 也获得', async () => {
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

    // OpenClaw 的 mcporter.json 应包含 newServer
    const ocMcp = JSON.parse(
      fs.readFileSync(path.join(WS_OC, 'config', 'mcporter.json'), 'utf-8'),
    );
    assert.ok(
      'newServer' in ocMcp.mcpServers,
      'OpenClaw 应获得 Claude 的 newServer',
    );
    assert.deepStrictEqual(
      ocMcp.mcpServers.newServer,
      { type: 'sse' },
    );
  });

  it('分发 MCP 不覆盖已有配置', async () => {
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

    // 两个 agent 的 playwright 配置应保持各自的 version，不被覆盖
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

// ── 一键还原（新服务器场景） ────────────────────────────────────────

describe('新环境一键还原', () => {
  it('工作区为空时 pull 能完整还原所有 agent 配置', async () => {
    // 先 push 一份完整数据到 repo
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

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // 模拟新服务器：清空所有工作区
    for (const d of [WS_OC, WS_CL, WS_GE]) {
      fs.rmSync(d, { recursive: true, force: true });
      fs.mkdirSync(d, { recursive: true });
    }

    // pull 还原
    const pullResult = await syncEngine.restoreFromRepo(cfg);
    assert.ok(pullResult.synced.length >= 4);

    // OpenClaw 还原
    assert.equal(
      fs.readFileSync(path.join(WS_OC, 'MEMORY.md'), 'utf-8'),
      '# 永久记忆',
    );
    assert.equal(
      fs.readFileSync(path.join(WS_OC, 'SOUL.md'), 'utf-8'),
      '# 灵魂身份',
    );

    // Claude 还原
    assert.equal(
      fs.readFileSync(path.join(WS_CL, 'CLAUDE.md'), 'utf-8'),
      '# Claude 全局指令',
    );

    // Claude jsonFields merge-back（新环境本地无 .claude.json → 从空 {} merge）
    const clJson = JSON.parse(
      fs.readFileSync(path.join(WS_CL, '.claude.json'), 'utf-8'),
    );
    assert.deepStrictEqual(clJson.mcpServers, { server1: { cmd: 'test' } });
    assert.ok(!('tipsHistory' in clJson), '新环境不应有 tipsHistory');

    // Gemini jsonFields merge-back
    const geJson = JSON.parse(
      fs.readFileSync(path.join(WS_GE, 'settings.json'), 'utf-8'),
    );
    assert.deepStrictEqual(geJson.security, { auth: 'test' });
    assert.deepStrictEqual(geJson.model, { name: 'gemini-2' });
    assert.ok(!('cache' in geJson), '新环境不应有 cache');

    // shared skills 分发到所有 agent
    assert.ok(
      fs.existsSync(path.join(WS_CL, 'skills', 'review.md')),
      'Claude 应还原 skill',
    );
    assert.ok(
      fs.existsSync(path.join(WS_OC, 'skills', 'review.md')),
      'OpenClaw 也应获得共享 skill',
    );
  });
});

// ── 删除传播测试 ────────────────────────────────────────────────────

describe('删除传播', () => {
  it('所有 agent 都删除的 skill → push 后从 repo 清理', async () => {
    // 先 push 一个 skill 到 repo
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

    // 从所有 agent 删除（Claude 有，OpenClaw 也被分发了）
    const clSkill = path.join(WS_CL, 'skills', 'obsolete.md');
    const ocSkill = path.join(WS_OC, 'skills', 'obsolete.md');
    if (fs.existsSync(clSkill)) fs.unlinkSync(clSkill);
    if (fs.existsSync(ocSkill)) fs.unlinkSync(ocSkill);

    // 再次 push
    const result = await syncEngine.stageToRepo(cfg);

    // repo 中应被清理
    assert.ok(
      !fs.existsSync(path.join(REPO, 'shared', 'skills', 'obsolete.md')),
      '所有 agent 都删除后，repo 中也应被清理',
    );
    assert.ok(result.deleted.includes(path.join('shared', 'skills', 'obsolete.md')));
  });

  it('repo 有但本地所有 agent 都无的整文件 → push 后从 repo 清理', async () => {
    // 手动在 repo 中创建一个「幽灵文件」（模拟旧版残留）
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
      'repo 中的幽灵文件应被清理',
    );
    assert.ok(result.deleted.includes(path.join('agents', 'openclaw', 'GHOST.md')));
  });

  it('pull 后 repo 中删除的 skill 不再分发到任何 agent', async () => {
    // 先创建 skill 并 push
    writeFile(path.join(WS_CL, 'skills', 'temp.md'), '# temp');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    const cfg = mkCfg();
    await syncEngine.stageToRepo(cfg);

    // 从所有 agent 删除并 push（触发 repo 清理）
    for (const d of [WS_CL, WS_OC]) {
      const f = path.join(d, 'skills', 'temp.md');
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    await syncEngine.stageToRepo(cfg);
    assert.ok(!fs.existsSync(path.join(REPO, 'shared', 'skills', 'temp.md')));

    // pull — temp.md 不应出现在任何 agent
    await syncEngine.restoreFromRepo(cfg);
    assert.ok(!fs.existsSync(path.join(WS_CL, 'skills', 'temp.md')), 'Claude 不应恢复已删除的 skill');
    assert.ok(!fs.existsSync(path.join(WS_OC, 'skills', 'temp.md')), 'OpenClaw 不应恢复已删除的 skill');
  });
});

// ── localOnly 检测测试 ──────────────────────────────────────────────

describe('pull 检测本地独有文件', () => {
  it('本地有但 repo 无的文件标记为 localOnly', async () => {
    // 清空 repo
    fs.rmSync(REPO, { recursive: true, force: true });
    fs.mkdirSync(REPO, { recursive: true });

    // 本地有文件
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# 本地记忆');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# 灵魂');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# 指令');
    writeFile(path.join(WS_CL, '.claude.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');

    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });
    const result = await syncEngine.restoreFromRepo(cfg);

    // 应检测到本地独有文件
    assert.ok(result.localOnly.length >= 2, `应有 localOnly 文件，实际: ${result.localOnly.length}`);
    assert.ok(
      result.localOnly.some(f => f.includes('MEMORY.md')),
      'MEMORY.md 应标记为 localOnly',
    );
  });

  it('jsonFields 的 localOnly 不误报 — 提取字段为空则不标记', async () => {
    fs.rmSync(REPO, { recursive: true, force: true });
    fs.mkdirSync(REPO, { recursive: true });

    // .claude.json 存在但 mcpServers 字段为空
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify({
      tipsHistory: { x: 1 },
      numStartups: 5,
    }, null, 2));
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_GE, 'settings.json'), '{}');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');

    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });
    const result = await syncEngine.restoreFromRepo(cfg);

    // .claude.json 没有 mcpServers 字段，不应标记为 localOnly
    assert.ok(
      !result.localOnly.some(f => f.includes('mcpServers')),
      'mcpServers 字段为空时不应标记为 localOnly',
    );
  });
});

// ── shared MCP 跨 agent 分发（pull 时） ─────────────────────────────

describe('pull 时 shared MCP 跨 agent 分发', () => {
  it('从 repo pull 的 MCP 配置应分发到所有 agent', async () => {
    // 清理 repo
    fs.rmSync(REPO, { recursive: true, force: true });
    fs.mkdirSync(REPO, { recursive: true });

    // 准备 Claude 有 MCP config，OpenClaw 没有
    writeFile(path.join(WS_CL, '.claude.json'), JSON.stringify({
      mcpServers: { playwright: { type: 'stdio' } },
    }, null, 2));
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');

    const cfg = mkCfg();

    // push 先（创建 repo 内容）
    await syncEngine.stageToRepo(cfg);

    // 模拟新环境：清空 OpenClaw 的 mcporter.json
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    // pull
    await syncEngine.restoreFromRepo(cfg);

    // OpenClaw 应从 shared MCP 获得 playwright
    const ocMcp = JSON.parse(
      fs.readFileSync(path.join(WS_OC, 'config', 'mcporter.json'), 'utf-8'),
    );
    assert.ok(
      'playwright' in (ocMcp.mcpServers ?? {}),
      'OpenClaw 应通过 pull 获得 Claude 的 MCP 配置',
    );
  });
});

// ── JSON 解析失败容错 ───────────────────────────────────────────────

describe('JSON 解析失败容错', () => {
  it('损坏的 JSON 源文件不导致 push 崩溃', async () => {
    writeFile(path.join(WS_CL, '.claude.json'), '{ invalid json !!!');
    writeFile(path.join(WS_CL, 'CLAUDE.md'), '# C');
    writeFile(path.join(WS_OC, 'MEMORY.md'), '# M');
    writeFile(path.join(WS_OC, 'SOUL.md'), '# S');
    writeFile(path.join(WS_GE, 'settings.json'), '{"security":{},"model":{}}');
    writeFile(path.join(WS_OC, 'config', 'mcporter.json'), '{"mcpServers":{}}');

    const cfg = mkCfg({ shared: { skills: { sources: [] }, mcp: { sources: [] }, syncFiles: [] } });
    // 不应抛异常
    const result = await syncEngine.stageToRepo(cfg);
    assert.ok(
      result.skipped.some(f => f.includes('mcpServers')),
      '损坏 JSON 对应的条目应被 skip',
    );
  });
});
