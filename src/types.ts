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

/** 从 JSON 文件提取指定顶层字段进行同步（替代整文件同步） */
export interface JsonFieldEntry {
  /** 源 JSON 文件相对于 workspacePath 的路径 */
  readonly src: string;
  /** 要提取的顶层字段名列表 */
  readonly fields: readonly string[];
  /** 提取后在 repo 中的文件名（不含路径前缀） */
  readonly repoName: string;
  readonly encrypt: boolean;
}

/** 统一的智能体配置（替代原来三个独立 interface） */
export interface AgentProfile {
  readonly enabled: boolean;
  readonly workspacePath: string;
  readonly syncFiles: readonly SyncFileEntry[];
  readonly syncDirs?: readonly SyncDirEntry[];
  readonly jsonFields?: readonly JsonFieldEntry[];
}

export interface AgentProfiles {
  readonly openclaw: AgentProfile;
  readonly claude: AgentProfile;
  readonly gemini: AgentProfile;
  readonly codebuddy: AgentProfile;
  readonly workbuddy: AgentProfile;
  readonly cursor: AgentProfile;
}

// ─── Shared tier（跨 agent 共享） ───────────────────────────────

/** 共享 Skills 的来源 */
export interface SharedSkillSource {
  readonly agent: AgentName;
  /** skills 目录相对于 workspacePath 的路径 */
  readonly dir: string;
}

/** 共享 MCP 配置来源 */
export interface SharedMcpSource {
  readonly agent: AgentName;
  /** JSON 文件相对于 workspacePath 的路径 */
  readonly src: string;
  /** 从该文件中提取 MCP 配置的顶层字段名 */
  readonly field: string;
}

/** 共享文件条目（workspacePath 独立于 agent，需单独指定） */
export interface SharedSyncFileEntry {
  readonly src: string;
  readonly workspacePath: string;
  readonly encrypt: boolean;
}

export interface SharedConfig {
  readonly skills: {
    readonly sources: readonly SharedSkillSource[];
  };
  readonly mcp: {
    readonly sources: readonly SharedMcpSource[];
  };
  readonly syncFiles: readonly SharedSyncFileEntry[];
}

export interface WangchuanConfig {
  readonly repo: string;
  readonly branch: string;
  readonly localRepoPath: string;
  readonly keyPath: string;
  readonly hostname: string;
  /** 配置版本号，用于迁移检测 */
  readonly version?: number;
  readonly profiles: {
    readonly default: AgentProfiles;
  };
  /** 跨 agent 共享配置 */
  readonly shared?: SharedConfig;
  /** 显示语言 */
  readonly lang?: 'zh' | 'en';
  /** Active environment name. 'default' or undefined → main branch; others → env/{name} */
  readonly environment?: string;
}

// ─── Agent 过滤 ──────────────────────────────────────────────────

/**
 * Canonical list of all supported agent names — single source of truth.
 * Derived from AGENT_DEFINITIONS in src/agents/. To add a new agent, create
 * a definition file in src/agents/ and register it in src/agents/index.ts.
 */
export const AGENT_NAMES = ['openclaw', 'claude', 'gemini', 'codebuddy', 'workbuddy', 'cursor'] as const;

/** 支持过滤的智能体名称 */
export type AgentName = (typeof AGENT_NAMES)[number];

/** 同步层级标识 */
export type SyncTier = AgentName | 'shared';

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
  /** 所属层级（agent 名称 或 'shared'） */
  readonly agentName: SyncTier;
  /** 非空时表示此条目需要 JSON 字段级提取 */
  readonly jsonExtract?: {
    readonly fields: readonly string[];
    /** 原始完整 JSON 文件绝对路径（用于 pull 时 merge-back） */
    readonly originalPath: string;
  };
}

export interface StageResult {
  readonly synced: string[];
  readonly skipped: string[];
  readonly encrypted: string[];
  /** push 时从 repo 中清理的过期文件 */
  readonly deleted: string[];
}

export interface RestoreResult {
  readonly synced: string[];
  readonly skipped: string[];
  readonly decrypted: string[];
  readonly conflicts: string[];
  /** 本地存在但 repo 中没有的文件（可能需要 push 到云端） */
  readonly localOnly: string[];
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
  readonly key?: string;
}

export interface PushOptions extends AgentOptions {
  readonly message?: string;
  readonly dryRun?: boolean;
}

export interface PullOptions extends AgentOptions {}

export interface StatusOptions extends AgentOptions {}

export interface DiffCommandOptions extends AgentOptions {}

export interface ListOptions extends AgentOptions {}

export interface SyncOptions extends AgentOptions {
  readonly dryRun?: boolean;
}

export interface WatchOptions extends AgentOptions {
  readonly interval?: number;
}

export interface EnvOptions {
  readonly action: string;
  readonly name: string | undefined;
  readonly from: string | undefined;
}
