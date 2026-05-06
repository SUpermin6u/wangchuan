# Push Memory

## Triggers

- Push memory
- Sync memory to cloud
- Upload memories

## Agent Memory Paths

| Agent | Memory Type | Local Path(s) | Repo Path |
|-------|------------|---------------|-----------|
| claude | Single file | `~/.claude/CLAUDE.md` | `agents/claude/memory/CLAUDE.md.enc` |
| cursor | Directory | `~/.cursor/rules/*.mdc` | `agents/cursor/memory/<name>.mdc.enc` (one per file) |
| openclaw | Multiple files | `~/.openclaw/workspace/MEMORY.md`, `USER.md`, `IDENTITY.md` | `agents/openclaw/memory/<name>.enc` (one per file) |

## Flow

### Step 1: Pull latest from remote

```bash
cd ~/.wangchuan/repo
git pull --rebase origin main
```

If pull fails due to conflicts, do `git rebase --abort` and `git pull --ff-only`. If that also fails, report to user.

### Step 2: Read config

```bash
cat ~/.wangchuan/config.json
```

### Step 3: For each enabled agent, compare and push

Read the agent's memory config from config.json and handle each type:

#### Claude (single file: `memory` field)

1. Read local `~/.claude/CLAUDE.md`
2. If `agents/claude/memory/CLAUDE.md.enc` exists in repo → decrypt to /tmp, compare
3. If identical → skip
4. If different → apply merge strategy (see below), then encrypt and write to repo

#### Cursor (directory: `memory_dir` + `memory_pattern` fields)

1. List all files matching `~/.cursor/rules/*.mdc`
2. For each .mdc file:
   - If corresponding `.mdc.enc` exists in `agents/cursor/memory/` → decrypt, compare
   - If different → merge, encrypt, write to repo
   - If new (no .enc in repo) → encrypt directly

#### OpenClaw (multiple files: `memory_files` field)

1. For each file in the `memory_files` list (MEMORY.md, USER.md, IDENTITY.md):
   - If corresponding `.enc` exists in `agents/openclaw/memory/` → decrypt, compare
   - If different → merge, encrypt, write to repo
   - If new → encrypt directly

### Step 4: Merge strategy (for all agents)

When local and cloud versions differ:
1. Split both by section headers (`#`, `##`, `###`)
2. Sections in only one version → include in merged result
3. Sections in both but different content → show conflict to user:
   ```
   CONFLICT: [section name] in <filename>
   --- Local version ---
   <content>
   --- Cloud version ---
   <content>
   ---
   Choose: [Keep local] [Keep cloud] [Manual merge]
   ```
4. Write merged result back to local file

### Step 5: Encrypt and write to repo

For each file with changes:

```bash
~/.wangchuan/scripts/encrypt.sh ~/.wangchuan/master.key \
  <local_file> \
  ~/.wangchuan/repo/agents/<agent>/memory/<filename>.enc
```

### Step 6: Commit and push

```bash
cd ~/.wangchuan/repo
git add -A
git commit -m "Push memory from $(hostname) at $(date +%Y-%m-%d_%H:%M)"
git push origin main
```

If push fails → `git pull --rebase` then retry once.

### Step 7: Cleanup

```bash
rm -f /tmp/wangchuan_cloud_*.md /tmp/wangchuan_cloud_*.mdc
```

### Step 8: Report

Tell user:
```
Memory push complete:
- claude: CLAUDE.md updated
- cursor: 2 rules updated (general.mdc, dev-workflow.mdc), 1 unchanged
- openclaw: MEMORY.md updated, USER.md unchanged, IDENTITY.md unchanged
```
