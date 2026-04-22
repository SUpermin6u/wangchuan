# Pushing, Pulling, and Conflict Resolution

## How sync works

`wangchuan sync` is **bidirectional**: pull first, then push. `wangchuan watch` is **pull-only** — it periodically pulls cloud changes but never pushes. Users must run `wangchuan sync` manually to push local changes.

**IMPORTANT: Pushing to cloud NEVER happens automatically.** The agent should only suggest `wangchuan sync -y` when the user explicitly asks to sync/push. After CRUD operations, inform the user that changes are saved locally and ask if they want to sync.

Flow of `sync`: **auto-snapshot** → fetch remote → if remote ahead → git pull → three-way merge → then stage + push local changes.
Flow of `watch`: fetch remote → if remote ahead → git pull → restore to local → record unresolved conflicts.

**Note**: sync automatically creates a safety snapshot of the repo before every sync. This means you can always roll back to the pre-sync state via `wangchuan snapshot list` + `wangchuan snapshot restore`.

**Environment**: all sync/push/pull operations target the **current environment's branch only** (`cfg.environment`). After sync completes, always report the current environment name to the user (e.g. "Synced to cloud (environment: work)").

## Pushing memory to cloud

1. **Preview** (optional): `wangchuan status -v`
2. **Sync**: `wangchuan sync -y`
3. **Conflict resolution** (auto for `.md` files):
   - Non-overlapping edits → auto-merged ✅
   - Overlapping identical edits → deduplicated ✅
   - Overlapping conflicting edits → conflict markers written:
     ```
     <<<<<<< LOCAL
     (your local changes)
     =======
     (cloud changes)
     >>>>>>> REMOTE
     ```
4. **If conflict markers written** → read file, show conflicts to user, ask how to resolve, edit to remove markers, `wangchuan sync -y` again.
5. **If no conflicts** → done.

```bash
# Full push flow:
wangchuan sync -y
# Check for conflict markers:
grep -l '<<<<<<< LOCAL' ~/.claude/CLAUDE.md ~/.openclaw/workspace/MEMORY.md ~/.codebuddy/MEMORY.md ~/.workbuddy/MEMORY.md ~/.codex/MEMORY.md 2>/dev/null
```

## Pulling memory from cloud

Same command: `wangchuan sync -y`. Use `wangchuan sync -n` for dry-run preview first.

Conflict resolution is identical to pushing. Encrypted files are decrypted transparently during pull.

**Pulling from a specific environment**: push/pull always targets the **current** environment's branch. To pull from a different env:
```bash
wangchuan env switch <target-env>   # switches branch + auto-syncs (pulls target env's data)
# When done, switch back:
wangchuan env switch <original-env>
```
There is no `--from-env` flag — must switch first.

## Syncing resources between agents

When user says "sync A's config to B", intent may be ambiguous.

**Step 1: Clarify** — ask which resources: Memory / Skills / MCP servers / Custom agents / All.

**Step 2: Execute per type:**
- **Memory**: `wangchuan memory copy <source> <target>`
- **Skills**: `cp -r "${SRC_WS}/skills/"* "${DST_WS}/skills/"`
- **MCP**: read mcpServers from source, jq merge into target
- **Custom agents**: `cp -r "${SRC_WS}/agents/"* "${DST_WS}/agents/"`

After completing the local operations, tell user: "Changes saved locally. Run `wangchuan sync` to push to cloud." If user confirms: `wangchuan sync -y`

Get workspace paths:
```bash
SRC=$(jq -r '.profiles.default.<source>.workspacePath' ~/.wangchuan/config.json | sed "s|^~|$HOME|")
DST=$(jq -r '.profiles.default.<target>.workspacePath' ~/.wangchuan/config.json | sed "s|^~|$HOME|")
```

## Files deleted from cloud

When another machine deletes files from the cloud repo, the next pull (via `wangchuan sync` or watch daemon) automatically deletes them from the local workspace too. No confirmation needed — cloud is the single source of truth.

All changes are preserved in git history. To recover accidentally deleted files:
```bash
cd ~/.wangchuan/repo && git log --name-status -10   # find the deletion commit
git checkout <hash>~1 -- <file-path>                 # restore the file
wangchuan sync -y                                     # push it back
```
