# Wangchuan Skill Benchmark v1.5.1

Test cases for verifying an AI agent with the wangchuan skill loaded.

## Scoring

- **PASS**: Triggers skill → loads correct reference → executes correct commands → handles non-TTY → notes current env on sync → ensures watch running.
- **PARTIAL**: Triggers but misses a step (wrong flag, no watch, no env note).
- **FAIL**: Does not trigger, or command errors out.

## Global Rules (ALL TCs)

1. **Reference loading**: Read the `references/*.md` per routing table BEFORE acting.
2. **Watch daemon**: After EVERY skill invocation: `pgrep -f 'wangchuan.*watch' >/dev/null 2>&1 || nohup wangchuan watch >/dev/null 2>&1 &`
3. **Environment**: All sync/push/pull target **current env's branch only**. Note env name in reports. After `env switch`, restart watch. Stale files from old env must not be blindly pushed.
4. **Non-TTY**: `init` requires `--repo`, `sync` requires `-y`, `env create` auto-forks.

---

## Init / Setup (TC-01 ~ TC-02)

### TC-01: Initialize wangchuan
| Field | Value |
|-------|-------|
| **Instruction** | "请初始化忘川" (指令1) |
| **Ref** | `references/install-setup.md` |
| **Behavior** | 1. `command -v wangchuan \|\| npm install -g wangchuan`<br>2. Ask user: brand new setup or restore existing?<br>3a. **New**: ask repo URL → `wangchuan init --repo <url>` → auto: generate key, clone, detect agents, extract shared, first sync → remind backup key `wangchuan doctor --key-export`<br>3b. **Restore**: ask repo URL + key → **check local agent data exists** → if yes: **warn "shared skills/agents will be overwritten by cloud, MCP merged, memory preserved, local-only pushed"** → **ask user to confirm backup** → user declines → **STOP, do not init, resume next trigger** → user confirms → `wangchuan init --repo <url> --key <key>` → **check `wangchuan env list` for multiple environments** → if multiple: list envs, ask user to choose → `env switch <chosen>` → `wangchuan status -v` to review<br>4. Ensure watch |
| **Constraint** | Non-TTY: must pass `--repo`. Must warn and get backup confirmation before init on machine with existing data. Must list cloud envs and let user choose. If user doesn't confirm backup → STOP entirely, resume from scratch on next skill trigger. |
| **Anti-pattern** | Running init without checking for existing local data; not warning about overwrites; proceeding without backup confirmation; ignoring multiple cloud environments |
| **Anti-pattern** | Running bare `wangchuan init`; not distinguishing new vs restore; not asking for `--key` on restore |

### TC-02: Daily sync
| Field | Value |
|-------|-------|
| **Instruction** | "同步一下记忆" (指令2 variant) |
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. `wangchuan sync -y` (pulls first, then pushes)<br>2. Report: files synced, **current env: xxx**<br>3. Ensure watch |
| **Constraint** | Must use `-y`. Targets current env branch only. |

---

## Status / Doctor (TC-03 ~ TC-08)

### TC-03: Check status
| Field | Value |
|-------|-------|
| **Instruction** | "看看同步状态" |
| **Ref** | `references/inspect-status.md` |
| **Behavior** | `wangchuan status` → report health + **current env name** → ensure watch |

### TC-04: Verbose status
| Field | Value |
|-------|-------|
| **Instruction** | "详细看看同步状态" |
| **Ref** | `references/inspect-status.md` |
| **Behavior** | `wangchuan status -v` → interpret 4D health, machines, conflicts, suggest fixes → ensure watch |

### TC-05: Sync single agent
| Field | Value |
|-------|-------|
| **Instruction** | "只同步claude的配置" |
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | `wangchuan sync -y -a claude` → report synced to **current env** → ensure watch |

### TC-06: Health check
| Field | Value |
|-------|-------|
| **Instruction** | "跑一下健康检查" |
| **Ref** | `references/inspect-status.md` |
| **Behavior** | `wangchuan doctor` → report fixes → ensure watch |

### TC-07: Export key
| Field | Value |
|-------|-------|
| **Instruction** | "导出密钥" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | `wangchuan doctor --key-export` → warn secure storage → ensure watch |

### TC-08: New machine setup
| Field | Value |
|-------|-------|
| **Instruction** | "怎么在新机器上设置忘川" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | `wangchuan doctor --setup` → ensure watch |

---

## Environment (TC-09 ~ TC-16)

### TC-09: Create env — fork current (指令28)
| Field | Value |
|-------|-------|
| **Instruction** | "创建一个work环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. `wangchuan env list` — check if name exists<br>2. **If exists** → ask: "Already exists. Import current env's memories into it, or just switch?"<br>3. **If new** → ask: "Fork current env's data (all memories/skills/MCP/agents), or start empty?"<br>4. Fork: `wangchuan env create work` (non-TTY auto-forks)<br>5. Ask: switch to new env? → `wangchuan env switch work` if yes<br>6. Ensure watch (restart if switched) |
| **Constraint** | Must ask about data init choice. Must handle "already exists" case. Non-TTY auto-forks. |
| **Anti-pattern** | Creating without asking data init; ignoring existing name |

### TC-10: Create env — from specific source
| Field | Value |
|-------|-------|
| **Instruction** | "从test环境创建staging环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. `wangchuan env switch test` (switch to source first)<br>2. `wangchuan env create staging` (forks from test)<br>3. Offer switch to staging → restart watch if switched |
| **Constraint** | Must switch to source env before create, since `env create` forks current. |

### TC-11: Switch env (指令25)
| Field | Value |
|-------|-------|
| **Instruction** | "切换到work环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. **Pre-flight**: `wangchuan status` to detect unsynced changes<br>&nbsp;&nbsp;- Few changes (≤3): warn briefly, `wangchuan sync -y` first<br>&nbsp;&nbsp;- **Many changes or conflicts**: `wangchuan status -v` → show full diff → **ask user to confirm**: "N unsynced changes detected. Push first, or discard and switch?"<br>2. `wangchuan env switch work` (auto-pulls new env data)<br>3. **Post-switch**: check conflict markers (`grep '<<<<<<< LOCAL'`) + check `localOnly` stale files (`status -v`) → warn user<br>4. **Restart watch**: `pkill -f 'wangchuan.*watch'; nohup wangchuan watch ...` |
| **Constraint** | Must sync before switch. Large conflicts require explicit user confirmation. Must warn stale files. Must restart watch. |
| **Anti-pattern** | Switching without syncing; not confirming on large conflicts; not restarting watch |

### TC-12: List envs with health (指令26)
| Field | Value |
|-------|-------|
| **Instruction** | "查看忘川环境列表" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. `wangchuan env list`<br>2. Per-env: git log hostname extraction → machine count + last sync time<br>3. Current env: `wangchuan status -v` → health/unsynced/anomalies/conflicts<br>4. Report: table of all envs with machine count, health, unsynced, anomalies<br>5. Ensure watch |
| **Constraint** | Detailed health only available for current env (must switch to inspect others). |

### TC-13: Current env (指令27)
| Field | Value |
|-------|-------|
| **Instruction** | "看下忘川当前环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | `wangchuan env current` + `wangchuan status -v` → report: env name, machine count, 4D health, unsynced, anomalies, conflicts → ensure watch |

### TC-14: Delete env (指令29)
| Field | Value |
|-------|-------|
| **Instruction** | "删除忘川work环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. Confirm with user: "Delete 'work'? Cloud branch permanently removed."<br>2. Check: not default, not current (if current → switch first)<br>3. `wangchuan env delete work`<br>4. Report: cloud branch deleted. **Note: local workspace files are NOT cleaned** (code limitation — `env delete` only removes git branch). If user wants local cleanup, must manually rm stale files.<br>5. Ensure watch |
| **Constraint** | `env delete` = git branch deletion only. Local files unaffected — this is a known code limitation vs the "delete local" expectation. |

### TC-15: Pull from another env (环境问题②)
| Field | Value |
|-------|-------|
| **Instruction** | "拉取work环境的记忆" |
| **Ref** | `references/environment.md` + `references/sync-conflict.md` |
| **Behavior** | 1. Explain: cross-env pull not supported directly, must switch<br>2. `wangchuan sync -y` (push current env first)<br>3. `wangchuan env switch work` (auto-pulls work data)<br>4. Post-switch: check conflicts + stale files<br>5. Ask: switch back to original?<br>6. Restart watch |
| **Constraint** | No `--from-env` flag. Must sync current before switch. |

### TC-16: Workspace leakage (环境问题③)
| Field | Value |
|-------|-------|
| **Instruction** | "旧环境的技能还在" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. Explain: workspace is shared across envs, pull never deletes stale files<br>2. `wangchuan status -v` → identify `localOnly` files<br>3. Ask user: keep or rm?<br>4. Do NOT blindly `sync -y` after removal (would push deletion to current env)<br>5. Ensure watch |

---

## Watch (TC-17 ~ TC-18)

### TC-17: Start watch
| Field | Value |
|-------|-------|
| **Instruction** | "启动后台同步" |
| **Behavior** | 1. Check: `pgrep -f 'wangchuan.*watch'`<br>2. Start: `nohup wangchuan watch >/dev/null 2>&1 &`<br>3. Report: **pull-only** daemon, will NOT push. User must `wangchuan sync` manually to push. |

### TC-18: Watch auto-start (环境问题④, meta)
| Field | Value |
|-------|-------|
| **Instruction** | (any skill invocation) |
| **Behavior** | After primary task: `pgrep -f 'wangchuan.*watch' >/dev/null 2>&1 \|\| nohup wangchuan watch >/dev/null 2>&1 &` |
| **Constraint** | Mandatory for EVERY TC. Watch pulls current env only. After env switch, must kill+restart. |

---

## Snapshot / Rollback (TC-19 ~ TC-21)

### TC-19: Save snapshot
| Field | Value |
|-------|-------|
| **Instruction** | "保存一个快照" |
| **Ref** | `references/environment.md` |
| **Behavior** | `wangchuan snapshot save [name]` → report saved → ensure watch |

### TC-20: Rollback (指令24)
| Field | Value |
|-------|-------|
| **Instruction** | "回退记忆" / "撤销上次同步" / "恢复删除的技能" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. **Clarify intent** — ask which scenario:<br>&nbsp;&nbsp;a) Undo last sync → find auto-snapshot<br>&nbsp;&nbsp;b) Restore to a time point → `wangchuan snapshot list`<br>&nbsp;&nbsp;c) Recover a **deleted** config/skill → `git log --name-status` to find deletion commit<br>&nbsp;&nbsp;d) Revert a **modified** config → `git log + git show` to find change commit<br>&nbsp;&nbsp;e) Revert an **added** config → `git log` to find addition<br>2. Present candidate versions to user with timestamps/content<br>3. User confirms → execute:<br>&nbsp;&nbsp;- Snapshot: `wangchuan snapshot restore <name>` (auto-pushes to cloud)<br>&nbsp;&nbsp;- Single file: `cd ~/.wangchuan/repo && git checkout <hash> -- <file>` → `wangchuan sync -y`<br>4. Ensure watch |
| **Constraint** | Must help user identify which version to roll back to. `snapshot restore` auto-pushes. `git checkout` needs `sync -y`. |

### TC-21: Dry-run
| Field | Value |
|-------|-------|
| **Instruction** | "先看看同步会改什么" |
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | `wangchuan sync -n` → report **current env** changes → ensure watch |

---

## Customize / Language / Key (TC-22 ~ TC-25)

### TC-22: Customize path (指令2)
| Field | Value |
|-------|-------|
| **Instruction** | "claude配置路径是~/.claude-internal" |
| **Behavior** | jq update `profiles.default.claude.workspacePath` → `sync -y` (to **current env**) → ensure watch |
| **Constraint** | Only change `workspacePath` — all other paths resolve relative to it. |

### TC-23: Switch language
| Field | Value |
|-------|-------|
| **Instruction** | "切换到英文" |
| **Behavior** | `wangchuan lang en` → ensure watch |

### TC-24: Key rotation
| Field | Value |
|-------|-------|
| **Instruction** | "轮换密钥" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | `wangchuan doctor --key-rotate` → ensure watch |

### TC-25: Session start
| Field | Value |
|-------|-------|
| **Instruction** | (auto on session start) |
| **Behavior** | `wangchuan status` → `sync -y` if pending → ensure watch |

---

## Skills CRUD (TC-26 ~ TC-33)

### TC-26: Create skill — all (指令4)
| Field | Value |
|-------|-------|
| **Instruction** | "新增 xxx 技能" |
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Create skill files<br>2. New skill → always ask: All / specific agents / no distribution<br>3. User picks All → cp to all enabled agents with skills/ dir<br>4. `wangchuan sync -y` → pushed to **current env**<br>5. Ensure watch |
| **Constraint** | New skill is never shared — always ask. Sync targets current env. |

### TC-27: Create skill — specific
| Same as TC-26, user picks subset → cp selected → `sync -y` (to **current env**) |

### TC-28: Create skill — no distribution
| Same as TC-26, user declines → only current agent's copy → `sync -y` (to **current env**) |

### TC-29: Modify shared skill (指令3 - shared)
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Check `shared-registry.json` → SHARED<br>2. Auto-cp to all agents (user already opted in)<br>3. `wangchuan sync -y` → pushed to **current env**<br>4. Ensure watch |
| **Constraint** | Shared = auto-distribute, no ask. |

### TC-30: Modify non-shared skill (指令3 - non-shared)
| Same decision flow as TC-26: ask All/specific/no → `sync -y` (to **current env**) |

### TC-31: Delete shared skill — all (指令5 - shared, all)
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Check shared → inform user: "**SHARED skill**"<br>2. **Always ask** (even for shared): All / specific / Cancel<br>3. All → rm from all agents + unregister from shared-registry + `sync -y` → cloud `shared/skills/xxx/` auto-pruned<br>4. Pushed to **current env**<br>5. Ensure watch |

### TC-32: Delete shared skill — partial (指令5 - shared, partial)
| Field | Value |
|-------|-------|
| **Behavior** | 1. Inform SHARED → ask → user picks subset<br>2. rm from selected agents + **unregister (demote)** from shared-registry<br>3. `sync -y` → cloud `shared/skills/xxx/` pruned. Remaining agents keep local copies independently (no longer tracked as shared)<br>4. Pushed to **current env** → ensure watch |

### TC-33: Delete non-shared skill (指令5 - non-shared)
| Field | Value |
|-------|-------|
| **Behavior** | 1. Check shared → inform: "**LOCAL skill**"<br>2. Ask: All / specific / Cancel<br>3. rm from selected → `sync -y` → cloud removes agent-specific copy directly (no shared-registry involved)<br>4. Pushed to **current env** → ensure watch |
| **Constraint** | Non-shared skill: no unregister needed, cloud removes `agents/<name>/skills/` entries via stale detection. |

### TC-34: Inspect skill (指令6)
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | 1. Which agents have it ✓/✗<br>2. Shared or local (shared-registry check)<br>3. Cloud sync status (`repo/shared/skills/xxx/` exists?)<br>4. Ensure watch |

---

## Custom Agent CRUD (TC-35 ~ TC-38)

### TC-35: Create custom agent
| Same as TC-26, but **only 4 agents** (Claude/Cursor/CodeBuddy/WorkBuddy). **Ref**: `references/resource-crud.md`. Sync to **current env**. |

### TC-36: Modify shared custom agent
| Same as TC-29, but for `agents/` dir. Use `kind:'agent'` in registry check. Sync to **current env**. |

### TC-37: Delete custom agent
| Same as TC-31/32, but `kind:'agent'`. Only 4 agents. Sync to **current env**. |

### TC-38: Inspect custom agent
| Same as TC-34, but check `agents/` dirs, only 4 agents, `kind:'agent'` in registry. |

---

## MCP Server CRUD (TC-39 ~ TC-42)

### TC-39: Add MCP
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. jq add to current agent's config<br>2. Ask: All / specific / no (5 MCP-enabled agents, different config files each)<br>3. jq write to selected<br>4. `sync -y` (to **current env**)<br>5. Ensure watch |
| **Constraint** | Cloud: one merged `shared/mcp/mcpServers.json.enc`. Different config files per agent (.claude.json / mcp.json / mcporter.json). |

### TC-40: Modify MCP
| Same as TC-39 but update existing key. List which agents have the key first. Sync to **current env**. |

### TC-41: Delete MCP
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. List which agents have the key<br>2. Ask: All / specific / Cancel<br>3. `jq 'del(.mcpServers["xxx"])'` on selected agents<br>4. `sync -y` (to **current env**)<br>5. Ensure watch |
| **Constraint** | MCP auto-merge is **additive-only** — `jq del()` is the ONLY way to propagate removal. |

### TC-42: Inspect MCP
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | Read mcpServers from each agent's config file → list per agent → compare → ensure watch |

---

## Memory CRUD (TC-43 ~ TC-46)

### TC-43: Write memory (指令15)
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Write to current agent's memory file<br>2. Ask: broadcast all / copy specific / no<br>3. `wangchuan memory broadcast/copy` if yes<br>4. `sync -y` (to **current env**)<br>5. Ensure watch |
| **Constraint** | Claude=`CLAUDE.md`, OpenClaw/CodeBuddy/WorkBuddy/Codex=`MEMORY.md`. Cursor/Gemini have no memory. |

### TC-44: Modify memory (指令16)
| Same as TC-43 but edit existing → ask sync → `sync -y` (to **current env**) |

### TC-45: Delete memory (指令17)
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. `wangchuan memory list`<br>2. Ask: All / specific / Cancel<br>3. rm selected → `sync -y` (to **current env**)<br>4. Ensure watch |

### TC-46: Inspect memory (指令18/21)
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | 1. `wangchuan memory show <agent>`<br>2. Shared memory status (SHARED.md exists?)<br>3. Cloud sync status (repo/agents/.../MEMORY.md.enc?)<br>4. Ensure watch |
| **Constraint** | Different filenames per agent. Cursor/Gemini have no memory file — report "no memory for this agent". |

---

## Push / Pull / Conflict (TC-47 ~ TC-50)

### TC-47: Push memory (指令19)
| Field | Value |
|-------|-------|
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. `wangchuan sync -y` — **pulls first** (cloud→local merge), **then pushes** (local→cloud)<br>2. Check conflict markers in .md files<br>3. Auto-merged (non-overlapping) → success<br>4. Conflict markers → show to user → ask resolution → edit → `sync -y` again<br>5. Report: pushed to **current env**<br>6. Ensure watch |
| **Constraint** | sync always pulls before pushing. Agent must understand this is bidirectional, not raw push. |

### TC-48: Pull memory (指令20)
| Field | Value |
|-------|-------|
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. `wangchuan sync -y` (same bidirectional command)<br>2. Same conflict resolution as TC-47<br>3. Report: pulled from **current env**<br>4. Ensure watch |

### TC-49: Pull from different env (环境问题②)
| Field | Value |
|-------|-------|
| **Ref** | `references/environment.md` + `references/sync-conflict.md` |
| **Behavior** | 1. Explain: must switch env first (no `--from-env`)<br>2. `sync -y` current env first (save changes)<br>3. `env switch <target>` (auto-pulls target data)<br>4. Post-switch: check conflicts + stale files<br>5. Ask: switch back?<br>6. Restart watch |

### TC-50: Sync between agents (指令22)
| Field | Value |
|-------|-------|
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. **Clarify**: if user says "记忆" → memory only; if "配置" → ask which: Memory / Skills / MCP / Custom agents / All<br>2. Execute per type: `memory copy` / `cp skills/` / `jq merge mcpServers` / `cp agents/`<br>3. `sync -y` (to **current env**)<br>4. Ensure watch |
| **Constraint** | "配置" is ambiguous — must ask. Different mechanisms per type. Not all agents support all types. |

---

## Full Diagnostic (TC-51)

### TC-51: Full status (指令23)
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | 1. `wangchuan status -v`<br>2. Interpret and report: **current env name**, multi-machine count, 4D health (freshness/coverage/integrity/encryption), anomalies (stale lock, pending), unsynced files, conflict warnings, needs-manual-fix items<br>3. Per issue → suggest fix command<br>4. Ensure watch |

---

## Upgrade (TC-52)

### TC-52: Upgrade wangchuan
| Field | Value |
|-------|-------|
| **Instruction** | "升级忘川" / "upgrade wangchuan" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | 1. `npm update -g wangchuan`<br>2. `wangchuan --version` → report new version<br>3. `wangchuan sync -y` → reconcileProfiles auto-detects new sync entries, updates config.json, pulls cloud, pushes newly-discovered local files<br>4. Report: version, new sync entries (if any), files synced, **current env: xxx**<br>5. Ensure watch |
| **Constraint** | Must use `npm update -g` (not `npm install -g`). Must run `sync -y` after upgrade (triggers reconcileProfiles). Must report version + what changed. |
| **Anti-pattern** | Skipping `sync -y` after upgrade; manually editing config.json instead of letting reconcileProfiles handle it; not reporting the new version |

---

## Non-TTY Constraints

| Command | Required |
|---------|----------|
| `wangchuan init` | `--repo <url>` |
| `wangchuan sync` | `-y` |
| `wangchuan env create` | Auto-forks (OK) |
| `wangchuan watch` | `nohup ... &` (background) |
