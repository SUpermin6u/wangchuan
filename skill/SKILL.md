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
- Validates key fingerprint against repo — detects wrong master.key before sync
- `--setup` generates migration one-liner

**Key mismatch error handling**: If `⛔ Key mismatch!` appears during sync, the local `master.key` does not match the repo. Guide the user to:
1. Run `wangchuan doctor --key-export` on the machine that last pushed
2. Copy the key hex to the current machine
3. Run `wangchuan init --key <hex>` or write to `~/.wangchuan/master.key`

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
| `claude`    | CLAUDE.md, settings.json (enc), .claude.json → mcpServers (enc), commands/ (dir), plugins/ (installed + marketplaces) |
| `gemini`    | settings.internal.json → security + model + general (enc), skills/ (dir) |
| `codebuddy` | MEMORY.md (enc), CODEBUDDY.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins + hooks (enc), plugins/ (marketplaces) |
| `workbuddy` | MEMORY.md (enc), IDENTITY.md, SOUL.md, USER.md (enc), BOOTSTRAP.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins + hooks (enc), skills/ (dir), extensions/ |
| `cursor`    | rules/ dir, mcp.json → mcpServers (enc), cli-config.json → permissions + model + enabledPlugins (enc), extensions/, hooks.json |
| `codex`     | MEMORY.md (enc), instructions.md, config.toml (enc), skills/ (dir), memories/ (enc) |

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
Run `wangchuan status` first. If there are pending actions (distributions, deletions), run `wangchuan sync` interactively with `-y` flag to process them:
```bash
wangchuan status
wangchuan sync -y   # auto-confirm pending actions
```
Check if the watch daemon is running. If not, suggest starting it:
```bash
wangchuan watch
```
The watch daemon auto-detects file changes and syncs per-agent files. Shared resource distribution is deferred for interactive confirmation.

### Rule summary
| Event | Action |
|-------|--------|
| Created/modified/deleted a skill | Run `wangchuan sync -y` immediately |
| Created/modified/deleted a custom agent | Run `wangchuan sync -y` immediately |
| Updated memory or config | Run `wangchuan sync` |
| Session start | Run `wangchuan status`, process pending if any, suggest `wangchuan watch` if not running |

## Prerequisites

1. Node.js ≥ 18
2. Git installed and configured (SSH key or HTTPS credentials)
3. A **private** Git repo on any hosting platform (GitHub, GitLab, Gitee, Bitbucket, Gitea, or self-hosted)

## Installation

### Install wangchuan CLI

```bash
npm install -g wangchuan
```

### First-time setup

```bash
# Interactive — auto-detects installed agents, creates repo via GitHub CLI if available
wangchuan init

# Or specify a repo URL directly (any Git hosting):
wangchuan init --repo git@github.com:you/brain.git
wangchuan init --repo git@gitlab.com:you/brain.git
wangchuan init --repo git@gitee.com:you/brain.git
```

### Install this skill to an agent

Copy the `wangchuan/` skill folder to your agent's skills directory:

```bash
# Claude
cp -r wangchuan/ ~/.claude/skills/wangchuan/

# OpenClaw
cp -r wangchuan/ ~/.openclaw/workspace/skills/wangchuan/

# Codex
cp -r wangchuan/ ~/.codex/skills/wangchuan/

# Or let wangchuan sync distribute it to all agents automatically:
wangchuan sync
```

### Setting up Git repo (if you don't have one)

Create a **private** repo on your preferred platform:

| Platform | How to create |
|----------|--------------|
| **GitHub** | `wangchuan init` auto-creates via `gh` CLI, or: github.com → New repository → Private |
| **GitLab** | gitlab.com → New project → Private |
| **Gitee** | gitee.com → New repo → Private |
| **Bitbucket** | bitbucket.org → Create repository → Private |
| **Gitea** | Your instance → New Repository → Private |

Then: `wangchuan init --repo <ssh-url>`

### New machine setup

```bash
npm install -g wangchuan
wangchuan init --repo <your-repo-url> --key <master-key-hex>
```

Get the master key from your original machine: `wangchuan doctor --key-export`

### Migrating the master key

⚠️ **`master.key` is the ONLY thing that cannot be recovered.** Back it up securely.

```bash
# On the source machine:
wangchuan doctor --key-export    # prints wangchuan_<hex>

# On the target machine:
wangchuan init --repo <url> --key wangchuan_<hex>
```
