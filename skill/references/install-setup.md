# Installation, Initialization, and Key Management

## Prerequisites

1. Node.js >= 18
2. Git installed and configured (SSH key or HTTPS credentials)
3. A **private** Git repo on any hosting platform

## Install CLI

```bash
npm install -g wangchuan
```

## Initialization (when `~/.wangchuan/config.json` does not exist)

**IMPORTANT: Interactive mode does NOT work in agent shell (non-TTY). Always pass flags explicitly.**

Ask user: brand new setup or restoring existing repo?

### Scenario A — Brand new setup

1. Guide user to create a **private** repo (or auto-create via `gh repo create wangchuan-sync --private`)
2. Run: `wangchuan init --repo <url>`
3. Auto: generates key → clones → detects agents → extracts shared resources → first sync
4. **Remind user to back up key**: `wangchuan doctor --key-export`

### Scenario B — Restore / new machine (may already have local agent data)

This is a multi-step flow with a **mandatory backup checkpoint**. If the user doesn't confirm backup, **stop and do not proceed** — next time the skill is triggered, start from Step 1 again.

**Step 1: Collect credentials.**
Ask for **repo SSH URL** and **master key** (`wangchuan_<hex>`).

**Step 2: Init (clone only, no sync yet).**
```bash
wangchuan init --repo <url> --key <key>
```
Init clones the repo and auto-runs a first sync. But BEFORE that happens, the agent must handle Steps 3-5 manually. Since init auto-syncs, the agent should instead do a **manual init sequence** to control the flow:

Actually, `wangchuan init` auto-syncs at the end and there's no flag to skip it. So the agent must do the backup warning BEFORE running init:

**Step 3: Check if local agent data exists and warn about shared resource overwrites.**
```bash
# Check if any agent workspace has data
for agent_dir in ~/.claude ~/.cursor ~/.openclaw/workspace ~/.codebuddy ~/.workbuddy ~/.codex ~/.gemini; do
  [ -d "$agent_dir" ] && echo "  ⚠️ Local data found: $agent_dir"
done
```
If local data exists, **inform the user**:
- "⚠️ **Shared skills and custom agents in the cloud will OVERWRITE your local versions** (no merge — direct copy)."
- "Your MCP servers will be safely merged (additive)."
- "Your memory files (CLAUDE.md, MEMORY.md) will be preserved (local wins on conflict)."
- "Your local-only files (skills, configs not in cloud) will be auto-pushed to cloud — please review after init."

**Ask user: "Have you backed up your important local skills/agents? Confirm to proceed, or cancel to back up first."**

If user says **cancel/not yet** → **STOP**. Do NOT run init. Tell user:
```
Please back up your local data first:
  cp -r ~/.claude/skills/ ~/backup-claude-skills/
  cp -r ~/.claude/agents/ ~/backup-claude-agents/
  # (repeat for other agents as needed)
Then say "初始化忘川" again to resume.
```

If user says **confirmed** → proceed to Step 4.

**Step 4: Check cloud environments and let user choose.**
After init, check if cloud repo has multiple environments:
```bash
# Init first (this will clone + auto-sync to default branch)
wangchuan init --repo <url> --key <key>
# Then check for environments
wangchuan env list
```
If multiple environments exist (e.g. `default`, `work`, `personal`):
- List all environments to the user
- Ask: "Which environment do you want to sync with this machine?"
- If user picks non-default → `wangchuan env switch <chosen>` (auto-pulls that env's data)

If only `default` exists → no need to ask, already synced.

**Step 5: Post-init review.**
```bash
wangchuan status -v
```
Report what was synced: pulled files, pushed files, any conflicts detected. If shared skills were overwritten, inform user which ones.

**Complete flow summary:**
```
Ask credentials → Check local data exists?
  → Yes: warn overwrites → ask backup confirmed?
    → No: STOP (resume next time)
    → Yes: init → check envs → user picks env → status -v → ensure watch
  → No: init → check envs → user picks env → ensure watch
```

## Key management

```bash
# Export key (on source machine):
wangchuan doctor --key-export    # prints wangchuan_<hex>
# Import key (on target machine):
wangchuan init --repo <url> --key wangchuan_<hex>
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
