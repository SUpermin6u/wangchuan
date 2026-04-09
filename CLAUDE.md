# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Wangchuan (忘川)** — AI memory sync system. A TypeScript CLI tool that encrypts and syncs AI agent configs and memories via a Git repo, enabling cross-environment migration and one-click restore. Supports 7 agents: OpenClaw, Claude, Gemini, CodeBuddy, WorkBuddy, Cursor, and Codex.

## Build & Dev Commands

```bash
npm run build        # tsc → dist/ (postbuild auto chmod +x)
npm run dev          # Run directly via tsx, no build needed: npm run dev -- sync --agent claude
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

- **sync.ts** — Sync engine. `buildFileEntries()` is the single source of truth for file entries, iterating over all seven agents + shared tier. Supports three entry types: `syncFiles` (whole file), `syncDirs` (directory recursion), `jsonFields` (JSON field-level extraction). `distributeShared` distributes skills/MCP to all agents before push. `pruneRepoStaleFiles` cleans stale files from repo after push. `stageToRepo` / `restoreFromRepo` / `diff` for three-way operations.
- **json-field.ts** — JSON field-level extraction and merge. `extractFields` picks specified fields from a large JSON; `mergeFields` merges fields back without destroying other content. Used for `.claude.json` to sync only `mcpServers` while ignoring tipsHistory/projects etc.
- **crypto.ts** — AES-256-GCM encryption. Ciphertext format: `[IV 12B][AuthTag 16B][CipherText] → Base64 → .enc`. Key stored at `~/.wangchuan/master.key` (0o600 permissions).
- **git.ts** — simple-git wrapper. `cloneOrFetch` is idempotent; `commitAndPush` returns `{committed: false}` when nothing changed; `rollback` runs `git reset --soft HEAD~1` on failure.
- **config.ts** — Config management at `~/.wangchuan/config.json`. `DEFAULT_PROFILES` defines per-agent sync strategy; `DEFAULT_SHARED` defines cross-agent sharing strategy. `CONFIG_VERSION` controls migration.
- **migrate.ts** — Version migration. `ensureMigrated()` auto-detects and migrates old configs before each command (v1→v2: repo restructuring, skills merge, stale file cleanup). Auto-backup to `~/.wangchuan/backup-v1/` before migration, auto-rollback on failure.

### Commands (`src/commands/`)

Eight user-facing commands: `init`, `sync`, `status`, `watch`, `doctor`, `memory`, `env`, `lang`.

| Command | Aliases | Purpose | Key flags |
|---------|---------|---------|-----------|
| `init` | — | One-time setup (interactive if no --repo) | `--repo`, `--key`, `--force` |
| `sync` | `s` | Smart bidirectional sync (THE daily command) | `-a, --agent`, `-n, --dry-run` |
| `status` | `st` | One-screen summary + health score | `-v, --verbose` |
| `watch` | — | Background daemon for continuous sync | `-i, --interval <min>` |
| `doctor` | — | Diagnose + auto-fix all issues | `--key-rotate`, `--key-export`, `--setup` |
| `memory` | — | Browse/copy memories between agents | `list\|show\|copy\|broadcast` |
| `env` | — | Multi-environment management | `list\|create\|switch\|current\|delete` |
| `lang` | — | Switch display language | `zh\|en` |

Many internal modules still exist (push.ts, pull.ts, diff.ts, health.ts, etc.) and are called internally by the user-facing commands — they are NOT registered as CLI commands.

### i18n (`src/i18n.ts`)

All CLI user-facing messages use `t(key, params?)` from `src/i18n.ts`. The message dictionary maps keys to `[english, chinese]` tuples. Language is resolved by: `WANGCHUAN_LANG` env → `config.json` `lang` field → default `'zh'`. Use `wangchuan lang [zh|en]` to switch.

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

## Language Conventions (MANDATORY — check before every commit)

**English-first principle**: All source code, comments, test descriptions, and AI-consumed files MUST be written in English. Chinese is ONLY allowed inside i18n message dictionary values.

| Content type | Language rule | Examples |
|---|---|---|
| **Source code** | English only — comments, TSDoc, variable names, test descriptions | All `src/**/*.ts`, `test/**/*.ts` |
| **AI-consumed files** | English only | `CLAUDE.md`, `skill/SKILL.md` |
| **Human-consumed docs** | Separate files per language: `README.md` (English), `README.zh-CN.md` (Chinese) | Root-level docs |
| **CLI output messages** | i18n via `t()` — single language per user setting | All `src/commands/*.ts`, `src/utils/*.ts`, `src/core/*.ts` |

Rules:

1. **English-first for all code**: All source code comments (block `/** */`, inline `//`), test `describe`/`it` strings, error messages, and TSDoc must be in English. No Chinese text in any `.ts` file except inside i18n dictionary values in `src/i18n.ts`.
2. **Separate README per language**: `README.md` is English-only. `README.zh-CN.md` is Chinese-only. Do NOT mix languages in the same file. Link between them at the top: `[中文](README.zh-CN.md)` / `[English](README.md)`.
3. **CLI messages = i18n via `t()`**: Every user-facing string in CLI output must use `t('key')` or `t('key', { param })` from `src/i18n.ts`. Never hardcode bilingual inline strings. Add both English and Chinese entries to the message dictionary.
4. **Pre-commit check**: Before every commit, verify:
   - `grep -rP '[\x{4e00}-\x{9fff}]' src/ test/ --include='*.ts' | grep -v 'i18n.ts'` returns empty
   - No Chinese text in `skill/SKILL.md` or project `CLAUDE.md`
   - Any new CLI message has a corresponding entry in `src/i18n.ts` with both `[en, zh]` values

## Documentation Sync Rules (IRON LAW — zero tolerance)

**Every code change that adds, removes, or modifies a command, flag, agent, or user-visible behavior MUST update ALL of the following files IN THE SAME COMMIT:**

| File | What to update |
|------|---------------|
| `skill/SKILL.md` | Command reference, flags, agent list, invocation examples |
| `CLAUDE.md` | Commands table, architecture description, agent count |
| `README.md` | Commands table, features, quick start, agent list (English) |
| `README.zh-CN.md` | Same as README.md but in Chinese |
| `REQUIREMENTS.md` | If sync scope or agent config changed |
| `.wangchuan/config.example.json` | If agent profiles or shared config changed |

**This is NOT a "do it later" task. If you change code and don't update docs in the same commit, you are shipping a bug.**

Pre-commit verification:
```bash
# Check that skill/SKILL.md lists all registered commands
grep -c 'wangchuan ' skill/SKILL.md
# Cross-reference with bin/wangchuan.ts command count
grep -c "\.command(" bin/wangchuan.ts
# These two numbers must be consistent
```

## Release Checklist (MANDATORY — execute in order)

Every release MUST complete ALL steps. Skipping any step is a release blocker.

1. **Docs sync verification**: Confirm `skill/SKILL.md`, `CLAUDE.md`, `README.md`, `README.zh-CN.md`, `REQUIREMENTS.md` all reflect current code. Run the pre-commit verification above.
2. **Privacy check**: Verify no tokens, API keys, or passwords leaked in code or configs
3. **Language check**: `grep -rP '[\x{4e00}-\x{9fff}]' src/ test/ --include='*.ts' | grep -v 'i18n.ts'` returns empty (except test data strings)
4. **Typecheck + test**: `npm run typecheck && npm test` — all must pass
5. **Bump version**: Update `package.json` version AND `bin/wangchuan.ts` `.version()` (semver: breaking → major, feature → minor, bugfix → patch)
6. **Build**: `npm run build`
7. **Commit**: git add + commit (include all doc files + version bump)
8. **Push**: git push origin main
9. **Publish**: `npm publish --registry https://registry.npmjs.org`
