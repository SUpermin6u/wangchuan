# Wangchuan (忘川)

[中文文档](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/wangchuan)](https://www.npmjs.com/package/wangchuan)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.19.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> In Chinese mythology, Wangchuan (忘川) is the River of Oblivion in the underworld — souls crossing it forget all memories of past lives. Wangchuan ensures your AI agent memories are never lost across environments.

**Wangchuan is a skill for AI agents.** Install once, and any AI agent (OpenClaw, Claude, Gemini, Codex, ...) gains the ability to sync its configs, memories, skills, and MCP servers across all your machines — encrypted, versioned, and conflict-aware.

---

## Why a Skill?

AI agents today run in isolated environments. When you switch machines, reset a container, or onboard a new laptop, every agent starts from zero — no memory, no skills, no MCP config.

Wangchuan solves this by **becoming part of your agent's brain**:

```
You: "Initialize wangchuan"
Agent: (installs CLI, asks for repo URL, auto-detects all local agents,
        syncs everything to cloud, starts background pull daemon)

You: "Create a new skill called xxx"
Agent: (creates skill, asks which agents to distribute to,
        copies to selected agents, pushes to cloud)

You: "Switch to work environment"
Agent: (syncs current changes, switches branch, pulls work env data,
        checks for conflicts, restarts background daemon)
```

**The agent does everything.** You just talk to it. The skill file (`skill/SKILL.md`) teaches the agent exactly how to manage your memories — no manual CLI needed.

### Skill Architecture

```
skill/
├── SKILL.md                    ← Agent loads this (~100 lines, routing table)
├── references/
│   ├── resource-crud.md        ← Skills/agents/MCP/memory CRUD procedures
│   ├── sync-conflict.md        ← Push/pull/conflict resolution
│   ├── environment.md          ← Environment management, rollback, snapshots
│   ├── inspect-status.md       ← Resource inspection, health diagnostics
│   └── install-setup.md        ← Initialization, key management
└── wangchuan-skill.sh          ← OpenClaw shell wrapper
```

The main SKILL.md is kept under 120 lines. When the agent encounters a specific task (e.g. "delete a skill"), it loads only the relevant reference file on demand — progressive disclosure, not a giant prompt dump.

### Skill Benchmark

Every skill change is validated against **51 test cases** (`test/skill-benchmark.md`) covering:

- 29 user instructions (init, CRUD for 4 resource types, push/pull, rollback, env management)
- 4 environment isolation scenarios (cross-env pull, workspace leakage, env selection on restore, watch restart)
- Global rules (watch daemon auto-start, env-aware sync, non-TTY constraints)

### Install the Skill

```bash
# Install CLI
npm install -g wangchuan

# The skill auto-distributes to all agents on first sync.
# Or manually copy to an agent:
cp -r skill/ ~/.claude/skills/wangchuan/
```

---

## Quick Start

```bash
npm install -g wangchuan

# Initialize — auto-detects installed agents, runs first sync
wangchuan init

# On a new machine (any Git hosting):
wangchuan init --repo git@github.com:you/brain.git --key wangchuan_<hex>
```

---

## Commands

| Command | Aliases | Description | Key Flags |
|---------|---------|-------------|-----------|
| `init` | — | One-time setup — auto-detects agents, auto-creates repo (GitHub CLI), runs first sync | `--repo`, `--key`, `--force` |
| `sync` | `s` | Smart bidirectional sync — THE daily command | `-a, --agent`, `-n, --dry-run`, `-o, --only`, `-x, --exclude` |
| `status` | `st` | One-screen summary + health score | `-v, --verbose` |
| `watch` | — | Pull-only background daemon for continuous cloud sync | `-i, --interval <min>` |
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

### Cross-Agent Sharing
- Skills, MCP configs, and custom sub-agents auto-distributed to all agents
- MCP configs merged into one shared cloud file (`shared/mcp/mcpServers.json.enc`)
- Delete propagation — removed from all agents → pruned from repo

### Three-Way Merge
- Automatic conflict resolution for `.md`, `.txt`, `.json`, `.yaml`, `.yml` files
- Non-overlapping edits → auto-merged silently
- Overlapping conflicts → conflict markers written for user resolution
- Watch daemon records unresolvable conflicts to `pending-conflicts.json` for next interactive session

### Multi-Environment
- Create isolated environments: `wangchuan env create work`
- Switch instantly: `wangchuan env switch work`
- Git-branch-level isolation; shared local workspace with leakage detection

### Watch Daemon (Pull-Only)
- `wangchuan watch` continuously pulls cloud changes in the background
- Does **not** push — users must `wangchuan sync` to push manually
- Auto-started by the skill after every interaction
- Restarts automatically on environment switch

### Snapshot Rollback
- Auto-snapshots before every sync (safety net)
- Named snapshots: `wangchuan snapshot save before-refactor`
- Restore: `wangchuan snapshot restore <name>` (auto-pushes to cloud)

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

> **Tip**: If GitHub CLI (`gh`) is installed, `wangchuan init` offers one-command repo creation.

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

1. `master.key` is in `.gitignore` — never committed
2. Auto-scan for plaintext tokens before sync
3. Transfer keys via encrypted channels only
4. ⚠️ **Losing `master.key` = losing all encrypted history — back it up!**

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
