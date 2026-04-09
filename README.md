# Wangchuan (忘川)

[中文文档](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/wangchuan)](https://www.npmjs.com/package/wangchuan)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.19.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Encrypted sync for AI agent configs and memories — across machines, across agents, never lost.

Wangchuan encrypts and syncs your AI agent configurations, memories, and skills through a private Git repo. One command to sync, one daemon to keep everything up to date.

---

## Quick Start

```bash
npm install -g wangchuan

# 1. Initialize (interactive wizard)
wangchuan init

# 2. Sync everything
wangchuan sync

# 3. Start background daemon
wangchuan watch
```

On a new machine:

```bash
wangchuan init --repo git@github.com:you/brain.git --key /path/to/master.key
wangchuan sync
```

---

## Commands

| Command | Aliases | Description | Key Flags |
|---------|---------|-------------|-----------|
| `init` | — | One-time setup (interactive if no `--repo`) | `--repo`, `--key`, `--force` |
| `sync` | `s` | Smart bidirectional sync — THE daily command | `-a, --agent`, `-n, --dry-run` |
| `status` | `st` | One-screen summary + health score | `-v, --verbose` |
| `watch` | — | Background daemon for continuous sync | `-i, --interval <min>` |
| `doctor` | — | Diagnose + auto-fix everything | `--key-export`, `--key-rotate`, `--setup` |
| `memory` | — | Browse/copy memories between agents | `list`, `show`, `copy`, `broadcast` |
| `env` | — | Multi-environment management | `list`, `create`, `switch`, `current`, `delete` |
| `lang` | — | Switch display language | `zh`, `en` |

---

## Supported Agents

| Agent | Default Path | Synced Content |
|-------|-------------|----------------|
| **OpenClaw** | `~/.openclaw/workspace/` | MEMORY.md (enc), AGENTS.md, SOUL.md, IDENTITY.md, USER.md (enc), memory/ (enc) |
| **Claude** | `~/.claude/` | CLAUDE.md, settings.json (enc), `.claude.json` → mcpServers (enc) |
| **Gemini** | `~/.gemini/` | `settings.internal.json` → security + model + general (enc) |
| **CodeBuddy** | `~/.codebuddy/` | MEMORY.md (enc), CODEBUDDY.md, mcp.json → mcpServers (enc), settings.json → enabledPlugins (enc) |
| **WorkBuddy** | `~/.workbuddy/` | MEMORY.md (enc), IDENTITY.md, SOUL.md, USER.md (enc), mcp.json → mcpServers (enc) |
| **Cursor** | `~/.cursor/` | rules/ (dir), mcp.json → mcpServers (enc), cli-config.json → fields (enc) |
| **Codex** | `~/.codex/` | AGENTS.md, instructions.md |

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
- `wangchuan memory copy openclaw claude` — transfer memories
- `wangchuan memory broadcast claude` — share to all agents

### Doctor
- Auto-discovers installed agents
- Detects stale/phantom files
- `--key-export` / `--key-rotate` for key management
- `--setup` generates a migration one-liner for new machines

---

## Configuration

Config at `~/.wangchuan/config.json`:

```jsonc
{
  "repo": "git@github.com:you/brain.git",
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
git clone https://github.com/nicepkg/wangchuan.git
cd wangchuan && npm install && npm run build && npm link
```

Requires Node.js ≥ 18.19.0.

---

## License

MIT
