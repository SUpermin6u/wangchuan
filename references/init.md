# Initialize Wangchuan

## Triggers

- Initialize wangchuan
- Setup wangchuan
- wangchuan init

## Flow

### Step 1: Check existing installation

```bash
test -d ~/.wangchuan
```

- If exists → ask user: "Wangchuan is already initialized. Re-initialize? (will overwrite current config)"
  - No → abort
  - Yes → `rm -rf ~/.wangchuan` and continue

### Step 2: Ask about existing repo

Ask user: "Do you have an existing wangchuan cloud repo?"

Options:
- **Yes (need to restore)** → redirect to [restore.md](./restore.md)
- **No, fresh setup** → continue to Step 3

### Step 3: Create directory structure

```bash
mkdir -p ~/.wangchuan/scripts
chmod 700 ~/.wangchuan
```

### Step 4: Generate master key

```bash
openssl rand -base64 32 > ~/.wangchuan/master.key
chmod 600 ~/.wangchuan/master.key
```

### Step 5: Install helper scripts

Copy encrypt/decrypt scripts from the skill directory (`scripts/` subfolder, sibling to this references/ folder):

```bash
# SKILL_DIR = the directory where SKILL.md lives (agent knows this path from how the skill was loaded)
cp "$SKILL_DIR/scripts/encrypt.sh" ~/.wangchuan/scripts/
cp "$SKILL_DIR/scripts/decrypt.sh" ~/.wangchuan/scripts/
chmod +x ~/.wangchuan/scripts/*.sh
```

### Step 6: Setup Git repo

Ask user for git repo URL. If user doesn't have one, offer to create:

```bash
# If gh CLI available and user wants auto-creation:
gh repo create wangchuan-sync --private --clone --description "Wangchuan encrypted agent sync"
mv wangchuan-sync ~/.wangchuan/repo
```

Otherwise:
```bash
git clone <USER_PROVIDED_REPO_URL> ~/.wangchuan/repo
```

If the repo is empty, initialize structure:
```bash
mkdir -p ~/.wangchuan/repo/{shared/skills,agents/claude/memory,agents/claude/skills,agents/cursor/memory,agents/cursor/skills,agents/openclaw/memory,agents/openclaw/skills}
echo "# Wangchuan Sync Repo" > ~/.wangchuan/repo/README.md
```

### Step 7: Detect installed agents

```bash
AGENTS=""
test -d ~/.claude && AGENTS="$AGENTS claude"
test -d ~/.cursor && AGENTS="$AGENTS cursor"
test -d ~/.openclaw && AGENTS="$AGENTS openclaw"
```

Report detected agents to user.

### Step 8: Write config.json

Based on detected agents, write `~/.wangchuan/config.json`:

```json
{
  "version": 1,
  "repo": "<REPO_URL>",
  "keyPath": "~/.wangchuan/master.key",
  "repoPath": "~/.wangchuan/repo",
  "agents": {
    "claude": {
      "enabled": true,
      "root": "~/.claude",
      "skills": "~/.claude/skills",
      "memory": "~/.claude/CLAUDE.md"
    },
    "cursor": {
      "enabled": "<true if detected>",
      "root": "~/.cursor",
      "skills": "~/.cursor/skills",
      "memory_dir": "~/.cursor/rules",
      "memory_pattern": "*.mdc"
    },
    "openclaw": {
      "enabled": "<true if detected>",
      "root": "~/.openclaw",
      "skills": "~/.openclaw/workspace/skills",
      "memory_files": [
        "~/.openclaw/workspace/MEMORY.md",
        "~/.openclaw/workspace/USER.md",
        "~/.openclaw/workspace/IDENTITY.md"
      ]
    }
  }
}
```

Set only detected agents to `"enabled": true`.

### Step 9: Scan and sync skills

For each enabled agent, scan its skills directory:

```bash
ls ~/.claude/skills/ 2>/dev/null
ls ~/.cursor/skills/ 2>/dev/null
ls ~/.openclaw/workspace/skills/ 2>/dev/null
```

Compare skill files across agents:
- If the same skill (same filename) exists in 2+ agents → copy to `shared/skills/`
- Agent-unique skills → copy to `agents/{name}/skills/`

**IMPORTANT: Strip embedded `.git` directories after copying.**
Skills that are themselves git repos will be treated as submodules otherwise, causing files to not sync to the remote.

```bash
# After all copies are done, remove any nested .git dirs in the repo
find ~/.wangchuan/repo/shared/skills -maxdepth 2 -name ".git" -type d -exec rm -rf {} + 2>/dev/null
find ~/.wangchuan/repo/agents -path "*/skills/*/.git" -type d -exec rm -rf {} + 2>/dev/null
```

### Step 10: Encrypt and push memories

For each enabled agent, encrypt its memory file(s):

**Claude** (single file):
```bash
test -f ~/.claude/CLAUDE.md && \
~/.wangchuan/scripts/encrypt.sh ~/.wangchuan/master.key \
  ~/.claude/CLAUDE.md \
  ~/.wangchuan/repo/agents/claude/memory/CLAUDE.md.enc
```

**Cursor** (all .mdc files in rules dir):
```bash
for f in ~/.cursor/rules/*.mdc; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  ~/.wangchuan/scripts/encrypt.sh ~/.wangchuan/master.key \
    "$f" \
    ~/.wangchuan/repo/agents/cursor/memory/"${name}.enc"
done
```

**OpenClaw** (multiple specific files):
```bash
for f in MEMORY.md USER.md IDENTITY.md; do
  src=~/.openclaw/workspace/"$f"
  [ -f "$src" ] || continue
  ~/.wangchuan/scripts/encrypt.sh ~/.wangchuan/master.key \
    "$src" \
    ~/.wangchuan/repo/agents/openclaw/memory/"${f}.enc"
done
```

### Step 11: Commit and push

```bash
cd ~/.wangchuan/repo
git add -A
git commit -m "Initial sync from $(hostname)"
git push origin main
```

### Step 12: Output summary

Tell user:
1. Initialization complete
2. Detected agents: [list]
3. Shared skills: [count]
4. Key fingerprint: `openssl dgst -sha256 ~/.wangchuan/master.key | awk '{print $2}' | cut -c1-16`
5. **IMPORTANT: Save your master.key** — required when restoring on a new machine:
   ```bash
   cat ~/.wangchuan/master.key
   ```
