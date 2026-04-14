# Resource CRUD — Skills, Custom Agents, MCP, Memory

## Resource types and their mechanisms

| Resource | Local path | Sharing model | Registry | Applicable agents |
|----------|-----------|---------------|----------|-------------------|
| **Skills** | `<workspace>/skills/<name>/` | Directory copy, shared-registry | `kind:'skill'` | OpenClaw, Claude, CodeBuddy, WorkBuddy, Gemini (5) |
| **Custom agents** | `<workspace>/agents/<name>/` | Directory copy, shared-registry | `kind:'agent'` | Claude, Cursor, CodeBuddy, WorkBuddy (4) |
| **MCP servers** | JSON field `mcpServers` in config file | JSON key merge, single shared file in cloud | None (auto) | Claude (`.claude.json`), OpenClaw (`config/mcporter.json`), CodeBuddy/WorkBuddy/Cursor (`mcp.json`) (5) |
| **Memory** | `<workspace>/MEMORY.md` etc. | Per-agent file, manual copy/broadcast | None | OpenClaw/CodeBuddy/WorkBuddy/Codex (`MEMORY.md`); Claude (`CLAUDE.md`); shared (`SHARED.md`) |

---

## Creating or modifying skills or custom agents

Skills and custom agents use the **same** flow — both are directories tracked by `shared-registry.json`.

**`shared-registry.json` schema** (at `~/.wangchuan/shared-registry.json`):
```json
{
  "entries": [
    { "name": "wangchuan", "kind": "skill", "sourceAgent": "claude", "sharedAt": "2026-04-14T10:00:00Z" },
    { "name": "my-reviewer", "kind": "agent", "sourceAgent": "claude", "sharedAt": "2026-04-14T11:00:00Z" }
  ]
}
```
- `kind`: `"skill"` or `"agent"` — determines which resource type
- `name`: directory name (e.g. skill dir name or custom agent dir name)
- `sourceAgent`: which agent first shared it
- A resource is **shared** only if it has an entry here. Absent = local-only.

**Step 1: Determine if the resource is already shared.**
- **Newly created** → NOT shared (skip to Step 2b).
- **Existing** → check `~/.wangchuan/shared-registry.json` for the name with `kind:'skill'` or `kind:'agent'`.

**Step 2a: Already-shared** — distribute + sync automatically:
```bash
# Example: shared skill "foo" modified in claude, also used by cursor and codebuddy
cp -r ~/.claude/skills/foo/ ~/.cursor/skills/foo/
cp -r ~/.claude/skills/foo/ ~/.codebuddy/skills/foo/
# Example: shared custom agent "my-reviewer" modified in claude
cp -r ~/.claude/agents/my-reviewer/ ~/.cursor/agents/my-reviewer/
cp -r ~/.claude/agents/my-reviewer/ ~/.codebuddy/agents/my-reviewer/
wangchuan sync -y
```

**Step 2b: New / agent-local** — ask the user before distributing:
```bash
# List enabled agents for skills:
jq -r '.profiles.default | to_entries[] | select(.value.enabled) | "\(.key) → \(.value.workspacePath)/skills/"' ~/.wangchuan/config.json
# List enabled agents for custom agents (only 4 support them):
for a in claude cursor codebuddy workbuddy; do
  jq -r --arg a "$a" '.profiles.default[$a] | select(.enabled) | "\($a) → \(.workspacePath)/agents/"' ~/.wangchuan/config.json
done
```
Present options:
- **All agents** — copy to every applicable agent's dir → `wangchuan sync -y` (registers as shared)
- **Specific agents** — copy only to selected → `wangchuan sync -y`
- **No distribution** — keep local only → `wangchuan sync -y`

---

## Deleting skills or custom agents

Deletion is destructive — **always ask the user** regardless of shared status.

**Step 1: Determine shared status and inform the user.**
```bash
# For skills:
cat ~/.wangchuan/shared-registry.json 2>/dev/null | grep -q '"name":"xxx".*"kind":"skill"' && echo "SHARED SKILL" || echo "LOCAL SKILL"
# For custom agents:
cat ~/.wangchuan/shared-registry.json 2>/dev/null | grep -q '"name":"xxx".*"kind":"agent"' && echo "SHARED AGENT" || echo "LOCAL AGENT"
```

**Step 2: List agents that have it and ask which to remove from.**
```bash
# For skills:
for entry in $(jq -r '.profiles.default | to_entries[] | select(.value.enabled) | "\(.key)=\(.value.workspacePath)"' ~/.wangchuan/config.json); do
  agent="${entry%%=*}"; expanded=$(echo "${entry#*=}" | sed "s|^~|$HOME|")
  [ -d "${expanded}/skills/xxx" ] && echo "  ✓ $agent"
done
# For custom agents (only 4 agents support them):
for a in claude cursor codebuddy workbuddy; do
  wspath=$(jq -r ".profiles.default.${a}.workspacePath" ~/.wangchuan/config.json)
  expanded=$(echo "$wspath" | sed "s|^~|$HOME|")
  [ -d "${expanded}/agents/xxx" ] && echo "  ✓ $a"
done
```
Options: **All agents** / **[individual agents]** / **Cancel**

**Step 3: Execute.**

**All agents**: `rm -rf` from every agent → unregister from shared-registry.json → `wangchuan sync -y`.
```bash
rm -rf ~/.claude/skills/xxx/ ~/.cursor/skills/xxx/ ~/.codebuddy/skills/xxx/  # etc.
jq '.entries |= map(select(.name != "xxx" or .kind != "skill"))' ~/.wangchuan/shared-registry.json > /tmp/wc-sr.json && mv /tmp/wc-sr.json ~/.wangchuan/shared-registry.json
wangchuan sync -y
```

**Specific agents**: `rm -rf` from selected → unregister (demote) → `wangchuan sync -y`. Remaining agents keep local copies.

**Cancel**: no action.

---

## Creating, modifying, or deleting MCP servers

MCP servers are JSON fields (`mcpServers`). They have **no shared registry** — wangchuan auto-merges on sync. But agent should give user control.

**Creating or modifying:**
1. Edit the current agent's MCP config file:
   - Claude: `~/.claude/.claude.json` → `mcpServers`
   - CodeBuddy/WorkBuddy/Cursor: `~/<workspace>/mcp.json` → `mcpServers`
   - OpenClaw: `~/.openclaw/workspace/config/mcporter.json` → `mcpServers`
2. Ask user: "Sync this MCP server to other agents?"
   - **All**: write same entry to every MCP-enabled agent's config via jq
   - **Specific**: write to selected only
   - **No**: keep local
3. `wangchuan sync -y`

Example — add server to another agent:
```bash
SERVER_JSON=$(jq '.mcpServers["my-db"]' ~/.claude/.claude.json)
jq --argjson srv "$SERVER_JSON" '.mcpServers["my-db"] = $srv' ~/.codebuddy/mcp.json > /tmp/mcp.json && mv /tmp/mcp.json ~/.codebuddy/mcp.json
```

**Deleting:**
1. List which agents have it: `jq -e '.mcpServers["xxx"]' <file>` per agent
2. Ask user: All / Specific / Cancel
3. Remove via `jq 'del(.mcpServers["xxx"])'` from selected agents
4. `wangchuan sync -y`

**Note**: wangchuan's MCP auto-merge is **additive only** (never deletes keys). Agent-side `jq del()` is the only way to propagate removal.

---

## Creating, modifying, or deleting memory

Memory files are **per-agent** — no automatic cross-agent distribution.

**Creating or modifying:**
1. Write/update memory file (e.g. `~/.claude/CLAUDE.md`)
2. Ask user: "Sync to other agents?"
   - **All**: `wangchuan memory broadcast <agent>` → `wangchuan sync -y`
   - **Specific**: `wangchuan memory copy <source> <target>` → `wangchuan sync -y`
   - **No**: `wangchuan sync -y`

**Deleting:**
1. `wangchuan memory list` to see who has what
2. Ask user: All / Specific / Cancel
3. `rm -f` selected agents' memory files → `wangchuan sync -y`

**Note**: Memory filenames differ per agent — Claude uses `CLAUDE.md`, OpenClaw/CodeBuddy/WorkBuddy/Codex use `MEMORY.md`.
