# wangchuan — AI Agent Memory Sync Skill

## Overview

OpenClaw Skill wrapper for the Wangchuan AI memory sync system. Invoke directly in conversation to sync AI agent configs — memories never lost across environments.

## Command Reference

```
wangchuan sync     [--agent <name>] [-n]       Smart bidirectional sync (the ONE daily command)
wangchuan status   [--agent <name>] [-v]       Show sync state at a glance (-v for full detail)
wangchuan doctor   [--key-export|--key-rotate|--setup]  Diagnose + auto-fix issues
wangchuan env      list|create|switch|current|delete    Multi-environment management
wangchuan lang     [zh|en]                     Switch CLI display language
wangchuan init     --repo <git-url>            First-time init (one-time)
```

## Invocation Examples

> Sync my AI memories

> Check sync status

> Show full sync status with file list and diff

> Sync claude configs only

> Run a health check and fix any issues

> Export my master key for migration

> Generate a setup command for my new laptop

> Create a work environment

> Switch to work environment

> Switch to English output

## Output Guide

### status (default)
- Health score bar (0-100)
- Changed files count since last sync
- Last sync timestamp
- Hint: `wangchuan sync` to update

### status --verbose
- Full file inventory with local/repo presence
- Line-level diff for changed files
- Recent sync history
- Per-agent health breakdown

### sync
- Auto-creates safety snapshot before syncing
- Pulls remote changes if any, then pushes local changes
- Shows compact summary with files synced count

### doctor
- Auto-fixes all common issues (no --fix needed)
- Auto-discovers installed agents and enables them
- Detects stale/phantom files
- `--key-export` / `--key-rotate` for key management
- `--setup` generates migration one-liner

## --agent Filter

All commands support `--agent` to filter by agent.

| Value | Description |
|-------|-------------|
| `openclaw`  | MEMORY.md (enc), AGENTS.md, SOUL.md, IDENTITY.md, USER.md (enc), memory/ dir (enc) |
| `claude`    | CLAUDE.md, settings.json (enc), .claude.json → mcpServers (enc) |
| `gemini`    | settings.internal.json → security + model + general (enc) |
| `codebuddy` | MEMORY.md (enc), CODEBUDDY.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins (enc) |
| `workbuddy` | MEMORY.md (enc), IDENTITY.md, SOUL.md, USER.md (enc), mcp.json → mcpServers (enc), settings.json → enabledPlugins (enc) |
| `cursor`    | rules/ dir, mcp.json → mcpServers (enc), cli-config.json → permissions + model + enabledPlugins (enc) |
| `codex`     | AGENTS.md, instructions.md |

When omitted, operates on all enabled agents plus the shared tier (skills/MCP/shared memory).

## Prerequisites

1. Node.js ≥ 18
2. `wangchuan init` has been run (~/.wangchuan/config.json exists)
3. Local SSH key has access to the target git repo
4. Copy `~/.wangchuan/master.key` manually when migrating across machines (or use `wangchuan doctor --key-export`)
