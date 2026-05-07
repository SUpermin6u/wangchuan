# Wangchuan (忘川)

[中文文档](README.zh-CN.md)

> In Chinese mythology, Wangchuan (忘川) is the River of Oblivion — souls crossing it forget all memories. Wangchuan ensures your AI agent memories are never lost.

A pure skill that syncs AI agent memories, skills, and sub-agent definitions across machines via an encrypted Git repo. No CLI, no npm, no compiled code — your AI agent reads the skill and executes everything natively.

## Supported Agents

| Agent | Skills Dir | Sub-Agent Definitions | Memory |
|-------|-----------|----------------------|--------|
| Claude | `~/.claude/skills/` | `~/.claude/agents/*.md` | `~/.claude/CLAUDE.md` (single file) |
| Cursor | `~/.cursor/skills/` | `~/.cursor/agents/*.md` | `~/.cursor/rules/*.mdc` (directory of rule files) |
| OpenClaw | `~/.openclaw/workspace/skills/` | `~/.openclaw/workspace-<name>/` | `~/.openclaw/workspace/MEMORY.md`, `USER.md`, `IDENTITY.md` |

## Install

Clone or copy this project to your agent's skills directory:

```bash
# Claude
cp -r wangchuan/ ~/.claude/skills/wangchuan/

# Cursor
cp -r wangchuan/ ~/.cursor/skills/wangchuan/

# OpenClaw
cp -r wangchuan/ ~/.openclaw/workspace/skills/wangchuan/
```

Then say "initialize wangchuan" to your agent.

## Commands

| Say this | What happens |
|----------|-------------|
| initialize wangchuan | Generate key, setup repo, detect agents, first sync |
| restore wangchuan | Restore from cloud on a new machine |
| add skill xxx | Create skill, choose which agents to sync to |
| modify skill xxx | Update skill, auto-sync if shared |
| delete skill xxx | Remove from selected agents |
| view skill xxx | Show status: shared/specific, which agents, sync state |
| add agent xxx | Create sub-agent definition, choose which agents to sync to |
| modify agent xxx | Update sub-agent definition, auto-sync if shared |
| delete agent xxx | Remove sub-agent definition from selected agents |
| view agent xxx / list agents | Show status or list all sub-agent definitions |
| push memory | Encrypt + push memories to cloud |
| pull memory | Pull + decrypt memories from cloud |
| push mcp | Encrypt + push MCP server config to cloud |
| pull mcp | Pull + decrypt MCP config, sync to all agents |
| view mcp | Compare MCP configs across agents and cloud |

## How It Works

```
Local agent files → encrypt (memory only) → ~/.wangchuan/repo/ → git push → remote
Remote → git pull → ~/.wangchuan/repo/ → decrypt (memory only) → local agent files
```

Sub-agent definitions and skills are stored as plaintext (not encrypted).

## Repo Structure

```
remote git repo/
├── shared/
│   ├── skills/              # Skills used by ALL agents (plaintext)
│   ├── agents/<name>/      # Sub-agent defs shared across ALL agents
│   │   ├── <name>.md       #   Claude/Cursor format
│   │   ├── SOUL.md         #   OpenClaw format
│   │   └── IDENTITY.md     #   OpenClaw format
│   └── mcp/                 # Encrypted MCP server config
│       └── mcpServers.json.enc
└── agents/<agent>/
    ├── memory/              # Encrypted .enc files
    ├── skills/              # Agent-specific skills (plaintext)
    └── agents/<name>/       # Agent-specific sub-agent definitions
```

## Sub-Agent Definition Formats

| Platform | Format | Location |
|----------|--------|----------|
| Claude | `.md` file with YAML frontmatter (`name`, `description`, `tools`, `model`) | `~/.claude/agents/` |
| Cursor | `.md` file with YAML frontmatter (same as Claude) | `~/.cursor/agents/` |
| OpenClaw | Workspace directory with `SOUL.md` + `IDENTITY.md` | `~/.openclaw/workspace-<name>/` |

Cross-platform sync automatically converts between formats.

## Requirements

- `git`
- `openssl`
- `gh` (optional, for auto-creating repos)

## Supported Git Hosting

Works with **any Git hosting** that supports SSH or HTTPS:

| Platform | Example Repo URL |
|----------|-----------------|
| GitHub | `git@github.com:you/brain.git` |
| GitLab | `git@gitlab.com:you/brain.git` |
| Gitee | `git@gitee.com:you/brain.git` |
| Bitbucket | `git@bitbucket.org:you/brain.git` |
| Gitea | `git@gitea.example.com:you/brain.git` |
| Self-hosted | Any SSH/HTTPS Git URL |

## Security

- Memory files always encrypted (AES-256-CBC) before leaving your machine
- MCP configs always encrypted (contain sensitive tokens)
- Skills and sub-agent definitions stored as plaintext (not sensitive)
- Key at `~/.wangchuan/master.key` (mode 600, never committed)
- **Losing master.key = losing all encrypted memories — back it up!**

## License

MIT
