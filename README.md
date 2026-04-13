# Wangchuan (忘川)

[中文文档](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/wangchuan)](https://www.npmjs.com/package/wangchuan)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.19.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> In Chinese mythology, Wangchuan (忘川) is the River of Oblivion in the underworld — souls crossing it forget all memories of past lives. Wangchuan ensures your AI agent memories are never lost across environments.

Wangchuan encrypts and syncs all your AI agents' configs, memories, and skills across machines and environments — switch laptops, change environments, and restore every agent's state with a single command.

---

## Quick Start

```bash
npm install -g wangchuan

# 1. Initialize — auto-detects installed agents and runs first sync
wangchuan init

# 2. Start background daemon (optional)
wangchuan watch
```

On a new machine:

```bash
wangchuan init --repo git@github.com:you/brain.git --key wangchuan_<hex>
# Also works with GitLab, Gitee, Bitbucket, Gitea, or any Git hosting:
# wangchuan init --repo git@gitlab.com:you/brain.git --key wangchuan_<hex>
```

---

## Commands

| Command | Aliases | Description | Key Flags |
|---------|---------|-------------|-----------|
| `init` | — | One-time setup — auto-detects agents, auto-creates repo (GitHub CLI), runs first sync | `--repo`, `--key`, `--force` |
| `sync` | `s` | Smart bidirectional sync — THE daily command | `-a, --agent`, `-n, --dry-run`, `-o, --only`, `-x, --exclude` |
| `status` | `st` | One-screen summary + health score | `-v, --verbose` |
| `watch` | — | Background daemon for continuous sync | `-i, --interval <min>` |
| `doctor` | — | Diagnose + auto-fix everything | `--key-export`, `--key-rotate`, `--setup` |
| `memory` | — | Browse/copy memories between agents | `list`, `show`, `copy`, `broadcast` |
| `env` | — | Multi-environment management | `list`, `create`, `switch`, `current`, `delete` |
| `snapshot` | `snap` | Manage sync snapshots | `save`, `list`, `restore`, `delete` |
| `lang` | — | Switch display language | `zh`, `en` |

---

## Supported Agents

| Agent | Default Path | Synced Content |
|-------|-------------|----------------|
| **OpenClaw** | `~/.openclaw/workspace/` | MEMORY.md (enc), AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md (enc), HEARTBEAT.md, BOOTSTRAP.md, memory/ (enc), openclaw.json → agents/skills/ui (enc), skills/ |
| **Claude** | `~/.claude/` | CLAUDE.md, settings.json (enc), `.claude.json` → mcpServers (enc), commands/ (dir), plugins/ (installed + marketplaces) |
| **Gemini** | `~/.gemini/` | `settings.internal.json` → security + model + general (enc), skills/ (dir) |
| **CodeBuddy** | `~/.codebuddy/` | MEMORY.md (enc), CODEBUDDY.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins + hooks (enc), plugins/ (marketplaces) |
| **WorkBuddy** | `~/.workbuddy/` | MEMORY.md (enc), IDENTITY.md, SOUL.md, USER.md (enc), BOOTSTRAP.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins + hooks (enc), skills/ (dir), extensions/ |
| **Cursor** | `~/.cursor/` | rules/ (dir), mcp.json → mcpServers (enc), cli-config.json → fields (enc), extensions/, hooks.json |
| **Codex** | `~/.codex/` | MEMORY.md (enc), instructions.md, config.toml (enc), skills/ (dir), memories/ (enc) |

Agent paths are customizable in `~/.wangchuan/config.json`.

---

## Features

### Encryption
- **AES-256-GCM** authenticated encryption — tamper-proof
- Key stored locally at `~/.wangchuan/master.key` (never committed)
- Ciphertext: `IV(12B) + AuthTag(16B) + CipherText` → Base64 → `.enc`
- Auto-scan for leaked tokens before every sync

### Cross-Agent Sharing
- Skills, MCP configs, and custom sub-agents auto-distributed to all agents
- Custom agents in `agents/` directories synced across Claude/Cursor/CodeBuddy/WorkBuddy via `shared/agents/`
- Delete propagation — removed from all agents → pruned from repo
- Existing entries preserved (no overwrite)

### Snapshot Rollback
- `wangchuan snapshot save [name]` — save a named snapshot before risky changes
- `wangchuan snapshot list` — view all saved snapshots
- `wangchuan snapshot restore <name>` — roll back to a previous snapshot
- `wangchuan snapshot delete <name>` — remove a snapshot

### Custom Agent Registration
- Define custom agents in `config.json` via `customAgents` field — no recompilation needed
- Custom agents participate in sync just like built-in agents

### Extended Conflict Resolution
- Three-way merge now supports `.json`, `.yaml`, `.yml` files in addition to `.md`/`.txt`

### Multi-Environment
- Create isolated environments: `wangchuan env create work`
- Switch instantly: `wangchuan env switch work`
- Each environment has its own agent configs

### Watch Daemon
- `wangchuan watch` runs continuous background sync
- Configurable interval: `wangchuan watch -i 10`
- PID singleton — only one instance per machine

### Memory Browsing
- `wangchuan memory list` — overview of all agent memories
- `wangchuan memory show <agent>` — list all files; fuzzy/substring matching with suggestions on mismatch
- `wangchuan memory copy openclaw claude` — transfer memories
- `wangchuan memory broadcast claude` — share to all agents

### Doctor
- Auto-discovers installed agents
- Detects stale/phantom files
- `--key-export` / `--key-rotate` for key management
- `--setup` generates a migration one-liner for new machines

---

## Supported Git Hosting

Wangchuan works with **any Git hosting** that supports SSH or HTTPS:

| Platform | Example Repo URL |
|----------|-----------------|
| **GitHub** | `git@github.com:you/brain.git` |
| **GitLab** | `git@gitlab.com:you/brain.git` |
| **Gitee** | `git@gitee.com:you/brain.git` |
| **Bitbucket** | `git@bitbucket.org:you/brain.git` |
| **Gitea** | `git@gitea.example.com:you/brain.git` |
| **Self-hosted** | Any SSH/HTTPS Git URL |

> **Tip**: If GitHub CLI (`gh`) is installed and authenticated, `wangchuan init` offers one-command repo creation. For other platforms, create a private repo first, then pass its URL to `wangchuan init --repo <url>`.

---

## Supported Git Hosting

Wangchuan works with **any Git hosting** that supports SSH or HTTPS:

| Platform | Example Repo URL |
|----------|-----------------|
| **GitHub** | `git@github.com:you/brain.git` |
| **GitLab** | `git@gitlab.com:you/brain.git` |
| **Gitee** | `git@gitee.com:you/brain.git` |
| **Bitbucket** | `git@bitbucket.org:you/brain.git` |
| **Gitea** | `git@gitea.example.com:you/brain.git` |
| **Self-hosted** | Any SSH/HTTPS Git URL |

> **Tip**: If GitHub CLI (`gh`) is installed and authenticated, `wangchuan init` offers one-command repo creation. For other platforms, create a private repo first, then pass its URL to `wangchuan init --repo <url>`.

---

## Configuration

Config at `~/.wangchuan/config.json`:

```jsonc
{
  "repo": "git@github.com:you/brain.git",  // or any Git hosting URL  // or any Git hosting URL
  "branch": "main",
  "localRepoPath": "~/.wangchuan/repo",
  "keyPath": "~/.wangchuan/master.key",
  "version": 2,
  "profiles": {
    "default": {
      "openclaw": { "enabled": true, "workspacePath": "~/.openclaw/workspace" },
      "claude":   { "enabled": true, "workspacePath": "~/.claude" },
      "gemini":   { "enabled": true, "workspacePath": "~/.gemini" }
    }
  },
  "shared": {
    "skills": { "sources": [{ "agent": "claude", "dir": "skills/" }] },
    "mcp":    { "sources": [{ "agent": "claude", "src": ".claude.json", "field": "mcpServers" }] },
    "syncFiles": []
  }
}
```

---

## Security

1. `master.key` is in `.gitignore` — never accidentally committed
2. Auto-scan for plaintext tokens (`api_key`, `sk-xxx`, `password`) before sync
3. Transfer keys via encrypted channels only
4. ⚠️ **Losing `master.key` means losing access to all encrypted history — back it up!**

---

## Installation

```bash
npm install -g wangchuan
```

From source:

```bash
git clone https://github.com/SUpermin6u/wangchuan.git
cd wangchuan && npm install && npm run build && npm link
```

Requires Node.js ≥ 18.19.0.

---

## License

MIT
