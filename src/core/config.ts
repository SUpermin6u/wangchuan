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
import { buildDefaultProfiles, buildDefaultShared } from '../agents/index.js';
import type { WangchuanConfig } from '../types.js';

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const CONFIG_PATH   = path.join(WANGCHUAN_DIR, 'config.json');
const KEY_PATH      = path.join(WANGCHUAN_DIR, 'master.key');
const EXAMPLE_PATH  = fileURLToPath(new URL('../../.wangchuan/config.example.json', import.meta.url));

export const CONFIG_VERSION = 2;

/** 默认配置骨架 v2 — derived from agent definitions in src/agents/ */
const DEFAULT_PROFILES = buildDefaultProfiles();

/** 共享层默认配置 — derived from agent definitions in src/agents/ */
const DEFAULT_SHARED = buildDefaultShared();

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
