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
import type { WangchuanConfig, AgentProfiles } from '../types.js';

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const CONFIG_PATH   = path.join(WANGCHUAN_DIR, 'config.json');
const KEY_PATH      = path.join(WANGCHUAN_DIR, 'master.key');
const EXAMPLE_PATH  = fileURLToPath(new URL('../../.wangchuan/config.example.json', import.meta.url));

/** 默认配置骨架（不含敏感值） */
const DEFAULT_PROFILES: AgentProfiles = {
  openclaw: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.openclaw', 'workspace'),
    syncFiles: [
      { src: 'MEMORY.md',            encrypt: true  },
      { src: 'AGENTS.md',            encrypt: false },
      { src: 'SOUL.md',              encrypt: false },
      { src: 'USER.md',              encrypt: true  },
      { src: 'TOOLS.md',             encrypt: false },
      { src: 'config/mcporter.json', encrypt: true  },
    ],
    syncDirs: [
      { src: 'skills/', encrypt: false },
    ],
  },
  claude: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.claude'),
    syncFiles: [
      { src: '.claude.json', encrypt: true },
    ],
  },
  gemini: {
    enabled: true,
    workspacePath: path.join(os.homedir(), '.gemini'),
    syncFiles: [
      { src: 'settings.internal.json', encrypt: true  },
      { src: 'projects.json',          encrypt: false },
      { src: 'trustedFolders.json',    encrypt: false },
    ],
  },
};

export const config = {
  /** 读取配置，不存在时返回 null */
  load(): WangchuanConfig | null {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw) as WangchuanConfig;
    } catch (err) {
      throw new Error(`读取配置失败: ${(err as Error).message}`);
    }
  },

  /** 保存配置到磁盘 */
  save(cfg: WangchuanConfig): void {
    fs.mkdirSync(WANGCHUAN_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    logger.debug(`配置已保存到 ${CONFIG_PATH}`);
  },

  /** 探测远程仓库的默认分支 */
  async detectDefaultBranch(repo: string): Promise<string> {
    try {
      const { execSync } = await import('child_process');
      const result = execSync(`git ls-remote --symref ${repo} HEAD`, {
        encoding: 'utf-8' as BufferEncoding
      });
      const match = result.match(/ref: refs\/heads\/(\S+)\s+HEAD/);
      return match?.[1] ?? 'main';  // 默认回退到 main
    } catch {
      return 'main';  // 探测失败时用 main
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
      profiles: { default: DEFAULT_PROFILES },
    };
    this.save(cfg);
    return cfg;
  },

  /** 浅合并两个配置（override 优先） */
  merge(base: WangchuanConfig, override: Partial<WangchuanConfig>): WangchuanConfig {
    return { ...base, ...override };
  },

  /** 常用路径常量 */
  paths: {
    dir:     WANGCHUAN_DIR,
    config:  CONFIG_PATH,
    key:     KEY_PATH,
    example: EXAMPLE_PATH,
  },
} as const;
