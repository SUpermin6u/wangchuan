# Restore Wangchuan (New Machine)

## Triggers

- Restore wangchuan
- Restore memories
- Restore cloud memories
- wangchuan restore

## Flow

### Step 1: Collect credentials

Ask user for:
1. **Git repo URL** — e.g. `git@github.com:user/wangchuan-sync.git`
2. **Master key** — either:
   - A file path (e.g. `/tmp/master.key`)
   - Or the base64 string directly (user pastes it)

### Step 2: Create directory structure

```bash
mkdir -p ~/.wangchuan/scripts
chmod 700 ~/.wangchuan
```

### Step 3: Save master key

If user provided a file path:
```bash
cp <USER_KEY_PATH> ~/.wangchuan/master.key
chmod 600 ~/.wangchuan/master.key
```

If user provided base64 string:
```bash
echo "<BASE64_STRING>" > ~/.wangchuan/master.key
chmod 600 ~/.wangchuan/master.key
```

### Step 4: Install helper scripts

Copy encrypt/decrypt scripts from the skill directory:

```bash
# SKILL_DIR = the directory where SKILL.md lives (agent knows this path)
cp "$SKILL_DIR/scripts/encrypt.sh" ~/.wangchuan/scripts/
cp "$SKILL_DIR/scripts/decrypt.sh" ~/.wangchuan/scripts/
chmod +x ~/.wangchuan/scripts/*.sh
```

### Step 5: Clone repo

```bash
git clone <REPO_URL> ~/.wangchuan/repo
```

Verify clone succeeded and contains expected structure (`shared/`, `agents/`).

### Step 6: Detect local agents

```bash
AGENTS=""
test -d ~/.claude && AGENTS="$AGENTS claude"
test -d ~/.cursor && AGENTS="$AGENTS cursor"
test -d ~/.openclaw && AGENTS="$AGENTS openclaw"
```

### Step 7: Restore for each detected agent

For each enabled agent:

#### a. Decrypt and restore memory

```bash
~/.wangchuan/scripts/decrypt.sh ~/.wangchuan/master.key \
  ~/.wangchuan/repo/agents/<name>/memory/<filename>.enc \
  <agent_memory_path>
```

> If encrypted file doesn't exist in repo for an agent, skip silently.

#### b. Restore agent-specific skills

```bash
cp ~/.wangchuan/repo/agents/<name>/skills/* <agent_skills_dir>/ 2>/dev/null
```

#### c. Restore shared skills

```bash
cp ~/.wangchuan/repo/shared/skills/* <agent_skills_dir>/ 2>/dev/null
```

### Step 8: Write config.json

Write `~/.wangchuan/config.json` with repo URL, key path, and detected agent paths (same format as init.md Step 8).

### Step 9: Check for local-only additions

If the local agent has skills not present in the repo, report:
> Detected local skills not in cloud: [list]. Use "push memory" to sync them.

### Step 10: Output summary

Tell user:
1. Restore complete
2. Restored agents: [list]
3. Skills restored: shared=[count], per-agent=[count]
4. Memory files restored: [list]
5. Key fingerprint matches: `openssl dgst -sha256 ~/.wangchuan/master.key | awk '{print $2}' | cut -c1-16`
