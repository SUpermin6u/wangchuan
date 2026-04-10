# wangchuan — AI Agent Memory Sync Skill

## Overview

OpenClaw Skill wrapper for the Wangchuan AI memory sync system. Invoke directly in conversation to sync AI agent configs — memories never lost across environments.

## Command Reference

```
wangchuan init     [--repo <url>] [--key <path>]           One-time setup — auto-detects agents, offers gh repo create, runs first sync
wangchuan sync     [-a, --agent <name>] [-n, --dry-run]    Smart bidirectional sync (THE daily command)
                   [-o, --only <patterns...>]              Filter: only sync files matching patterns
                   [-x, --exclude <patterns...>]           Filter: exclude files matching patterns
wangchuan status   [-v, --verbose]                         One-screen summary + health score
wangchuan watch    [-i, --interval <min>]                  Background daemon for continuous sync
wangchuan doctor   [--key-export|--key-rotate|--setup]     Diagnose + auto-fix everything
wangchuan memory   list|show|copy|broadcast                Browse/copy memories between agents
wangchuan env      list|create|switch|current|delete       Multi-environment management
wangchuan snapshot save|list|restore|delete [name]         Manage sync snapshots
wangchuan lang     [zh|en]                                 Switch CLI display language
```

Aliases: `sync` → `s`, `status` → `st`, `snapshot` → `snap`

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

> Start continuous background sync

> List memories from all agents

> Copy openclaw memory to claude

> Broadcast a memory to all agents

> Save a snapshot before making changes

> Restore the last snapshot

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
- `--only` / `--exclude` for fine-grained file filtering (stale detection auto-skipped when filters active)

### snapshot
- `save [name]` — save a named snapshot (auto-named if omitted)
- `list` — show all saved snapshots with timestamps
- `restore <name>` — roll back to a previous snapshot
- `delete <name>` — remove a snapshot

### watch
- Runs as a background daemon with configurable interval
- Auto-syncs on detected file changes
- PID file at `~/.wangchuan/watch.pid`

### doctor
- Auto-fixes all common issues (no --fix needed)
- Auto-discovers installed agents and enables them
- Detects stale/phantom files
- `--key-export` / `--key-rotate` for key management
- `--setup` generates migration one-liner

### memory
- `list` — show all agent memories with summaries
- `show <agent>` — list all files when no filename given; fuzzy/substring matching with suggestions on mismatch
- `copy <from> <to>` — copy memory between agents
- `broadcast <agent>` — distribute memory to all agents

## --agent Filter

Supported by: `sync`, `status`, `watch`, `memory`.

| Value | Description |
|-------|-------------|
| `openclaw`  | MEMORY.md (enc), AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md (enc), HEARTBEAT.md, BOOTSTRAP.md, memory/ (enc), openclaw.json → agents/skills/ui (enc), skills/ |
| `claude`    | CLAUDE.md, settings.json (enc), .claude.json → mcpServers (enc) |
| `gemini`    | settings.internal.json → security + model + general (enc) |
| `codebuddy` | MEMORY.md (enc), CODEBUDDY.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins (enc) |
| `workbuddy` | MEMORY.md (enc), IDENTITY.md, SOUL.md, USER.md (enc), BOOTSTRAP.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins (enc) |
| `cursor`    | rules/ dir, mcp.json → mcpServers (enc), cli-config.json → permissions + model + enabledPlugins (enc) |
| `codex`     | AGENTS.md, instructions.md |

When omitted, operates on all enabled agents plus the shared tier (skills/MCP/custom agents/shared memory).

## Custom Sub-Agent Sync

Custom sub-agents defined in the `agents/` directory of any supported agent (Claude, Cursor, CodeBuddy, WorkBuddy) are automatically synced across all agents via the shared tier (`shared/agents/`). The same deletion confirmation logic as skills applies — a custom agent is pruned from the repo only when all local agents have removed it.

## Dynamic Agent Registration

Custom agents can be registered at runtime via the `customAgents` field in `config.json`, without recompilation. Custom agents participate in sync identically to built-in agents and support all three entry types (`syncFiles`, `syncDirs`, `jsonFields`).

## Sync Protocol for AI Agents (IMPORTANT — all agents must follow)

When this skill is loaded by an AI agent, the agent MUST follow these rules:

### After modifying skills or custom agents
If you (the AI agent) create, modify, or delete any file under your `skills/` or `agents/` directory, you MUST immediately run:
```bash
wangchuan sync
```
This triggers cross-agent distribution with user confirmation — the user chooses which other agents receive the change.

### After modifying memory or config
If you update MEMORY.md, CLAUDE.md, settings.json, or any synced config file, run `wangchuan sync` to push changes to the cloud.

### On session start
Check if the watch daemon is running. If not, suggest starting it:
```bash
wangchuan watch
```
The watch daemon auto-detects file changes and triggers sync, serving as a safety net when the agent forgets to sync manually.

### Rule summary
| Event | Action |
|-------|--------|
| Created/modified/deleted a skill | Run `wangchuan sync` immediately |
| Created/modified/deleted a custom agent | Run `wangchuan sync` immediately |
| Updated memory or config | Run `wangchuan sync` |
| Session start | Check `wangchuan status`, suggest `wangchuan watch` if not running |

## Prerequisites

1. Node.js ≥ 18
2. `wangchuan init` has been run (~/.wangchuan/config.json exists)
3. Local SSH key has access to the target git repo
4. Copy `~/.wangchuan/master.key` manually when migrating across machines (or use `wangchuan doctor --key-export`)
