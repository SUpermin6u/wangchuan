# Inspecting Resources and Status

## Inspecting a skill

Report three things:
```bash
# 1. Which agents have it:
for entry in $(jq -r '.profiles.default | to_entries[] | select(.value.enabled) | "\(.key)=\(.value.workspacePath)"' ~/.wangchuan/config.json); do
  agent="${entry%%=*}"; wspath="${entry#*=}"
  expanded=$(echo "$wspath" | sed "s|^~|$HOME|")
  [ -d "${expanded}/skills/xxx" ] && echo "  ✓ $agent" || echo "  ✗ $agent"
done
# 2. Shared or local:
cat ~/.wangchuan/shared-registry.json 2>/dev/null | grep -q '"name":"xxx".*"kind":"skill"' && echo "SHARED" || echo "LOCAL"
# 3. Cloud sync:
[ -d ~/.wangchuan/repo/shared/skills/xxx ] && echo "Synced to cloud" || echo "Not in cloud"
```

## Inspecting a custom agent

Same pattern, but only Claude, Cursor, CodeBuddy, WorkBuddy support custom agents.
```bash
for a in claude cursor codebuddy workbuddy; do
  wspath=$(jq -r ".profiles.default.${a}.workspacePath" ~/.wangchuan/config.json)
  expanded=$(echo "$wspath" | sed "s|^~|$HOME|")
  [ -d "${expanded}/agents/xxx" ] && echo "  ✓ $a" || echo "  ✗ $a"
done
cat ~/.wangchuan/shared-registry.json 2>/dev/null | grep -q '"name":"xxx".*"kind":"agent"' && echo "SHARED" || echo "LOCAL"
[ -d ~/.wangchuan/repo/shared/agents/xxx ] && echo "Synced to cloud" || echo "Not in cloud"
```

## Inspecting MCP servers

MCP configs are JSON fields. Agents with MCP: Claude, OpenClaw, CodeBuddy, WorkBuddy, Cursor.
```bash
# List servers per agent:
jq -r '.mcpServers // {} | keys[]' ~/.claude/.claude.json 2>/dev/null | sed 's/^/  claude: /'
jq -r '.mcpServers // {} | keys[]' ~/.codebuddy/mcp.json 2>/dev/null | sed 's/^/  codebuddy: /'
# (repeat for workbuddy, cursor with mcp.json; openclaw with config/mcporter.json)
```
MCP has **no shared registry** — it uses a single merged file in the cloud (`shared/mcp/mcpServers.json.enc`). On each sync, all agents' MCP servers are merged into one superset and distributed to all agents locally. Report which agents have a given server, compare config values.

## Inspecting memory

```bash
# 1. List all agents' memory files:
wangchuan memory list
# 2. Show specific agent's memory:
wangchuan memory show <agent>
# 3. Shared memory status:
expanded=$(echo "~/.openclaw/workspace/memory/SHARED.md" | sed "s|^~|$HOME|")
[ -f "$expanded" ] && echo "✓ Shared memory exists" || echo "✗ No shared memory"
[ -f ~/.wangchuan/repo/shared/memory/SHARED.md.enc ] && echo "✓ Synced to cloud" || echo "✗ Not in cloud"
# 4. Per-agent cloud sync:
for a in openclaw codebuddy workbuddy codex; do
  [ -f ~/.wangchuan/repo/agents/${a}/MEMORY.md.enc ] && echo "  ✓ $a synced" || echo "  ✗ $a not synced"
done
[ -f ~/.wangchuan/repo/agents/claude/CLAUDE.md ] && echo "  ✓ claude synced" || echo "  ✗ claude not synced"
```

## Status diagnostic (wangchuan status)

### Compact view: `wangchuan status`
- Health score (0–100), 4 dimensions: freshness / coverage / integrity / encryption
- Current environment and branch
- Changed files count (+added, ~modified, -missing)
- Last sync timestamp, pending actions

### Verbose view: `wangchuan status -v`
All of compact, plus:
- 4 health sub-scores with explanations
- File inventory per-agent (local ✔/✖, repo ✔/·, [enc], [field])
- Line-level diff per modified file
- Active machines (from git commit `[hostname]`)
- Recent 3 git commits
- Sync history (last 5 events)
- Conflict detection (local+remote both changed)
- Sync lock warnings

### Interpreting health issues

| Symptom | Meaning | Fix |
|---------|---------|-----|
| Freshness low | Haven't synced recently | `wangchuan sync -y` |
| Coverage low | Local files missing | `wangchuan sync -y` (pull restores) |
| Integrity low | Checksums mismatch | `wangchuan doctor` |
| Encryption low | Sensitive files unencrypted | Review config profiles |
| Conflict warning | Local+remote both changed | `wangchuan sync -y` → resolve markers |
| Stale sync lock | Previous sync crashed | `wangchuan doctor` |
| Pending distributions | Unprocessed sharing | `wangchuan sync -y` |
