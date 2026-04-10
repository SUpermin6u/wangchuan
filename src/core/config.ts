/**
 * config.ts — Global configuration management
 *
 * Config file: ~/.wangchuan/config.json
 * Key file: ~/.wangchuan/master.key
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { t }      from '../i18n.js';
import { buildDefaultProfiles, buildDefaultShared, autoDetectAgents } from '../agents/index.js';
import type { WangchuanConfig } from '../types.js';

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const CONFIG_PATH   = path.join(WANGCHUAN_DIR, 'config.json');
const KEY_PATH      = path.join(WANGCHUAN_DIR, 'master.key');
const EXAMPLE_PATH  = fileURLToPath(new URL('../../.wangchuan/config.example.json', import.meta.url));

export const CONFIG_VERSION = 2;

/** Default config skeleton v2 — derived from agent definitions in src/agents/ */
const DEFAULT_PROFILES = buildDefaultProfiles();

/** Shared tier default config — derived from agent definitions in src/agents/ */
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

  /** Save config to disk */
  save(cfg: WangchuanConfig): void {
    fs.mkdirSync(WANGCHUAN_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
    logger.debug(t('config.saved', { path: CONFIG_PATH }));
  },

  /** Detect the default branch of a remote repository */
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

  /** Initialize directory and config file, return the new config object */
  async initialize(repo: string): Promise<WangchuanConfig> {
    fs.mkdirSync(WANGCHUAN_DIR, { recursive: true });
    const branch = await this.detectDefaultBranch(repo);
    // Auto-detect installed agents instead of enabling all by default
    const detectedProfiles = autoDetectAgents(DEFAULT_PROFILES);
    const cfg: WangchuanConfig = {
      repo,
      branch,
      localRepoPath: path.join(WANGCHUAN_DIR, 'repo'),
      keyPath:       KEY_PATH,
      hostname:      os.hostname(),
      version:       CONFIG_VERSION,
      profiles:      { default: detectedProfiles },
      shared:        DEFAULT_SHARED,
    };
    this.save(cfg);
    return cfg;
  },

  /** Shallow merge two configs (override takes priority) */
  merge(base: WangchuanConfig, override: Partial<WangchuanConfig>): WangchuanConfig {
    return { ...base, ...override };
  },

  /** Defaults (used during migration) */
  defaults: {
    profiles: DEFAULT_PROFILES,
    shared:   DEFAULT_SHARED,
    version:  CONFIG_VERSION,
  },

  /** Common path constants */
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
