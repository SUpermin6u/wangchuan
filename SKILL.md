---
name: wangchuan
version: 1.1.0
description: "Encrypt and sync AI agent memories, skills, sub-agent definitions, and configs across machines via a private Git repo. Use this skill whenever the user mentions: syncing memories, skills, or sub-agents between agents/machines, initializing or restoring wangchuan, pushing or pulling memories, adding/modifying/deleting/viewing skills or sub-agent definitions across agents, sharing skills or agents between Claude/Cursor/OpenClaw, cross-machine agent setup, backup/restore agent settings. Trigger even if the user doesn't say 'wangchuan' explicitly — any mention of syncing agent data, sharing skills/agents between AI tools, or encrypted memory backup should activate this skill."
---

# Wangchuan — Agent Memory & Skill Sync

Sync AI agent memories, skills, sub-agent definitions, and configs across environments via an encrypted private Git repo.

**Supported agents:** Claude (`~/.claude/`), Cursor (`~/.cursor/`), OpenClaw (`~/.openclaw/workspace/`)

## Pre-check

Before any operation (except init/restore), verify wangchuan is initialized:

```bash
test -f ~/.wangchuan/config.json && echo "OK" || echo "NOT_INIT"
```

If not initialized, stop and tell the user:
> Wangchuan is not initialized. Say "initialize wangchuan" to set up, or "restore wangchuan" to restore from cloud.

## Routing Table

Read the matched reference file and follow its procedure step by step.

| User Intent | Reference |
|-------------|-----------|
| Init / setup / initialize wangchuan | `references/init.md` |
| Restore / restore wangchuan / restore memories | `references/restore.md` |
| Add skill / create skill | `references/skill-crud.md` → **Add Skill** |
| Modify skill / update skill | `references/skill-crud.md` → **Modify Skill** |
| Delete skill / remove skill | `references/skill-crud.md` → **Delete Skill** |
| View skill / show skill / inspect skill | `references/skill-crud.md` → **View Skill** |
| Add agent / create agent / new agent / share agent | `references/agent-crud.md` → **Add Agent** |
| Modify agent / update agent / edit agent | `references/agent-crud.md` → **Modify Agent** |
| Delete agent / remove agent | `references/agent-crud.md` → **Delete Agent** |
| View agent / show agent / inspect agent / list agents | `references/agent-crud.md` → **View Agent** |
| Push memory / sync memory to cloud | `references/push-memory.md` |
| Pull memory / sync cloud memory | `references/pull-memory.md` |

Reference files are located relative to this skill file's directory (sibling `references/` folder).

## Execution Model

You ARE the execution engine. After reading the reference file:
1. Execute shell commands via Bash tool
2. Read/write files via Read/Write tools
3. Make intelligent decisions at branch points (conflicts, user choices)
4. Use `~/.wangchuan/scripts/encrypt.sh` and `decrypt.sh` for crypto
5. Use standard `git` for sync operations

## Skill Directory (self-contained)

This entire project directory is a self-contained installable skill:
```
wangchuan/
├── SKILL.md            ← this file (entry point)
├── references/         ← procedure files
└── scripts/
    ├── encrypt.sh      ← crypto helper
    └── decrypt.sh      ← crypto helper
```

To find the skill directory at runtime (for copying scripts during init):
```bash
# SKILL_DIR is the directory containing this SKILL.md file.
# The agent already knows this path from how it loaded the skill.
```

Install to any agent: copy this entire project folder to the agent's skills directory.

## Path Expansion

Config uses `~` notation. Always expand to full home path before use:
```bash
HOME_DIR=$(eval echo ~)
```

## Agent Detection

```bash
test -d ~/.claude && echo "claude"
test -d ~/.cursor && echo "cursor"
test -d ~/.openclaw && echo "openclaw"
```

## Error Handling

- **git push fails** → `git pull --rebase` then retry push once. If still fails, report to user.
- **decrypt fails** → key mismatch. Ask user to verify master.key.
- **agent dir missing** → skip that agent silently, only operate on detected agents.
- **repo not cloned** → suggest user run init or restore first.

## Config Structure (`~/.wangchuan/config.json`)

```json
{
  "version": 1,
  "repo": "git@github.com:user/wangchuan-sync.git",
  "keyPath": "~/.wangchuan/master.key",
  "repoPath": "~/.wangchuan/repo",
  "agents": {
    "claude": { "enabled": true, "root": "~/.claude", "skills": "~/.claude/skills", "agents": "~/.claude/agents", "memory": "~/.claude/CLAUDE.md" },
    "cursor": { "enabled": true, "root": "~/.cursor", "skills": "~/.cursor/skills", "agents": "~/.cursor/agents", "memory_dir": "~/.cursor/rules", "memory_pattern": "*.mdc" },
    "openclaw": { "enabled": false, "root": "~/.openclaw", "skills": "~/.openclaw/workspace/skills", "agents_pattern": "~/.openclaw/workspace-{name}", "memory_files": ["~/.openclaw/workspace/MEMORY.md", "~/.openclaw/workspace/USER.md", "~/.openclaw/workspace/IDENTITY.md"] }
  }
}
```

### Memory model per agent

- **Claude**: Single file (`~/.claude/CLAUDE.md`)
- **Cursor**: Directory of rule files (`~/.cursor/rules/*.mdc`) — each .mdc is an always-apply memory rule
- **OpenClaw**: Multiple files (`MEMORY.md`, `USER.md`, `IDENTITY.md` in `~/.openclaw/workspace/`)

## Repo Structure

```
~/.wangchuan/repo/
├── shared/
│   ├── skills/          # Skills shared across ALL agents
│   └── agents/          # Agent definitions shared across ALL agents
└── agents/<name>/
    ├── memory/          # Encrypted .enc files (one per memory file)
    ├── skills/          # Agent-specific skills (plaintext)
    └── agents/          # Agent-specific sub-agent definitions (plaintext)
```

For agents with multiple memory files (e.g., OpenClaw has MEMORY.md, USER.md, IDENTITY.md), each file gets its own .enc in the memory/ dir.
