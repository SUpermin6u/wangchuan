# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Wangchuan (忘川)** — AI memory sync system. A TypeScript CLI tool that encrypts and syncs AI agent (Claude/Gemini/OpenClaw) configs and memories via a Git repo, enabling cross-environment migration and one-click restore.

## Build & Dev Commands

```bash
npm run build        # tsc → dist/ (postbuild auto chmod +x)
npm run dev          # Run directly via tsx, no build needed: npm run dev -- pull --agent claude
npm run test         # Run all tests (crypto + json-field + sync)
npm run typecheck    # tsc --noEmit type checking
```

Use `npm run dev -- <command> [flags]` during development — no build step required.

## Architecture

ES Modules (`"type": "module"`), Node.js ≥ 18.19.0, strict TypeScript (`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`).

### Two-Tier Repo Structure

- `shared/` — Cross-agent shared resources (merged skills, shared MCP configs, shared memory SHARED.md)
- `agents/<name>/` — Per-agent cross-environment sync (MEMORY.md, CLAUDE.md, settings, etc.)

Config version `version: 2`; older versions auto-migrate via `migrate.ts`.

### Sync Principles

- **Repo is the single source of truth**: on push, entries absent from all local agents are pruned from repo; on pull, entries absent from repo are not distributed
- **Auto-share on add**: any agent adds a skill or MCP server → auto-distributed to all agents on push
- **Delete propagation**: all agents delete a skill/MCP → pruned from repo on push → disappears on pull in other environments
- **No overwrite**: when distributing skills/MCP, existing entries in the target agent are preserved
- **localOnly detection on pull**: files present locally but missing from repo trigger a push suggestion

### Core Engines (`src/core/`)

- **sync.ts** — Sync engine. `buildFileEntries()` is the single source of truth for file entries, iterating over all three agents + shared tier. Supports three entry types: `syncFiles` (whole file), `syncDirs` (directory recursion), `jsonFields` (JSON field-level extraction). `distributeShared` distributes skills/MCP to all agents before push. `pruneRepoStaleFiles` cleans stale files from repo after push. `stageToRepo` / `restoreFromRepo` / `diff` for three-way operations.
- **json-field.ts** — JSON field-level extraction and merge. `extractFields` picks specified fields from a large JSON; `mergeFields` merges fields back without destroying other content. Used for `.claude.json` to sync only `mcpServers` while ignoring tipsHistory/projects etc.
- **crypto.ts** — AES-256-GCM encryption. Ciphertext format: `[IV 12B][AuthTag 16B][CipherText] → Base64 → .enc`. Key stored at `~/.wangchuan/master.key` (0o600 permissions).
- **git.ts** — simple-git wrapper. `cloneOrFetch` is idempotent; `commitAndPush` returns `{committed: false}` when nothing changed; `rollback` runs `git reset --soft HEAD~1` on failure.
- **config.ts** — Config management at `~/.wangchuan/config.json`. `DEFAULT_PROFILES` defines per-agent sync strategy; `DEFAULT_SHARED` defines cross-agent sharing strategy. `CONFIG_VERSION` controls migration.
- **migrate.ts** — Version migration. `ensureMigrated()` auto-detects and migrates old configs before each command (v1→v2: repo restructuring, skills merge, stale file cleanup). Auto-backup to `~/.wangchuan/backup-v1/` before migration, auto-rollback on failure.

### Commands (`src/commands/`)

Seven commands: `init`, `pull`, `push`, `status`, `diff`, `list`, `dump`. All support `--agent openclaw|claude|gemini` filtering. Every command (except `init`) calls `ensureMigrated()` after `config.load()` to ensure config is up to date.

### Type System (`src/types.ts`)

All interfaces use `readonly` modifiers. Key types:
- `AgentProfile` — Unified agent config (syncFiles/syncDirs/jsonFields)
- `JsonFieldEntry` — JSON field-level extraction config
- `SharedConfig` — Cross-agent sharing config (skills sources, MCP sources, shared files)
- `FileEntry` — Sync entry (`agentName: AgentName | 'shared'`, optional `jsonExtract`)
- `StageResult` — Push result (includes `deleted` list for stale file cleanup)
- `RestoreResult` — Pull result (includes `localOnly` list for local-only files)

## Import Conventions

All internal imports must include the `.js` suffix (NodeNext module resolution):
```typescript
import { cryptoEngine } from '../core/crypto.js';
```

## Testing

Uses Node.js built-in `node:test` framework; test files in `test/` loaded via tsx. Covers crypto, json-field, and sync engine (including shared distribution, delete propagation, one-click restore, JSON fault tolerance — 42 test cases).

## Release Checklist

Execute in order before every release:

1. **Privacy check**: Verify no tokens, API keys, or passwords are leaked in code or configs
2. **Update docs**: Keep `CLAUDE.md`, `README.md`, `REQUIREMENTS.md`, `skill/SKILL.md` in sync with code changes
3. **Bump version**: Update `package.json` version (semver: breaking → major, feature → minor, bugfix → patch)
4. **Typecheck + test**: `npm run typecheck && npm test` — all must pass
5. **Commit & push**: git commit + push
6. **Publish to npm**: `npm publish`
