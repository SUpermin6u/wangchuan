# MCP Config Sync

## MCP Config Path Reference

| Agent | MCP Config File | JSON Key |
|-------|----------------|----------|
| claude | `~/.claude-internal/.claude.json` | `mcpServers` (nested in top-level object, merge-only) |
| cursor | `~/.cursor/mcp.json` | `mcpServers` (top-level key, can overwrite file) |
| openclaw | `~/.openclaw/workspace/config/mcporter.json` | `mcpServers` (top-level key, can overwrite file) |

Repo path:
- `~/.wangchuan/repo/shared/mcp/mcpServers.json.enc` (encrypted)

**Important:** MCP configs contain sensitive tokens (OAUTH-TOKEN, Bearer tokens). Always encrypt before storing in repo.

---

## Push MCP

### Triggers
- Push mcp
- Sync mcp to cloud
- Push mcp config

### Flow

1. Read current agent's MCP config and extract `mcpServers` field:
   ```bash
   # Determine current agent (the one executing this skill)
   # Read its MCP config file per the path reference above
   ```

2. Normalize the JSON (ensure all entries have explicit `type` field):
   ```bash
   python3 -c "
   import json, sys
   with open('<MCP_CONFIG_PATH>', 'r') as f:
       data = json.load(f)
   servers = data.get('mcpServers', data)  # handle both nested and top-level
   # Normalize: add type field if missing
   for name, cfg in servers.items():
       if 'type' not in cfg:
           if 'command' in cfg:
               cfg['type'] = 'stdio'
           elif 'url' in cfg:
               cfg['type'] = 'http'
   with open('/tmp/wc_mcp_normalized.json', 'w') as f:
       json.dump({'mcpServers': servers}, f, indent=2, ensure_ascii=False)
   "
   ```

3. Pull latest from repo:
   ```bash
   cd ~/.wangchuan/repo
   git pull --rebase origin main 2>/dev/null || true
   ```

4. Compare with existing cloud config (if any):
   ```bash
   if [ -f ~/.wangchuan/repo/shared/mcp/mcpServers.json.enc ]; then
     ~/.wangchuan/scripts/decrypt.sh ~/.wangchuan/master.key \
       ~/.wangchuan/repo/shared/mcp/mcpServers.json.enc \
       /tmp/wc_mcp_cloud.json
     # Compare
     diff /tmp/wc_mcp_normalized.json /tmp/wc_mcp_cloud.json >/dev/null 2>&1
     # If identical, skip push
   fi
   ```

   If identical → report "MCP config already in sync" and stop.

5. Encrypt and write to repo:
   ```bash
   mkdir -p ~/.wangchuan/repo/shared/mcp
   ~/.wangchuan/scripts/encrypt.sh ~/.wangchuan/master.key \
     /tmp/wc_mcp_normalized.json \
     ~/.wangchuan/repo/shared/mcp/mcpServers.json.enc
   ```

6. Push to cloud:
   ```bash
   cd ~/.wangchuan/repo
   git add -A
   git commit -m "Update MCP config from $(hostname)"
   git push origin main
   ```

7. Ask user: "Sync to other local agents now?"
   - If yes → for each detected agent, write the normalized mcpServers to their local config file (see **Write MCP to Agent** below)
   - If no → done

8. Cleanup:
   ```bash
   rm -f /tmp/wc_mcp_normalized.json /tmp/wc_mcp_cloud.json
   ```

---

## Pull MCP

### Triggers
- Pull mcp
- Pull mcp config
- Sync mcp from cloud

### Flow

1. Pull latest:
   ```bash
   cd ~/.wangchuan/repo
   git pull --rebase origin main
   ```

2. Check if encrypted MCP config exists:
   ```bash
   test -f ~/.wangchuan/repo/shared/mcp/mcpServers.json.enc || echo "NO_MCP"
   ```
   If not found → report "No MCP config in cloud" and stop.

3. Decrypt:
   ```bash
   ~/.wangchuan/scripts/decrypt.sh ~/.wangchuan/master.key \
     ~/.wangchuan/repo/shared/mcp/mcpServers.json.enc \
     /tmp/wc_mcp_cloud.json
   ```

4. For each detected agent, read its current local MCP config and compare:
   ```bash
   python3 -c "
   import json
   with open('/tmp/wc_mcp_cloud.json', 'r') as f:
       cloud = json.load(f).get('mcpServers', {})
   with open('<AGENT_MCP_PATH>', 'r') as f:
       local_data = json.load(f)
   local = local_data.get('mcpServers', {})

   # Servers in cloud but not local
   added = set(cloud.keys()) - set(local.keys())
   # Servers in local but not cloud
   extra = set(local.keys()) - set(cloud.keys())
   # Servers in both — check if config differs
   changed = []
   for k in set(cloud.keys()) & set(local.keys()):
       if cloud[k] != local[k]:
           changed.append(k)

   print(f'Added from cloud: {list(added)}')
   print(f'Local-only (not in cloud): {list(extra)}')
   print(f'Changed in cloud: {changed}')
   "
   ```

5. Handle differences:
   - **Cloud has servers not in local** → add them to local automatically
   - **Local has servers not in cloud** → ask user:
     ```
     Local-only MCP servers not in cloud: [list]
     Choose: [Keep local-only] [Remove them] [Push to cloud]
     ```
   - **Both have same server but config differs** → show diff, ask user:
     ```
     Server "<name>" differs between cloud and local:
     Cloud: <url/command>
     Local: <url/command>
     Choose: [Use cloud] [Keep local]
     ```

6. Write merged config to each detected agent (see **Write MCP to Agent** below).

7. Cleanup:
   ```bash
   rm -f /tmp/wc_mcp_cloud.json
   ```

8. Report summary.

---

## View MCP

### Triggers
- View mcp
- Show mcp
- Compare mcp
- MCP status

### Flow

1. Read MCP config from all detected agents locally.

2. Decrypt cloud config (if exists).

3. Output comparison table:
   ```
   Server          Claude  Cursor  OpenClaw  Cloud   Status
   ─────────────────────────────────────────────────────────
   gongfeng        ✓       ✓       ✓         ✓       In sync
   playwright      ✓       ✓       ✗         ✓       Missing: openclaw
   new-server      ✗       ✗       ✗         ✓       Not deployed locally
   ```

4. Suggest actions if inconsistencies found:
   - "Run 'pull mcp' to sync cloud config to all agents"
   - "Run 'push mcp' to upload current config to cloud"

---

## Write MCP to Agent (internal helper, not user-facing)

Writing mcpServers to each agent's config file requires different strategies:

### Claude (`~/.claude-internal/.claude.json`)

**MERGE only** — this file contains other keys (`installMethod`, `userID`, etc.):
```bash
python3 -c "
import json
with open('$HOME/.claude-internal/.claude.json', 'r') as f:
    data = json.load(f)
with open('/tmp/wc_mcp_normalized.json', 'r') as f:
    mcp = json.load(f)
data['mcpServers'] = mcp['mcpServers']
with open('$HOME/.claude-internal/.claude.json', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
"
```

### Cursor (`~/.cursor/mcp.json`)

**Overwrite** — file only contains `mcpServers`:
```bash
cp /tmp/wc_mcp_normalized.json ~/.cursor/mcp.json
```

### OpenClaw (`~/.openclaw/workspace/config/mcporter.json`)

**Overwrite** — file only contains `mcpServers`:
```bash
mkdir -p ~/.openclaw/workspace/config
cp /tmp/wc_mcp_normalized.json ~/.openclaw/workspace/config/mcporter.json
```
