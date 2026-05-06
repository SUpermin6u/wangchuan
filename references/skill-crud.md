# Skill CRUD + Sharing

## Agent Path Reference

| Agent | Skills Dir |
|-------|-----------|
| claude | `~/.claude/skills/` |
| cursor | `~/.cursor/skills/` |
| openclaw | `~/.openclaw/workspace/skills/` |

Repo paths:
- Shared skills: `~/.wangchuan/repo/shared/skills/`
- Agent-specific: `~/.wangchuan/repo/agents/<name>/skills/`

---

## View Skill

### Triggers
- View skill xxx
- Show skill xxx
- Inspect skill xxx

### Flow

1. Search for the skill file by name (fuzzy match) across:
   - `~/.wangchuan/repo/shared/skills/`
   - `~/.wangchuan/repo/agents/*/skills/`
   - Each enabled agent's local skills directory

2. Determine:
   - **Is shared?** → exists in `shared/skills/`
   - **Which agents use it?** → check each agent's local skills dir
   - **In sync with cloud?** → compare local file vs repo file content

3. Output to user:
   ```
   Skill: <name>
   Type: Shared skill / <agent>-specific skill
   Agents using it: claude, cursor, openclaw
   Cloud sync: In sync / Local changes pending push
   ---
   <skill content summary or full content>
   ```

---

## Add Skill

### Triggers
- Add skill xxx
- Create skill xxx
- New skill xxx

### Flow

1. Confirm the skill content:
   - If user has already created a skill file in current agent → use that
   - Otherwise → ask user to describe the skill, then create the .md file

2. Ask user: "Sync to other agents?"

   Options:
   - Current agent only
   - Claude
   - Cursor
   - OpenClaw
   - **All (as shared skill)**

3. **If "All":**
   ```bash
   # Copy to shared in repo
   cp <skill_file> ~/.wangchuan/repo/shared/skills/<name>.md
   # Copy to all local agent dirs
   cp <skill_file> ~/.claude/skills/<name>.md
   cp <skill_file> ~/.cursor/skills/<name>.md
   cp <skill_file> ~/.openclaw/workspace/skills/<name>.md
   ```

4. **If specific agents (not all):**
   ```bash
   # Copy to selected agents locally
   cp <skill_file> <selected_agent_skills_dir>/<name>.md
   # Store in agent-specific repo dirs
   cp <skill_file> ~/.wangchuan/repo/agents/<name>/skills/<name>.md
   ```

5. Strip embedded `.git` directories (skills that are themselves git repos would be recorded as submodules otherwise, causing files to not sync to remote):
   ```bash
   find ~/.wangchuan/repo/shared/skills/<name> -name ".git" -type d -exec rm -rf {} + 2>/dev/null
   find ~/.wangchuan/repo/agents -path "*/skills/<name>/.git" -type d -exec rm -rf {} + 2>/dev/null
   ```

6. Push to cloud:
   ```bash
   cd ~/.wangchuan/repo
   git add -A
   git commit -m "Add skill: <name>"
   git push origin main
   ```

7. Report success with sync status.

---

## Modify Skill

### Triggers
- Modify skill xxx
- Update skill xxx
- Edit skill xxx

### Flow

1. Find the skill file (fuzzy match across all locations).

2. Confirm the modification (user has already edited, or describe changes).

3. Check if it's a shared skill:
   ```bash
   test -f ~/.wangchuan/repo/shared/skills/<name>.md
   ```

4. **If shared skill:**
   - Automatically sync to ALL agents that use it:
     ```bash
     cp <modified_skill> ~/.wangchuan/repo/shared/skills/<name>.md
     # Update all local agents
     cp <modified_skill> ~/.claude/skills/<name>.md
     cp <modified_skill> ~/.cursor/skills/<name>.md
     cp <modified_skill> ~/.openclaw/workspace/skills/<name>.md
     ```
   - Auto push to cloud

5. **If NOT shared skill:**
   - Ask user: "Sync to other agents?"
     Options: [Current agent only] [Claude] [Cursor] [OpenClaw] [All]
   - If "All" → promote to shared:
     ```bash
     # Move from agent-specific to shared
     mv ~/.wangchuan/repo/agents/<original_agent>/skills/<name>.md \
        ~/.wangchuan/repo/shared/skills/<name>.md
     # Copy to all local agents
     ```
   - If specific agents → copy to those agents + their repo dirs

6. Strip embedded `.git` directories from copied skills:
   ```bash
   find ~/.wangchuan/repo/shared/skills/<name> -name ".git" -type d -exec rm -rf {} + 2>/dev/null
   find ~/.wangchuan/repo/agents -path "*/skills/<name>/.git" -type d -exec rm -rf {} + 2>/dev/null
   ```

7. Push to cloud:
   ```bash
   cd ~/.wangchuan/repo
   git add -A
   git commit -m "Update skill: <name>"
   git push origin main
   ```

---

## Delete Skill

### Triggers
- Delete skill xxx
- Remove skill xxx

### Flow

1. Find the skill file.

2. Inform user:
   - Is it a shared skill? (exists in `shared/skills/`)
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
   # Remove from all local agent dirs
   rm -f ~/.claude/skills/<name>.md
   rm -f ~/.cursor/skills/<name>.md
   rm -f ~/.openclaw/workspace/skills/<name>.md
   # Remove from repo (shared or agent-specific)
   rm -f ~/.wangchuan/repo/shared/skills/<name>.md
   rm -f ~/.wangchuan/repo/agents/*/skills/<name>.md
   ```

5. **If specific agents (not all):**
   ```bash
   # Remove from selected agents locally
   rm -f <selected_agent_skills_dir>/<name>.md
   ```
   
   Then handle repo:
   - **Was shared skill + not all removed:**
     - Remove from `shared/skills/`
     - For agents that KEEP the skill → copy to their `agents/{name}/skills/`
     ```bash
     rm ~/.wangchuan/repo/shared/skills/<name>.md
     # For each agent that keeps it:
     cp <skill_from_local> ~/.wangchuan/repo/agents/<keeping_agent>/skills/<name>.md
     ```
   - **Was agent-specific skill:**
     - Just remove from that agent's repo dir
     ```bash
     rm -f ~/.wangchuan/repo/agents/<agent>/skills/<name>.md
     ```

6. Push to cloud:
   ```bash
   cd ~/.wangchuan/repo
   git add -A
   git commit -m "Delete skill: <name> from [agents]"
   git push origin main
   ```

7. Confirm deletion to user.
