# Pull Memory

## Triggers

- Pull memory
- Sync cloud memory
- Download memories

## Agent Memory Paths

| Agent | Memory Type | Local Path(s) | Repo Path |
|-------|------------|---------------|-----------|
| claude | Single file | `~/.claude/CLAUDE.md` | `agents/claude/memory/CLAUDE.md.enc` |
| cursor | Directory | `~/.cursor/rules/*.mdc` | `agents/cursor/memory/<name>.mdc.enc` |
| openclaw | Multiple files | `~/.openclaw/workspace/MEMORY.md`, `USER.md`, `IDENTITY.md` | `agents/openclaw/memory/<name>.enc` |

## Flow

### Step 1: Pull latest from remote

```bash
cd ~/.wangchuan/repo
git pull --rebase origin main
```

### Step 2: Read config

```bash
cat ~/.wangchuan/config.json
```

### Step 3: For each enabled agent, decrypt and merge

Handle each agent type:

#### Claude (single file)

1. If `agents/claude/memory/CLAUDE.md.enc` exists → decrypt to /tmp
2. Read local `~/.claude/CLAUDE.md`
3. Compare and merge (see merge strategy below)
4. Write merged result to local file

#### Cursor (directory of .mdc files)

1. List all `.mdc.enc` files in `agents/cursor/memory/`
2. For each: decrypt to /tmp
3. Compare with corresponding local file in `~/.cursor/rules/`
4. Merge each file individually
5. If repo has a .mdc.enc that has no local counterpart → create new local .mdc file
6. If local has a .mdc that has no repo counterpart → keep it (suggest user push later)

#### OpenClaw (multiple files)

1. For each file listed in `memory_files` config:
   - If corresponding `.enc` exists in `agents/openclaw/memory/` → decrypt
   - Compare with local version
   - Merge and write back
2. If repo has a file not in local → create it locally
3. If local has a file not in repo → keep it

### Step 4: Merge strategy (for all agents)

When cloud and local versions differ:
1. Split both by section headers
2. Cloud has content local doesn't → append to local
3. Local has content cloud doesn't → keep local (suggest push later)
4. Conflicting sections → show to user:
   ```
   CONFLICT: [section name] in <filename>
   --- Local version ---
   <content>
   --- Cloud version ---
   <content>
   ---
   Choose: [Keep local] [Keep cloud] [Manual merge]
   ```
5. Write merged result to local file

### Step 5: Sync shared skills

After memory pull, check if shared skills in repo differ from local:

```bash
# For each file in ~/.wangchuan/repo/shared/skills/
diff ~/.wangchuan/repo/shared/skills/<skill>.md <agent_skills_dir>/<skill>.md
```

Determine action by content diff (not timestamp):
- Repo differs from local AND local matches last-known repo version → update local silently
- Repo differs from local AND local has its own edits → warn user:
  ```
  Shared skill "<name>" updated in cloud, but local has modifications.
  Choose: [Keep local] [Use cloud version] [Show diff]
  ```
- Repo has a skill not present locally → copy to local agent skills dir

### Step 6: Cleanup

```bash
rm -f /tmp/wangchuan_cloud_*.md /tmp/wangchuan_cloud_*.mdc
```

### Step 7: Report

Tell user:
```
Memory pull complete:
- claude: CLAUDE.md updated (+2 sections)
- cursor: general.mdc updated, dev-workflow.mdc no changes
- openclaw: MEMORY.md updated, USER.md no changes, IDENTITY.md no changes

Local-only content (not in cloud):
- cursor: git-workflow.mdc (use "push memory" to sync)
```
