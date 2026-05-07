# Agent Definition CRUD + Sharing

## Agent Path Reference

| Agent | Local Agents Dir | Definition Format |
|-------|-----------------|-------------------|
| claude | `~/.claude/agents/` | Single `.md` file with YAML frontmatter |
| cursor | `~/.cursor/agents/` | Single `.md` file with YAML frontmatter |
| openclaw | `~/.openclaw/workspace-<name>/` | Directory with SOUL.md + IDENTITY.md |

Repo paths:
- Shared agents: `~/.wangchuan/repo/shared/agents/<name>/`
- Agent-specific: `~/.wangchuan/repo/agents/<agent>/agents/<name>/`

### File Format — Claude & Cursor

Agent definitions are `.md` files with YAML frontmatter:

```markdown
---
name: my-agent
description: "When to use this agent"
tools: Read, Edit, Bash
model: sonnet
---

System prompt content here.
```

Key frontmatter fields:
- `name` (required): lowercase letters + hyphens
- `description` (required): routing hint for when to delegate
- `tools`: comma-separated tool list (or omit for all)
- `model`: sonnet / opus / haiku / inherit

### File Format — OpenClaw

OpenClaw defines specialist agents as isolated workspace directories. Each contains:

```
workspace-<name>/
├── SOUL.md         # Personality, principles, system prompt
├── IDENTITY.md     # Name, emoji, one-line intro
└── AGENTS.md       # Operating instructions (optional)
```

Created via `openclaw agents add <name>`.

### Cross-Platform Conversion

When syncing an agent definition between Claude/Cursor (single .md) and OpenClaw (workspace dir):

- **Claude/Cursor → OpenClaw**: Extract frontmatter `description` → IDENTITY.md, markdown body → SOUL.md
- **OpenClaw → Claude/Cursor**: Combine SOUL.md content as body, derive frontmatter from IDENTITY.md

---

## View Agent

### Triggers
- View agent xxx
- Show agent xxx
- Inspect agent xxx
- List agents

### Flow

1. Search for the agent definition by name (fuzzy match) across:
   - `~/.wangchuan/repo/shared/agents/`
   - `~/.wangchuan/repo/agents/*/agents/`
   - Claude: `~/.claude/agents/`
   - Cursor: `~/.cursor/agents/`
   - OpenClaw: check for `~/.openclaw/workspace-<name>/` directories

2. If user said "list agents" (no specific name):
   - Scan all locations above
   - Output a table: name | type (shared/agent-specific) | agents using it

3. If specific name given, determine:
   - **Is shared?** → exists in `shared/agents/`
   - **Which agents use it?** → check each agent's local agents location
   - **In sync with cloud?** → compare local file/dir vs repo content

4. Output to user:
   ```
   Agent: <name>
   Type: Shared agent / <agent>-specific agent
   Agents using it: claude, cursor, openclaw
   Cloud sync: In sync / Local changes pending push
   Description: <description>
   ---
   <agent definition content>
   ```

---

## Add Agent

### Triggers
- Add agent xxx
- Create agent xxx
- New agent xxx
- Share agent xxx

### Flow

1. Confirm the agent definition content:
   - If user has already created an agent file in current agent → use that
   - If user provides a file path → read and use that content
   - Otherwise → ask user to describe the agent's purpose, then create the definition

2. For Claude/Cursor: validate frontmatter has `name` and `description`.
   For OpenClaw: ensure at minimum SOUL.md exists with the agent's system prompt.

3. Ask user: "Sync to other agents?"

   Options:
   - Current agent only
   - Claude
   - Cursor
   - OpenClaw
   - **All (as shared agent)**

4. **If "All":**
   ```bash
   # Store canonical form in repo (as directory with both formats)
   mkdir -p ~/.wangchuan/repo/shared/agents/<name>
   # Store the .md file (Claude/Cursor format)
   cp <agent_file> ~/.wangchuan/repo/shared/agents/<name>/<name>.md
   # Generate OpenClaw format
   # (extract body → SOUL.md, extract description → IDENTITY.md)
   
   # Deploy to Claude
   cp <agent_file> ~/.claude/agents/<name>.md
   # Deploy to Cursor
   cp <agent_file> ~/.cursor/agents/<name>.md
   # Deploy to OpenClaw (create workspace if not exists)
   mkdir -p ~/.openclaw/workspace-<name>
   # Write SOUL.md from markdown body
   # Write IDENTITY.md from name + description
   ```

5. **If specific agents (not all):**
   ```bash
   # Copy to selected agents locally (format-appropriate)
   # Store in agent-specific repo dir
   mkdir -p ~/.wangchuan/repo/agents/<agent_name>/agents/<name>
   cp <agent_file> ~/.wangchuan/repo/agents/<agent_name>/agents/<name>/<name>.md
   ```

6. Strip embedded `.git` directories:
   ```bash
   find ~/.wangchuan/repo/shared/agents/ -name ".git" -type d -exec rm -rf {} + 2>/dev/null
   find ~/.wangchuan/repo/agents -path "*/agents/*/.git" -type d -exec rm -rf {} + 2>/dev/null
   ```

7. Push to cloud:
   ```bash
   cd ~/.wangchuan/repo
   git add -A
   git commit -m "Add agent: <name>"
   git push origin main
   ```

8. Report success with sync status.

---

## Modify Agent

### Triggers
- Modify agent xxx
- Update agent xxx
- Edit agent xxx

### Flow

1. Find the agent definition (fuzzy match across all locations).

2. Confirm the modification (user has already edited, or describe changes).

3. Check if it's a shared agent:
   ```bash
   test -d ~/.wangchuan/repo/shared/agents/<name>
   ```

4. **If shared agent:**
   - Automatically sync to ALL agents that use it:
     ```bash
     # Update repo
     cp <modified> ~/.wangchuan/repo/shared/agents/<name>/<name>.md
     # Update Claude
     cp <modified> ~/.claude/agents/<name>.md
     # Update Cursor
     cp <modified> ~/.cursor/agents/<name>.md
     # Update OpenClaw workspace (convert format)
     # Regenerate SOUL.md + IDENTITY.md in ~/.openclaw/workspace-<name>/
     ```
   - Auto push to cloud

5. **If NOT shared agent:**
   - Ask user: "Sync to other agents?"
     Options: [Current agent only] [Claude] [Cursor] [OpenClaw] [All]
   - If "All" → promote to shared:
     ```bash
     # Move from agent-specific to shared
     mv ~/.wangchuan/repo/agents/<original_agent>/agents/<name> \
        ~/.wangchuan/repo/shared/agents/<name>
     # Deploy to all local agents (format-appropriate)
     ```
   - If specific agents → copy to those agents + their repo dirs

6. Strip embedded `.git` directories:
   ```bash
   find ~/.wangchuan/repo/shared/agents/ -name ".git" -type d -exec rm -rf {} + 2>/dev/null
   find ~/.wangchuan/repo/agents -path "*/agents/*/.git" -type d -exec rm -rf {} + 2>/dev/null
   ```

7. Push to cloud:
   ```bash
   cd ~/.wangchuan/repo
   git add -A
   git commit -m "Update agent: <name>"
   git push origin main
   ```

---

## Delete Agent

### Triggers
- Delete agent xxx
- Remove agent xxx

### Flow

1. Find the agent definition.

2. Inform user:
   - Is it a shared agent? (exists in `shared/agents/`)
   - Which agents currently have it?

3. Ask: "Remove from which agents?"

   Options:
   - Current agent only
   - Claude
   - Cursor
   - OpenClaw
   - **All (complete deletion)**

4. **If "All":**
   ```bash
   # Remove from Claude
   rm -f ~/.claude/agents/<name>.md
   # Remove from Cursor
   rm -f ~/.cursor/agents/<name>.md
   # Remove OpenClaw workspace (only if created by wangchuan — check for marker)
   rm -rf ~/.openclaw/workspace-<name>
   # Remove from repo
   rm -rf ~/.wangchuan/repo/shared/agents/<name>
   rm -rf ~/.wangchuan/repo/agents/*/agents/<name>
   ```

5. **If specific agents (not all):**
   - Remove from selected agents locally (format-appropriate)
   
   Then handle repo:
   - **Was shared agent + not all removed:**
     - Remove from `shared/agents/`
     - For agents that KEEP the agent → copy to their `agents/{name}/agents/`
     ```bash
     rm -rf ~/.wangchuan/repo/shared/agents/<name>
     # For each agent that keeps it:
     mkdir -p ~/.wangchuan/repo/agents/<keeping_agent>/agents/<name>
     cp <local_agent_def> ~/.wangchuan/repo/agents/<keeping_agent>/agents/<name>/
     ```
   - **Was agent-specific agent:**
     ```bash
     rm -rf ~/.wangchuan/repo/agents/<agent>/agents/<name>
     ```

6. Push to cloud:
   ```bash
   cd ~/.wangchuan/repo
   git add -A
   git commit -m "Delete agent: <name> from [agents]"
   git push origin main
   ```

7. Confirm deletion to user.
