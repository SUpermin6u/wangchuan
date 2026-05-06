# Wangchuan (忘川)

[中文文档](README.zh-CN.md)

> In Chinese mythology, Wangchuan (忘川) is the River of Oblivion — souls crossing it forget all memories. Wangchuan ensures your AI agent memories are never lost.

A pure skill that syncs AI agent memories and skills across machines via an encrypted Git repo. No CLI, no npm, no compiled code — your AI agent reads the skill and executes everything natively.

## Supported Agents

| Agent | Skills Dir | Memory |
|-------|-----------|--------|
| Claude | `~/.claude/skills/` | `~/.claude/CLAUDE.md` (single file) |
| Cursor | `~/.cursor/skills/` | `~/.cursor/rules/*.mdc` (directory of rule files) |
| OpenClaw | `~/.openclaw/workspace/skills/` | `~/.openclaw/workspace/MEMORY.md`, `USER.md`, `IDENTITY.md` |

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
| push memory | Encrypt + push memories to cloud |
| pull memory | Pull + decrypt memories from cloud |

## How It Works

```
Local agent files → encrypt (memory only) → ~/.wangchuan/repo/ → git push → remote
Remote → git pull → ~/.wangchuan/repo/ → decrypt (memory only) → local agent files
```

## Repo Structure

```
remote git repo/
├── shared/skills/           # Skills used by ALL agents (plaintext)
└── agents/<name>/
    ├── memory/              # Encrypted .enc files
    └── skills/              # Agent-specific skills (plaintext)
```

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
- Skills stored as plaintext (not sensitive)
- Key at `~/.wangchuan/master.key` (mode 600, never committed)
- **Losing master.key = losing all encrypted memories — back it up!**

## License

MIT
