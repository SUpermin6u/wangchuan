/**
 * config.ts — 全局配置管理
 *
 * 配置文件：~/.wangchuan/config.json
 * 密钥文件：~/.wangchuan/master.key
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { t }      from '../i18n.js';
import type { WangchuanConfig, AgentProfiles, SharedConfig } from '../types.js';

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const CONFIG_PATH   = path.join(WANGCHUAN_DIR, 'config.json');
const KEY_PATH      = path.join(WANGCHUAN_DIR, 'master.key');
const EXAMPLE_PATH  = fileURLToPath(new URL('../../.wangchuan/config.example.json', import.meta.url));

export const CONFIG_VERSION = 2;

/** 默认配置骨架 v2 — 细粒度同步 */
const DEFAULT_PROFILES: AgentProfiles = {
  openclaw: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.openclaw', 'workspace'),
    syncFiles: [
      { src: 'MEMORY.md',   encrypt: true  },
      { src: 'AGENTS.md',   encrypt: false },
      { src: 'SOUL.md',     encrypt: false },
      { src: 'IDENTITY.md', encrypt: false },
      { src: 'USER.md',     encrypt: true  },
    ],
    syncDirs: [
      { src: 'memory/', encrypt: true },  // dated memory logs (memory/SHARED.md etc.)
    ],
    // skills/ → shared tier; TOOLS.md excluded (environment-specific)
  },
  claude: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.claude-internal'),
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
  gemini: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.gemini'),
    syncFiles: [],
    jsonFields: [
      {
        src:      'settings.internal.json',
        fields:   ['security', 'model', 'general'],
        repoName: 'settings-sync.json',
        encrypt:  true,
      },
    ],
  },
  codebuddy: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.codebuddy'),
    syncFiles: [
      { src: 'MEMORY.md',     encrypt: true  },
      { src: 'CODEBUDDY.md',  encrypt: false },
    ],
    jsonFields: [
      // MCP config at ~/.codebuddy/mcp.json
      {
        src:      'mcp.json',
        fields:   ['mcpServers'],
        repoName: 'mcpServers.json',
        encrypt:  true,
      },
      // settings.json → only portable fields (exclude hooks with absolute paths)
      {
        src:      'settings.json',
        fields:   ['enabledPlugins'],
        repoName: 'settings-sync.json',
        encrypt:  true,
      },
    ],
  },
  workbuddy: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.workbuddy'),
    syncFiles: [
      { src: 'MEMORY.md',   encrypt: true  },
      { src: 'IDENTITY.md', encrypt: false },
      { src: 'SOUL.md',     encrypt: false },
      { src: 'USER.md',     encrypt: true  },
    ],
    jsonFields: [
      // MCP config at ~/.workbuddy/mcp.json
      {
        src:      'mcp.json',
        fields:   ['mcpServers'],
        repoName: 'mcpServers.json',
        encrypt:  true,
      },
      // settings.json → only portable fields
      {
        src:      'settings.json',
        fields:   ['enabledPlugins'],
        repoName: 'settings-sync.json',
        encrypt:  true,
      },
    ],
  },
  cursor: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.cursor'),
    syncFiles: [],
    syncDirs: [
      { src: 'rules/', encrypt: false },  // global rules directory
    ],
    jsonFields: [
      // MCP config at ~/.cursor/mcp.json
      {
        src:      'mcp.json',
        fields:   ['mcpServers'],
        repoName: 'mcpServers.json',
        encrypt:  true,
      },
      // cli-config.json → only portable fields (exclude authInfo, privacyCache)
      {
        src:      'cli-config.json',
        fields:   ['permissions', 'model', 'enabledPlugins'],
        repoName: 'cli-config-sync.json',
        encrypt:  true,
      },
    ],
  },
};

/** 共享层默认配置 */
const DEFAULT_SHARED: SharedConfig = {
  skills: {
    sources: [
      { agent: 'claude',    dir: 'skills/' },
      { agent: 'openclaw',  dir: 'skills/' },
      { agent: 'codebuddy', dir: 'skills/' },
    ],
  },
  mcp: {
    sources: [
      { agent: 'claude',    src: '.claude.json',          field: 'mcpServers' },
      { agent: 'openclaw',  src: 'config/mcporter.json',  field: 'mcpServers' },
      { agent: 'codebuddy', src: 'mcp.json',              field: 'mcpServers' },
      { agent: 'workbuddy', src: 'mcp.json',              field: 'mcpServers' },
      { agent: 'cursor',    src: 'mcp.json',              field: 'mcpServers' },
    ],
  },
  syncFiles: [
    { src: 'memory/SHARED.md', workspacePath: '~/.openclaw/workspace', encrypt: true },
  ],
};

export const config = {
  /** Read config, return null if not found */
  load(): WangchuanConfig | null {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    let parsed: Record<string, unknown>;
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      throw new Error(t('config.loadFailed', { error: (err as Error).message }));
    }
    // Validate required fields
    for (const field of ['repo', 'branch', 'localRepoPath', 'keyPath'] as const) {
      if (!parsed[field]) {
        throw new Error(t('config.invalidFormat', { field }));
      }
    }
    const profiles = parsed['profiles'] as Record<string, unknown> | undefined;
    if (!profiles?.['default']) {
      throw new Error(t('config.invalidFormat', { field: 'profiles.default' }));
    }
    return parsed as unknown as WangchuanConfig;
  },

  /** 保存配置到磁盘 */
  save(cfg: WangchuanConfig): void {
    fs.mkdirSync(WANGCHUAN_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    logger.debug(t('config.saved', { path: CONFIG_PATH }));
  },

  /** 探测远程仓库的默认分支 */
  async detectDefaultBranch(repo: string): Promise<string> {
    try {
      const { execSync } = await import('child_process');
      const result = execSync(`git ls-remote --symref ${repo} HEAD`, {
        encoding: 'utf-8' as BufferEncoding
      });
      const match = result.match(/ref: refs\/heads\/(\S+)\s+HEAD/);
      return match?.[1] ?? 'main';
    } catch {
      return 'main';
    }
  },

  /** 初始化目录和配置文件，返回新建的配置对象 */
  async initialize(repo: string): Promise<WangchuanConfig> {
    fs.mkdirSync(WANGCHUAN_DIR, { recursive: true });
    const branch = await this.detectDefaultBranch(repo);
    const cfg: WangchuanConfig = {
      repo,
      branch,
      localRepoPath: path.join(WANGCHUAN_DIR, 'repo'),
      keyPath:       KEY_PATH,
      hostname:      os.hostname(),
      version:       CONFIG_VERSION,
      profiles:      { default: DEFAULT_PROFILES },
      shared:        DEFAULT_SHARED,
    };
    this.save(cfg);
    return cfg;
  },

  /** 浅合并两个配置（override 优先） */
  merge(base: WangchuanConfig, override: Partial<WangchuanConfig>): WangchuanConfig {
    return { ...base, ...override };
  },

  /** 默认配置（迁移时使用） */
  defaults: {
    profiles: DEFAULT_PROFILES,
    shared:   DEFAULT_SHARED,
    version:  CONFIG_VERSION,
  },

  /** 常用路径常量 */
  paths: {
    dir:     WANGCHUAN_DIR,
    config:  CONFIG_PATH,
    key:     KEY_PATH,
    example: EXAMPLE_PATH,
  },
} as const;

/**
 * Resolve the git branch for the given config's active environment.
 * - environment undefined or 'default' → cfg.branch (typically 'main')
 * - any other value → 'env/{name}'
 */
export function resolveGitBranch(cfg: WangchuanConfig): string {
  if (!cfg.environment || cfg.environment === 'default') {
    return cfg.branch;
  }
  return `env/${cfg.environment}`;
}
