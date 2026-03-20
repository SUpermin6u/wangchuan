# wangchuan — AI Agent Memory Sync Skill

## Overview

OpenClaw Skill wrapper for the Wangchuan AI memory sync system. Invoke directly in conversation to sync AI agent configs — memories never lost across environments.

## Command Reference

```
wangchuan list   [--agent openclaw|claude|gemini]     List managed configs
wangchuan status [--agent openclaw|claude|gemini]     Show sync status & diff summary
wangchuan diff   [--agent openclaw|claude|gemini]     Show line-level file diff
wangchuan pull   [--agent openclaw|claude|gemini]     Pull & restore from repo
wangchuan push   [--agent <name>] [-m "<msg>"]        Encrypt & push to repo
wangchuan dump   [--agent openclaw|claude|gemini]     Plaintext snapshot to temp dir
wangchuan lang   [zh|en]                              Switch CLI display language
wangchuan init   --repo <git-url>                     First-time init
```

## Invocation Examples

> List all files managed by Wangchuan

> Check Wangchuan sync status

> Show diff for openclaw only

> Pull the latest AI memories to local

> Pull openclaw configs only

> Push my MEMORY.md changes with note "update project memory"

> Push claude configs only

> Generate a plaintext dump so I can inspect

> Switch to English output

> Switch back to Chinese

## Output Guide

### list
- `✔ local  ✔ repo` — Present on both sides, in sync
- `✔ local  · repo` — Local only, not yet pushed
- `✖ local  ✔ repo` — In repo but missing locally, run pull
- `[enc]` — Encrypted (AES-256-GCM)
- `[field]` — JSON field-level extraction (only syncs specified fields)

### diff
- `+` green lines — Local additions
- `-` red lines — Removed locally
- Gray lines — Context (unchanged)
- `[enc]` — Encrypted files auto-decrypted for comparison

### push / pull
- `[encrypted]` / `[decrypted]` — Processed with AES-256-GCM
- `[pruned]` — Stale files removed from repo (delete propagation)
- `⚠ local-only` — Local-only files detected, suggest push

## --agent Filter

All commands support `--agent` to filter by agent.

| Value | Description |
|-------|-------------|
| `openclaw` | MEMORY.md (enc), AGENTS.md, SOUL.md — default ~/.openclaw/workspace/ |
| `claude`   | CLAUDE.md, settings.json (enc), .claude.json → mcpServers field extraction (enc) — default ~/.claude-internal/ |
| `gemini`   | settings.internal.json → security + model field extraction (enc) — default ~/.gemini/ |

When omitted, operates on all enabled agents plus the shared tier (skills/MCP/shared memory).

## Prerequisites

1. Node.js ≥ 18
2. `wangchuan init` has been run (~/.wangchuan/config.json exists)
3. Local SSH key has access to the target git repo
4. Copy `~/.wangchuan/master.key` manually when migrating across machines
