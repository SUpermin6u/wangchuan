---
name: wangchuan
version: 1.5.0
description: >-
  Encrypt and sync AI agent configs, memories, skills, and MCP servers across environments via a private Git repo.
  Supports Claude, OpenClaw, Gemini, CodeBuddy, WorkBuddy, Cursor, and Codex.
  TRIGGER when: user mentions syncing AI memories/configs, wangchuan/忘川, cross-machine agent setup, backup/restore agent settings, memory sync, skill distribution, MCP server sync, agent migration, master key export, sync status, watch daemon, environment management, snapshot, pushing/pulling memories, conflict resolution, syncing between agents, rolling back/restoring versions, switching environments, health check, customizing agent paths, or any commands: init, sync, status, watch, doctor, memory, env, snapshot, lang.
  Triggers: 忘川、wangchuan、同步记忆、同步配置、同步技能、同步MCP、初始化忘川、备份记忆、恢复记忆、迁移agent、导出密钥、轮换密钥、同步状态、健康检查、多环境、快照、跨机器同步、agent记忆、配置路径、查看技能、删除技能、新增技能、修改技能、自定义agent、MCP服务器、新增MCP、删除MCP、修改MCP、查看MCP、写记忆、删除记忆、修改记忆、查看记忆、广播记忆、复制记忆、推送记忆、拉取记忆、同步到agent、冲突、合并记忆、回退记忆、回滚、恢复版本、切换环境、忘川状态、新建环境、删除环境、查看环境、切换语言、升级忘川、更新忘川、sync memories、push memory、pull memory、rollback、switch environment、custom agent、MCP server、health status、rotate key、switch language、upgrade wangchuan、update wangchuan.
  DO NOT TRIGGER when: general git operations, unrelated CLI tools, or AI model APIs.
---

# wangchuan — AI Agent Memory Sync Skill

## Quick Start

```bash
command -v wangchuan || npm install -g wangchuan
```
If `~/.wangchuan/config.json` does not exist → Read [references/install-setup.md](references/install-setup.md) for initialization guide.

## Command Reference

```
wangchuan init     [--repo <url>] [--key <path>]           One-time setup
wangchuan sync     [-a <agent>] [-n] [-o <pat>] [-x <pat>] Smart bidirectional sync
wangchuan status   [-v]                                     Health + diff summary
wangchuan watch    [-i <min>]                               Pull-only background daemon
wangchuan doctor   [--key-export|--key-rotate|--setup]      Diagnose + auto-fix
wangchuan memory   list|show|copy|broadcast [-a <agent>]    Memory management
wangchuan env      list|create|switch|current|delete        Multi-environment
wangchuan snapshot save|list|restore|delete [name]          Snapshots
wangchuan lang     [zh|en]                                  Display language
```
Aliases: `sync`→`s`, `status`→`st`, `snapshot`→`snap`. All support `--agent` / `-a` filter.

## Task Routing — Load the right reference BEFORE acting

| User intent | Read this reference first |
|-------------|--------------------------|
| Create/modify/delete skills, custom agents, MCP, or memory | [references/resource-crud.md](references/resource-crud.md) |
| Push/pull memories, resolve conflicts, sync between agents | [references/sync-conflict.md](references/sync-conflict.md) |
| Switch/create/list/delete environments, rollback, snapshots | [references/environment.md](references/environment.md) |
| Inspect/check skills, agents, MCP, memory, or health status | [references/inspect-status.md](references/inspect-status.md) |
| Initialize wangchuan, install, migrate key, new machine setup | [references/install-setup.md](references/install-setup.md) |
| Upgrade/update wangchuan CLI and sync new profiles | [references/install-setup.md](references/install-setup.md) |

**IMPORTANT**: Before executing any task below, **Read the corresponding reference file** for detailed instructions, bash commands, and decision flows. The reference files contain the complete procedures.

## Non-TTY Constraints (Agent shell)

| Command | Constraint | Required |
|---------|-----------|----------|
| `wangchuan init` | Interactive prompt fails | Must pass `--repo <url>` |
| `wangchuan sync` | Pending confirmations skipped | Must pass `-y` |
| `wangchuan env create` | Memory import prompt fails | Auto-forks (OK) |

## Customizing Agent Workspace Paths

Default paths are in `~/.wangchuan/config.json`. To change (e.g. Claude to `~/.claude-internal`):
```bash
jq '.profiles.default.claude.workspacePath = "~/.claude-internal"' ~/.wangchuan/config.json > /tmp/wc-cfg.json && mv /tmp/wc-cfg.json ~/.wangchuan/config.json
wangchuan sync -y
```

## Sync Protocol — Rules agents MUST follow

### On session start
```bash
wangchuan status
wangchuan sync -y   # process pending actions
```

### After EVERY skill invocation (mandatory)
After completing any user instruction, check if the watch daemon is running and start it if not:
```bash
# Check if watch is running, start if not (pull-only daemon)
pgrep -f 'wangchuan.*watch' >/dev/null 2>&1 || nohup wangchuan watch >/dev/null 2>&1 &
```
This ensures cloud memories are always pulled in the background. Watch is pull-only — it never pushes.

### Rule summary

| Event | Action |
|-------|--------|
| Created/modified a **shared** skill or custom agent | Copy to all other agents → `wangchuan sync -y` |
| Created/modified a **new/local** skill or custom agent | Ask user which agents → copy → `wangchuan sync -y` |
| **Deleted** a skill or custom agent | **Always ask** → inform shared status → remove selected → `wangchuan sync -y` |
| Created/modified an **MCP server** | Ask user which agents → jq write → `wangchuan sync -y` |
| **Deleted** an MCP server | Ask user which agents → jq del → `wangchuan sync -y` |
| Created/modified **memory** | Ask user → broadcast/copy if yes → `wangchuan sync -y` |
| **Deleted** memory | Ask user which agents → rm → `wangchuan sync -y` |
| Updated other config | `wangchuan sync -y` |
| **Any skill invocation completes** | **Ensure watch daemon is running** (see above) |

### Environment awareness

All push/pull/watch operations target the **current environment's branch only**. Key rules:
- **Push/pull**: always bound to `cfg.environment` → the current env's git branch
- **Watch**: pulls from current env only. After `env switch`, restart watch
- **Cross-env access**: NOT supported — must `env switch` first, then sync
- **Workspace leakage**: switching env does NOT delete local files from the previous env. After switch, stale files from old env may remain in `~/.claude/skills/` etc. Do NOT push these to the new env — run `wangchuan status -v` to check `localOnly` files first
- **Pull from another env**: if user asks "pull work env's memory", must switch first: `wangchuan env switch work` → auto-syncs

### --agent filter values

| Agent | Key synced files |
|-------|-----------------|
| `openclaw` | MEMORY.md (enc), AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md (enc), HEARTBEAT.md, BOOTSTRAP.md, memory/ (enc), skills/, openclaw.json→agents+skills+ui (enc) |
| `claude` | CLAUDE.md, settings.json (enc), plugins/installed_plugins.json, plugins/known_marketplaces.json, plugins/blocklist.json, commands/, skills/, agents/, .claude.json→mcpServers (enc) |
| `gemini` | skills/, settings.internal.json→security+model+general+ide (enc) |
| `codebuddy` | MEMORY.md (enc), CODEBUDDY.md, plugins/known_marketplaces.json, plugins/installed_plugins.json, skills/, mcp.json→mcpServers (enc), settings.json→enabledPlugins+hooks (enc) |
| `workbuddy` | MEMORY.md (enc), IDENTITY.md, SOUL.md, USER.md (enc), BOOTSTRAP.md, extensions/extensions.json, plugins/known_marketplaces.json, skills/, mcp.json→mcpServers (enc), settings.json→enabledPlugins+hooks (enc) |
| `cursor` | extensions/extensions.json, hooks.json, rules/, skills/, agents/, mcp.json→mcpServers (enc), cli-config.json→permissions+model+enabledPlugins+editor+approvalMode+sandbox+attribution+network+modelParameters (enc) |
| `codex` | MEMORY.md (enc), instructions.md, AGENTS.md, config.toml (enc), skills/, memories/ (enc), agents/ |
