# Installation, Initialization, and Key Management

## Prerequisites

1. Node.js >= 18
2. Git installed and configured (SSH key or HTTPS credentials)
3. A **private** Git repo on any hosting platform

## Install CLI

```bash
npm install -g wangchuan
```

## Upgrade

When user says "升级忘川" / "upgrade wangchuan":

**Step 1: Upgrade CLI.**
```bash
npm update -g wangchuan
```

**Step 2: Verify new version.**
```bash
wangchuan --version
```

**Step 3: Pull cloud first, then sync local changes when ready.**

After upgrade, the new version may include new/changed agent sync profiles (new syncDirs, syncFiles, jsonFields). The built-in `reconcileProfiles` mechanism automatically detects these changes when `sync` runs — it compares the built-in agent definitions against `config.json`, adds any missing entries, and saves the updated config. No manual config editing needed.

Tell the user: "Upgrade complete. Run `wangchuan sync` to pull cloud data and push any newly-discovered local files." When the user confirms:

```bash
# Pull cloud data and push local changes
wangchuan sync -y
```

This single command:
1. Auto-runs `reconcileProfiles` → detects new sync entries → updates `config.json`
2. **Pulls latest from cloud first** (current env branch) — ensures no cloud data is lost
3. Then pushes any newly-synced local files to cloud

If the first sync shows "no changes" but you expect new files to be discovered, run sync again — the first run updates config.json, the second picks up newly-discovered files:
```bash
wangchuan sync -y   # second sync if needed
```

**Note**: Sync is NOT automatic after upgrade. The user must explicitly request it.

**Step 4: Report results.**
Tell the user:
- New version number
- Any new sync entries added (visible in sync output as newly-discovered files)
- Files synced (pulled/pushed)
- Current environment name

**Step 5: Ensure watch daemon running.**
```bash
pgrep -f 'wangchuan.*watch' >/dev/null 2>&1 || nohup wangchuan watch >/dev/null 2>&1 &
```

**Complete upgrade flow:**
```
npm update -g wangchuan → wangchuan --version → ask user to sync → wangchuan sync -y (if confirmed) → report → ensure watch
```

## Initialization (when `~/.wangchuan/config.json` does not exist)

**IMPORTANT: Interactive mode does NOT work in agent shell (non-TTY). Always pass flags explicitly.**

**Brand new setup:**

1. Guide user to create a **private** repo (or auto-create via `gh repo create wangchuan-sync --private`)
2. Run: `wangchuan init --repo <url>`
3. Auto: generates key → clones → detects agents → extracts shared resources → pulls cloud data
4. **Remind user to back up key**: `wangchuan doctor --key-export`
5. After init, tell user: "Initialization complete. Run `wangchuan sync` when ready to push local data to cloud."

## Restore (New Machine)

When user says "恢复云端记忆" / "restore cloud memories" / "new machine setup with existing repo":

**Step 1: Collect credentials.**
Ask for **repo URL** and **master key** (`wangchuan_<hex>`).

**Step 2: Check local data and warn.**
```bash
for agent_dir in ~/.claude ~/.cursor ~/.openclaw/workspace ~/.codebuddy ~/.workbuddy ~/.codex ~/.gemini; do
  [ -d "$agent_dir" ] && echo "  ⚠️ Local data found: $agent_dir"
done
```
If local data exists, warn:
- "Shared skills and custom agents from cloud will be downloaded to your local agents"
- "MCP servers will be merged (additive)"
- "Memory files from cloud will overwrite local versions"
- "Local-only files will be pushed to cloud as additions (nothing deleted from cloud)"

Ask backup confirmation. If declined → STOP.

**Step 3: Run restore.**
```bash
wangchuan restore --repo <url> --key <key>
```
This command:
1. Clones repo, imports key
2. Downloads cloud data → local (cloud is source of truth)
3. Checks for multiple environments → lets user choose
4. Pushes local additions to cloud (without deleting cloud data)

**Step 4: Check environments (non-TTY explicit).**
```bash
wangchuan env list
```
If multiple environments exist (e.g. `default`, `work`, `personal`):
- List all environments to the user
- Ask: "Which environment do you want to sync with this machine?"
- If user picks non-default → `wangchuan env switch <chosen>` (auto-pulls that env's data)

If only `default` exists → no need to ask, already synced.

**Step 5: Post-restore review.**
```bash
wangchuan status -v
```

**Step 6: Ensure watch daemon.**
```bash
pgrep -f 'wangchuan.*watch' >/dev/null 2>&1 || nohup wangchuan watch >/dev/null 2>&1 &
```

## Key management

```bash
# Export key (on source machine):
wangchuan doctor --key-export    # prints wangchuan_<hex>
# Import key (on target machine):
wangchuan restore --repo <url> --key wangchuan_<hex>
# Rotate key:
wangchuan doctor --key-rotate
# Generate setup one-liner for new machine:
wangchuan doctor --setup
```

**`master.key` is the ONLY thing that cannot be recovered.** Back it up securely.

## Key mismatch handling

If `Key mismatch!` appears during sync:
1. `wangchuan doctor --key-export` on the machine that last pushed
2. Copy key hex to current machine
3. `wangchuan init --key <hex>` or write to `~/.wangchuan/master.key`

## Installing the skill to agents

```bash
# Claude
cp -r wangchuan/ ~/.claude/skills/wangchuan/
# OpenClaw
cp -r wangchuan/ ~/.openclaw/workspace/skills/wangchuan/
# Codex
cp -r wangchuan/ ~/.codex/skills/wangchuan/
# Or let sync distribute automatically:
wangchuan sync
```

## Setting up Git repo

| Platform | How |
|----------|-----|
| GitHub | `wangchuan init` auto-creates via `gh` CLI |
| GitLab | gitlab.com → New project → Private |
| Gitee | gitee.com → New repo → Private |
| Bitbucket | bitbucket.org → Create repository → Private |
| Gitea | Your instance → New Repository → Private |
