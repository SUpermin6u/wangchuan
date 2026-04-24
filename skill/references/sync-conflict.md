# Pushing, Pulling, and Conflict Resolution

## How push and pull work

`wangchuan push` pushes local changes to cloud. `wangchuan pull` pulls cloud changes to local. Both are one-directional. Users run `pull` to get cloud data and `push` to upload local changes.

**IMPORTANT: Pushing to cloud NEVER happens automatically.** The agent should only suggest `wangchuan push -y` when the user explicitly asks to push. After CRUD operations, inform the user that changes are saved locally and ask if they want to push.

**IMPORTANT: Push sends each agent's files independently.** There is no cross-agent auto-distribution during push. Each agent's resources (skills, MCP servers, custom agents) are pushed to/from their own directory in the cloud repo. Sharing resources across agents is a separate, explicit user action.

Flow of `push`: **auto-snapshot** → fetch remote → if remote ahead → git pull → three-way merge → then stage + push local changes.
Flow of `pull`: fetch remote → if remote ahead → git pull → restore to local.

**Note**: push automatically creates a safety snapshot of the repo before every push. This means you can always roll back to the pre-push state via `wangchuan snapshot list` + `wangchuan snapshot restore`.

**Environment**: all push/pull operations target the **current environment's branch only** (`cfg.environment`). After push completes, always report the current environment name to the user (e.g. "Pushed to cloud (environment: work)").

## Pushing memory to cloud

1. **Preview** (optional): `wangchuan status -v`
2. **Push**: `wangchuan push -y`
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
4. **If conflict markers written** → read file, show conflicts to user, ask how to resolve, edit to remove markers, `wangchuan push -y` again.
5. **If no conflicts** → done.

```bash
# Full push flow:
wangchuan push -y
# Check for conflict markers:
grep -l '<<<<<<< LOCAL' ~/.claude/CLAUDE.md ~/.openclaw/workspace/MEMORY.md ~/.codebuddy/MEMORY.md ~/.workbuddy/MEMORY.md ~/.codex/MEMORY.md 2>/dev/null
```

## Pulling memory from cloud

```bash
wangchuan pull
```

Use `wangchuan push -n` for a dry-run preview of what would be pushed.

Conflict resolution is identical to pushing. Encrypted files are decrypted transparently during pull.

**Pulling from a specific environment**: push/pull always targets the **current** environment's branch. To pull from a different env:
```bash
wangchuan env switch <target-env>   # switches branch + auto-pulls target env's data
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

After completing the local operations, tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." If user confirms: `wangchuan push -y`

Get workspace paths:
```bash
SRC=$(jq -r '.profiles.default.<source>.workspacePath' ~/.wangchuan/config.json | sed "s|^~|$HOME|")
DST=$(jq -r '.profiles.default.<target>.workspacePath' ~/.wangchuan/config.json | sed "s|^~|$HOME|")
```

## Files deleted from cloud

When another machine deletes files from the cloud repo, the next pull (via `wangchuan pull`) automatically deletes them from the local workspace too. No confirmation needed — cloud is the single source of truth.

All changes are preserved in git history. To recover accidentally deleted files:
```bash
cd ~/.wangchuan/repo && git log --name-status -10   # find the deletion commit
git checkout <hash>~1 -- <file-path>                 # restore the file
wangchuan push -y                                     # push it back
```
