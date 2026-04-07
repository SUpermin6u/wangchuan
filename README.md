# Wangchuan (忘川)

[中文文档](README.zh-CN.md)

> In Chinese mythology, Wangchuan (忘川) is the River of Oblivion in the underworld — souls crossing it forget all memories of past lives.
> **Wangchuan** ensures your AI agent memories are never lost across environments.

Encrypted backup and cross-environment migration for AI agent configs and memories. Supports **7 agents**: OpenClaw, Claude, Gemini, CodeBuddy, WorkBuddy, Cursor, and Codex.

[![npm version](https://img.shields.io/npm/v/wangchuan)](https://www.npmjs.com/package/wangchuan)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.19.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Features

- **AES-256-GCM encryption** — keys stored locally, never committed to Git
- **7 agents** — OpenClaw, Claude, Gemini, CodeBuddy, WorkBuddy, Cursor, Codex
- **Cross-agent sharing** — skills and MCP configs auto-distributed across all agents
- **JSON field-level sync** — extract specific fields (e.g. `mcpServers` from `.claude.json`)
- **Delete propagation** — items deleted from all agents are pruned from repo
- **One-click restore** — `init + pull` fully restores all agent configs on a new server
- **Conflict resolution** — interactive overwrite/skip choices on pull
- **Auto-rollback** — failed operations don't pollute repo history
- **i18n** — full English and Chinese CLI support via `wangchuan lang zh|en`
- **Plaintext token scanning** — auto-detect leaked secrets before push
- **Config migration** — automatic v1→v2 migration with backup and rollback

---

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize system, generate AES-256-GCM key, clone private repo |
| `pull` | Pull and decrypt configs from repo, restore to local workspace |
| `push` | Encrypt and push local configs to repo |
| `sync` | Two-way sync (pull then push) |
| `status` | Show repo status, workspace diff and file inventory |
| `diff` | Line-level diff per file (auto-decrypt) |
| `list` | List all managed files with local/repo presence |
| `dump` | Generate plaintext snapshot to temp dir for inspection |
| `lang` | Switch CLI display language (zh/en) |
| `watch` | Watch for file changes and auto-sync |
| `env` | Manage sync environments (create/switch/list/delete) |
| `agent` | Manage agents (list/enable/disable/set-path/info) |
| `key` | Key management (export/import/rotate) |
| `report` | Generate sync report |
| `doctor` | Diagnose and fix common issues |
| `history` | Show sync operation history |
| `snapshot` | Create/restore/list point-in-time snapshots |
| `summary` | Show sync summary statistics |
| `setup` | Guided interactive setup wizard |
| `health` | System health check |
| `search` | Search across synced files |
| `config` | Config export/import management |
| `changelog` | Show sync changelog |
| `tag` | Memory tagging system |
| `cleanup` | Clean up expired memory entries |
| `template` | Apply pre-built sync config templates |
| `batch` | Run multiple commands in sequence |
| `completions` | Generate shell completion scripts (bash/zsh) |

All commands support `--agent <name>` filtering (except `lang`).

---

## Installation

```bash
npm install -g wangchuan
```

Or from source:

```bash
git clone https://github.com/nicepkg/wangchuan.git
cd wangchuan
npm install
npm run build
npm link
```

---

## Quick Start

### 1. Initialize

```bash
wangchuan init --repo git@github.com:yourname/your-brain.git
```

This creates:
- `~/.wangchuan/config.json` — system configuration
- `~/.wangchuan/master.key` — master encryption key (**back this up!**)
- `~/.wangchuan/repo` — local clone of your sync repo

### 2. Push local configs

```bash
wangchuan push -m "initial sync"
```

### 3. Pull on a new machine

```bash
wangchuan init --repo git@github.com:yourname/your-brain.git --key /path/to/master.key
wangchuan pull
```

### 4. Check status

```bash
wangchuan status
```

### 5. Switch language

```bash
wangchuan lang en      # English
wangchuan lang zh      # Chinese
WANGCHUAN_LANG=en wangchuan status   # env override
```

### 6. Filter by agent

```bash
wangchuan push --agent claude -m "update Claude config"
wangchuan pull --agent openclaw
wangchuan diff --agent gemini
```

---

## Supported Agents

| Agent | Default Path | Sync Files | JSON Fields |
|-------|-------------|------------|-------------|
| **OpenClaw** | `~/.openclaw/workspace/` | MEMORY.md (enc), AGENTS.md, SOUL.md | — |
| **Claude** | `~/.claude/` | CLAUDE.md, settings.json (enc) | `.claude.json` → `mcpServers` (enc) |
| **Gemini** | `~/.gemini/` | — | `settings.internal.json` → `security`, `model` |
| **CodeBuddy** | `~/.codebuddy/` | MEMORY.md (enc), CODEBUDDY.md | `mcp.json` → `mcpServers` (enc) |
| **WorkBuddy** | `~/.workbuddy/` | MEMORY.md (enc), IDENTITY.md, SOUL.md, USER.md (enc) | `mcp.json` → `mcpServers` (enc) |
| **Cursor** | `~/.cursor/` | rules/ (dir) | `mcp.json` → `mcpServers` (enc), `cli-config.json` → fields (enc) |
| **Codex** | `~/.codex/` | MEMORY.md (enc), instructions.md | — |

Each agent's `workspacePath` can be customized in `~/.wangchuan/config.json`.

---

## Repo Structure (v2)

```
repo/
├── shared/                        Cross-agent shared tier
│   ├── skills/                    Merged skills from all agents
│   ├── mcp/                       Extracted MCP configs
│   └── memory/SHARED.md.enc       Shared memory (encrypted)
├── agents/
│   ├── openclaw/
│   │   ├── MEMORY.md.enc          Long-term memory (encrypted)
│   │   ├── AGENTS.md              Agent behavior rules
│   │   └── SOUL.md                Agent persona
│   ├── claude/
│   │   ├── CLAUDE.md              Global instructions
│   │   ├── settings.json.enc      Permissions/plugins/model (encrypted)
│   │   └── mcpServers.json.enc    Extracted from .claude.json (encrypted)
│   ├── gemini/
│   │   └── settings-sync.json     Extracted security + model fields
│   ├── codebuddy/
│   ├── workbuddy/
│   ├── cursor/
│   └── codex/
```

---

## Encryption

- **Algorithm**: AES-256-GCM (authenticated encryption, tamper-proof)
- **Key**: `~/.wangchuan/master.key` (32 bytes, hex-encoded)
- **Ciphertext format**: `IV(12B) + AuthTag(16B) + CipherText` → Base64 → `.enc` file
- ⚠️ **Losing `master.key` means losing access to all encrypted history — back it up!**

---

## Configuration

Config at `~/.wangchuan/config.json`:

```jsonc
{
  "repo": "git@github.com:yourname/your-brain.git",
  "branch": "main",
  "localRepoPath": "~/.wangchuan/repo",
  "keyPath": "~/.wangchuan/master.key",
  "version": 2,
  "profiles": {
    "default": {
      "openclaw": { "enabled": true, "workspacePath": "~/.openclaw/workspace", ... },
      "claude":   { "enabled": true, "workspacePath": "~/.claude", ... },
      "gemini":   { "enabled": true, "workspacePath": "~/.gemini", ... },
      "codex":    { "enabled": true, "workspacePath": "~/.codex", ... }
    }
  },
  "shared": {
    "skills": { "sources": [{ "agent": "claude", "dir": "skills/" }, ...] },
    "mcp":    { "sources": [{ "agent": "claude", "src": ".claude.json", "field": "mcpServers" }, ...] },
    "syncFiles": [...]
  }
}
```

---

## Security

1. `master.key` is in `.gitignore` — never accidentally committed
2. Auto-scan for plaintext tokens (`api_key`, `sk-xxx`, `password`, etc.) before push
3. Transfer keys via encrypted channels only (never plaintext email/IM)

---

## Project Structure

```
wangchuan/
├── bin/wangchuan.ts          CLI entry
├── src/
│   ├── core/
│   │   ├── sync.ts           Sync engine (distribute, prune, 3-way ops)
│   │   ├── json-field.ts     JSON field extraction & merge
│   │   ├── crypto.ts         AES-256-GCM encrypt/decrypt
│   │   ├── git.ts            simple-git wrapper
│   │   ├── config.ts         Config management (v2 profiles + shared)
│   │   └── migrate.ts        v1→v2 migration (backup + lock + rollback)
│   ├── agents/               Agent definitions (one file per agent)
│   ├── commands/             28 CLI commands
│   ├── utils/                Logger, validator, line diff, prompt
│   ├── i18n.ts               i18n message dictionary & t() helper
│   └── types.ts              Global type definitions
├── skill/                    OpenClaw Skill wrapper
├── test/                     Unit tests (crypto, json-field, sync engine)
└── .wangchuan/
    └── config.example.json   Config example (v2)
```

---

## License

MIT
