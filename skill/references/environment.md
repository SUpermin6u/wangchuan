# Environment Management, Rollback, and Snapshots

## Environment basics

Environments map to git branches: `default` → `main`, `<name>` → `env/<name>`.

**Critical: isolation model.** Environments are **Git-branch-only isolation**. The local workspace (`~/.claude/`, `~/.cursor/`, etc.) is a **single shared copy** across all environments. Switching env = switch branch + overwrite local from new branch. But pull **never deletes** local files — files from the old env may remain as "leakage".

### Impact on all operations

| Operation | Environment behavior |
|-----------|---------------------|
| `sync` (push/pull) | Always targets current env's branch. Cannot push to or pull from another env. |
| `watch` | Pulls from current env only. After `env switch`, **must restart watch**. |
| Skill/agent/MCP CRUD | Changes apply to local workspace, pushed to current env's branch on sync. |
| `memory copy/broadcast` | Operates on local workspace files (shared). Pushed to current env on sync. |
| After `env switch` | Old env's local files may linger. Check `wangchuan status -v` for `localOnly` files before pushing — do NOT blindly push stale files to the new env. |
| Pull from another env | Must `env switch <target>` first. No `--from-env` flag exists. |

## Listing environments (指令 26)

When user says "查看忘川环境列表" / "list environments":

```bash
# List all environments
wangchuan env list
```

For per-environment health, iterate branches and check sync metadata:
```bash
# For each environment, check active machines and health
cd ~/.wangchuan/repo
for branch in $(git branch -r --list 'origin/env/*' | sed 's|origin/||'); do
  env_name=$(echo "$branch" | sed 's|env/||')
  echo "=== Environment: $env_name ==="
  # Count active machines from recent commits on that branch
  git log "origin/$branch" --oneline -20 --format="%s" | grep -oP '\[([^\]]+)\]$' | sort -u | wc -l | xargs -I{} echo "  Active machines: {}"
  # Check last sync time
  git log "origin/$branch" --oneline -1 --format="%ci" | xargs -I{} echo "  Last sync: {}"
done
# Also check default branch
echo "=== Environment: default ==="
git log origin/main --oneline -20 --format="%s" | grep -oP '\[([^\]]+)\]$' | sort -u | wc -l | xargs -I{} echo "  Active machines: {}"
```

For detailed health of a specific environment, switch to it and run `wangchuan status -v` (see inspect-status.md).

## Current environment (指令 27)

When user says "看下忘川当前环境" / "which environment am I in":

```bash
wangchuan env current
wangchuan status -v
```

Report: environment name, active machines count, health score, unsynced files, anomalies.

## Creating a new environment (指令 28)

When user says "新建忘川 xxx 环境" / "create xxx environment":

**Step 1: Check if environment already exists.**
```bash
wangchuan env list
```
If the name already exists, inform the user and ask: "Environment 'xxx' already exists. Would you like to: (1) Import current env's memories into it, or (2) Just switch to it?"
- Import: `wangchuan env switch <name>` → then ask user if they want to sync: `wangchuan sync -y`
- Switch only: `wangchuan env switch <name>`

**Step 2: Ask about data initialization.**
Ask the user which option they prefer:
- **Fork current environment** (recommended for most cases) — the new env starts with a complete copy of the current env's memories, skills, MCP, agents, and configs. This is the default.
- **Start empty** — the new env starts with no data. Note: `env create` in non-TTY mode auto-forks; to create a truly empty env, the agent must create the branch manually and make an empty initial commit.

**Step 3: Create.**
```bash
# Fork current env (default, works in non-TTY):
wangchuan env create <name>

# To create from a specific existing env instead of current:
wangchuan env switch <source-env>       # switch to source first
wangchuan env create <name>             # fork from it
wangchuan env switch <name>             # switch to the new env
```

**Step 4: Confirm and report.**
After creation, the user is still on the **original** environment. Ask if they want to switch to the new one:
```bash
wangchuan env switch <name>
```

`env create` in non-TTY mode auto-forks with memories (no interactive prompt needed). To create an empty environment, there is no flag — the fork behavior is the default. If user explicitly wants empty, agent would need to create the branch manually.

## Deleting an environment (指令 29)

When user says "删除忘川 xxx 环境" / "delete xxx environment":

**Step 1: Confirm with user.**
Ask: "Are you sure you want to delete environment 'xxx'? This removes the cloud branch and all its history."

**Step 2: Check constraints.**
- Cannot delete `default` environment
- Cannot delete the currently active environment (must switch first)

**Step 3: Execute.**
```bash
wangchuan env delete <name>
```

**Important**: `env delete` only removes the git branch. Local workspace files are NOT affected — they belong to whatever environment is currently active. Cloud data for that environment is permanently gone.

## Switching environments

When user says "切换到 xxx 环境" / "switch to work environment":

**Step 1: Check for unsynced local changes BEFORE switching.**
```bash
wangchuan status
```
- **Few changes (≤3 files)**: warn briefly, ask user: "Push changes before switching?" If yes: `wangchuan sync -y`
- **Many changes or conflicts**: `wangchuan status -v` → show diff → ask "Push current changes first, or discard and switch?"

**Step 2: Switch.**
```bash
wangchuan env switch <name>
```
Auto-switches branch, updates config, runs sync to pull target env's data.

**Step 3: Post-switch checks.**

Check for conflict markers:
```bash
grep -rl '<<<<<<< LOCAL' ~/.claude/ ~/.openclaw/workspace/ ~/.codebuddy/ ~/.workbuddy/ ~/.codex/ 2>/dev/null
```
- No conflicts → success
- Conflicts → show to user, resolve

Check for stale files from previous env (workspace leakage):
```bash
wangchuan status -v   # look for "localOnly" files — these are from the old env
```
Warn user: "These files exist locally but not in the new environment. Do NOT push them unless you intentionally want to bring them into this env."

**Step 4: Restart watch daemon** (watch only pulls from current env's branch):
```bash
pkill -f 'wangchuan.*watch' 2>/dev/null; nohup wangchuan watch >/dev/null 2>&1 &
```
Watch mode **only pulls** cloud changes — it does NOT push local changes. Users must run `wangchuan sync` manually to push. If watch encounters a conflict it cannot auto-merge, it records it to `~/.wangchuan/pending-conflicts.json` — the next `wangchuan sync` will display these conflicts for user resolution.

**Step 5: If user asked "pull memory from env X" without switching:**
Explain that cross-env pull is not supported — must switch first:
```bash
wangchuan env switch <target-env>   # switch → auto-pulls target env's data
# After done, switch back:
wangchuan env switch <original-env>
```

## Saving a snapshot

When user says "保存快照" / "save snapshot":

```bash
wangchuan snapshot save [name]
```

If no name provided, auto-generates a timestamp-based name. Report saved snapshot name.

## Listing snapshots

```bash
wangchuan snapshot list
```

Shows all saved snapshots with timestamps and sizes.

## Deleting a snapshot

When user says "删除快照" / "delete snapshot":

```bash
wangchuan snapshot list          # show available
wangchuan snapshot delete <name> # delete selected
```

Confirm with user before deleting.

## Rolling back (snapshots and git history)

When user says "回退记忆" / "rollback" / "restore a previous version":

**Step 1: Identify target.** Ask user's intent:
- **Undo last sync** → find auto-snapshot
- **Specific time** → `wangchuan snapshot list`
- **Recover deleted file** → `cd ~/.wangchuan/repo && git log --oneline --name-status -20`
- **Revert specific change** → `git log` + `git show <hash> --stat`

**Step 2: Find version.**

Option A — Snapshot:
```bash
wangchuan snapshot list
```

Option B — Git history:
```bash
cd ~/.wangchuan/repo && git log --oneline --name-status -20
cd ~/.wangchuan/repo && git show <hash> --stat
cd ~/.wangchuan/repo && git show <hash>:<file-path>
```

**Step 3: Execute.**

Snapshot restore (restores locally, ask user to sync):
```bash
wangchuan snapshot restore <name>
```
Tell user: "Snapshot restored locally. Run `wangchuan sync` to push to cloud." If user confirms: `wangchuan sync -y`

Single file from git (needs sync after):
```bash
cd ~/.wangchuan/repo && git checkout <hash> -- <file-path>
```
Tell user: "File restored locally. Run `wangchuan sync` to push to cloud." If user confirms: `wangchuan sync -y`

Undo last sync:
```bash
wangchuan snapshot list  # find pre-sync auto-snapshot (second most recent)
wangchuan snapshot restore <pre-sync-snapshot>
```
