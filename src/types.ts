/**
 * types.ts — 项目全局类型定义
 */

// ─── 配置文件结构 ────────────────────────────────────────────────

export interface SyncFileEntry {
  readonly src: string;
  readonly encrypt: boolean;
}

export interface SyncDirEntry {
  readonly src: string;
  readonly encrypt: boolean;
}

export interface OpenclawProfile {
  readonly enabled: boolean;
  readonly workspacePath: string;
  readonly syncFiles: readonly SyncFileEntry[];
  readonly syncDirs: readonly SyncDirEntry[];
}

export interface ClaudeProfile {
  readonly enabled: boolean;
  /** 配置文件根目录，默认 ~/.claude */
  readonly workspacePath: string;
  readonly syncFiles: readonly SyncFileEntry[];
}

export interface GeminiProfile {
  readonly enabled: boolean;
  /** 配置文件根目录，默认 ~/.gemini */
  readonly workspacePath: string;
  readonly syncFiles: readonly SyncFileEntry[];
}

export interface AgentProfiles {
  readonly openclaw: OpenclawProfile;
  readonly claude: ClaudeProfile;
  readonly gemini: GeminiProfile;
}

export interface WangchuanConfig {
  readonly repo: string;
  readonly branch: string;
  readonly localRepoPath: string;
  readonly keyPath: string;
  readonly hostname: string;
  readonly profiles: {
    readonly default: AgentProfiles;
  };
}

// ─── Agent 过滤 ──────────────────────────────────────────────────

/** 支持过滤的智能体名称 */
export type AgentName = 'openclaw' | 'claude' | 'gemini';

/** 所有支持 --agent 过滤的命令共用此 mixin */
export interface AgentOptions {
  readonly agent?: AgentName;
}

// ─── 同步引擎内部结构 ────────────────────────────────────────────

export interface FileEntry {
  readonly srcAbs: string;
  readonly repoRel: string;
  readonly plainRel: string;
  readonly encrypt: boolean;
  /** 所属智能体，用于 --agent 过滤 */
  readonly agentName: AgentName;
}

export interface StageResult {
  readonly synced: string[];
  readonly skipped: string[];
  readonly encrypted: string[];
}

export interface RestoreResult {
  readonly synced: string[];
  readonly skipped: string[];
  readonly decrypted: string[];
  readonly conflicts: string[];
}

export interface DiffResult {
  readonly added: string[];
  readonly modified: string[];
  readonly missing: string[];
}

// ─── Git 引擎返回结构 ────────────────────────────────────────────

export interface CommitResult {
  readonly committed: boolean;
  readonly pushed: boolean;
  readonly sha?: string;
}

// ─── 命令参数结构 ────────────────────────────────────────────────

export interface InitOptions {
  readonly repo: string;
  readonly force?: boolean;
}

export interface PushOptions extends AgentOptions {
  readonly message?: string;
}

export interface PullOptions extends AgentOptions {}

export interface StatusOptions extends AgentOptions {}

export interface DiffCommandOptions extends AgentOptions {}

export interface ListOptions extends AgentOptions {}
