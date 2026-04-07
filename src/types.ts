/**
 * types.ts — Project-wide type definitions
 */

// ─── Config file structure ─────────────────────────────────────────

export interface SyncFileEntry {
  readonly src: string;
  readonly encrypt: boolean;
}

export interface SyncDirEntry {
  readonly src: string;
  readonly encrypt: boolean;
}

/** Extract specified top-level fields from a JSON file for sync (instead of whole-file sync) */
export interface JsonFieldEntry {
  /** Path to the source JSON file relative to workspacePath */
  readonly src: string;
  /** List of top-level field names to extract */
  readonly fields: readonly string[];
  /** Filename in repo for the extracted content (without path prefix) */
  readonly repoName: string;
  readonly encrypt: boolean;
}

/** Unified agent profile (replaces the original three separate interfaces) */
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
  readonly codex: AgentProfile;
}

// ─── Shared tier (cross-agent sharing) ──────────────────────────

/** Shared skills source */
export interface SharedSkillSource {
  readonly agent: AgentName;
  /** Skills directory path relative to workspacePath */
  readonly dir: string;
}

/** Shared MCP config source */
export interface SharedMcpSource {
  readonly agent: AgentName;
  /** JSON file path relative to workspacePath */
  readonly src: string;
  /** Top-level field name to extract MCP config from */
  readonly field: string;
}

/** Shared file entry (workspacePath is independent of agent, must be specified separately) */
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

/** Webhook configuration for post-sync notifications */
export interface WebhookEntry {
  readonly url: string;
  readonly events: readonly ('push' | 'pull' | 'sync')[];
}

export interface WangchuanConfig {
  readonly repo: string;
  readonly branch: string;
  readonly localRepoPath: string;
  readonly keyPath: string;
  readonly hostname: string;
  /** Config version number for migration detection */
  readonly version?: number;
  readonly profiles: {
    readonly default: AgentProfiles;
  };
  /** Cross-agent shared config */
  readonly shared?: SharedConfig;
  /** Display language */
  readonly lang?: 'zh' | 'en';
  /** Active environment name. 'default' or undefined → main branch; others → env/{name} */
  readonly environment?: string;
  /** Webhook endpoints for post-sync notifications */
  readonly webhooks?: readonly WebhookEntry[];
  /** Post-sync hook commands to run after operations complete */
  readonly hooks?: {
    readonly postSync?: readonly string[];
    readonly postPush?: readonly string[];
    readonly postPull?: readonly string[];
  };
}

// ─── Agent filtering ─────────────────────────────────────────────

/**
 * Canonical list of all supported agent names — single source of truth.
 * Derived from AGENT_DEFINITIONS in src/agents/. To add a new agent, create
 * a definition file in src/agents/ and register it in src/agents/index.ts.
 */
export const AGENT_NAMES = ['openclaw', 'claude', 'gemini', 'codebuddy', 'workbuddy', 'cursor', 'codex'] as const;

/** Agent name that supports filtering */
export type AgentName = (typeof AGENT_NAMES)[number];

/** Sync tier identifier */
export type SyncTier = AgentName | 'shared';

/** Shared mixin for all commands supporting --agent filtering */
export interface AgentOptions {
  readonly agent?: AgentName;
}

// ─── Sync engine internal structures ─────────────────────────────

export interface FileEntry {
  readonly srcAbs: string;
  readonly repoRel: string;
  readonly plainRel: string;
  readonly encrypt: boolean;
  /** Owning tier (agent name or 'shared') */
  readonly agentName: SyncTier;
  /** When non-empty, indicates this entry requires JSON field-level extraction */
  readonly jsonExtract?: {
    readonly fields: readonly string[];
    /** Absolute path to the original full JSON file (used for merge-back on pull) */
    readonly originalPath: string;
  };
}

export interface StageResult {
  readonly synced: string[];
  readonly skipped: string[];
  readonly encrypted: string[];
  /** push — stale files pruned from repo */
  readonly deleted: string[];
  /** push — files skipped because content is identical to repo */
  readonly unchanged: string[];
}

export interface RestoreResult {
  readonly synced: string[];
  readonly skipped: string[];
  readonly decrypted: string[];
  readonly conflicts: string[];
  /** Files present locally but absent from repo (may need to be pushed) */
  readonly localOnly: string[];
}

export interface DiffResult {
  readonly added: string[];
  readonly modified: string[];
  readonly missing: string[];
}

// ─── Git engine return structures ────────────────────────────────

export interface CommitResult {
  readonly committed: boolean;
  readonly pushed: boolean;
  readonly sha?: string;
}

// ─── Command parameter structures ────────────────────────────────

export interface InitOptions {
  readonly repo?: string;
  readonly force?: boolean;
  readonly key?: string;
}

/** Mixin for --only / --exclude file filtering */
export interface FilterOptions {
  readonly only?: readonly string[] | undefined;
  readonly exclude?: readonly string[] | undefined;
}

export interface PushOptions extends AgentOptions, FilterOptions {
  readonly message?: string;
  readonly dryRun?: boolean;
}

export interface PullOptions extends AgentOptions, FilterOptions {}

export interface StatusOptions extends AgentOptions {}

export interface DiffCommandOptions extends AgentOptions {}

export interface ListOptions extends AgentOptions {}

export interface SyncOptions extends AgentOptions, FilterOptions {
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
