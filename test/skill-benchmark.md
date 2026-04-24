# Wangchuan Skill Benchmark v3.0.0

Test cases for verifying an AI agent with the wangchuan skill loaded.

## Scoring

- **PASS**: Triggers skill → loads correct reference → executes correct commands → handles non-TTY → notes current env on push/pull.
- **PARTIAL**: Triggers but misses a step (wrong flag, no env note).
- **FAIL**: Does not trigger, or command errors out.

## Global Rules (ALL TCs)

1. **Reference loading**: Read the `references/*.md` per routing table BEFORE acting.
2. **Environment**: All push/pull target **current env's branch only**. Note env name in reports. Stale files from old env must not be blindly pushed.
3. **Non-TTY**: `init` requires `--repo`, `push` requires `-y`, `env create` auto-forks.

---

## Init / Setup (TC-01 ~ TC-02)

### TC-01: Initialize wangchuan
| Field | Value |
|-------|-------|
| **Instruction** | "请初始化忘川" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | 1. `command -v wangchuan \|\| npm install -g wangchuan`<br>2. Ask repo URL → `wangchuan init --repo <url>` → auto: generate key, clone, detect agents, extract shared, pull cloud data<br>3. Remind backup key: `wangchuan doctor --key-export`<br>4. Tell user: "Initialization complete. Run `wangchuan push` when ready to push local data to cloud." |
| **Constraint** | Non-TTY: must pass `--repo`. This TC covers brand new setup ONLY. For restore scenarios, see TC-53. Init only pulls — no auto-push. |
| **Anti-pattern** | Running bare `wangchuan init`; using `init` for restore (use `restore` instead); not reminding key backup |

### TC-02: Daily push
| Field | Value |
|-------|-------|
| **Instruction** | "同步一下记忆" |
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. `wangchuan push -y`<br>2. Report: files pushed, **current env: xxx** |
| **Constraint** | Must use `-y`. Targets current env branch only. |

---

## Status / Doctor (TC-03 ~ TC-08)

### TC-03: Check status
| Field | Value |
|-------|-------|
| **Instruction** | "看看同步状态" |
| **Ref** | `references/inspect-status.md` |
| **Behavior** | `wangchuan status` → report health + **current env name** |

### TC-04: Verbose status
| Field | Value |
|-------|-------|
| **Instruction** | "详细看看同步状态" |
| **Ref** | `references/inspect-status.md` |
| **Behavior** | `wangchuan status -v` → interpret 4D health, machines, conflicts, suggest fixes |

### TC-05: Push single agent
| Field | Value |
|-------|-------|
| **Instruction** | "只同步claude的配置" |
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | `wangchuan push -y -a claude` → report pushed to **current env** |

### TC-06: Health check
| Field | Value |
|-------|-------|
| **Instruction** | "跑一下健康检查" |
| **Ref** | `references/inspect-status.md` |
| **Behavior** | `wangchuan doctor` → report fixes |

### TC-07: Export key
| Field | Value |
|-------|-------|
| **Instruction** | "导出密钥" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | `wangchuan doctor --key-export` → warn secure storage |

### TC-08: New machine setup
| Field | Value |
|-------|-------|
| **Instruction** | "怎么在新机器上设置忘川" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | `wangchuan doctor --setup` |

---

## Environment (TC-09 ~ TC-16)

### TC-09: Create env — fork current
| Field | Value |
|-------|-------|
| **Instruction** | "创建一个work环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. `wangchuan env list` — check if name exists<br>2. **If exists** → ask: "Already exists. Import current env's memories into it, or just switch?"<br>3. **If new** → ask: "Fork current env's data (all memories/skills/MCP/agents), or start empty?"<br>4. Fork: `wangchuan env create work` (non-TTY auto-forks)<br>5. Ask: switch to new env? → `wangchuan env switch work` if yes<br>6. No auto-push — tell user: "Environment created locally. Run `wangchuan push` when ready to push." |
| **Constraint** | Must ask about data init choice. Must handle "already exists" case. Non-TTY auto-forks. No auto-push after create. |
| **Anti-pattern** | Creating without asking data init; ignoring existing name |

### TC-10: Create env — from specific source
| Field | Value |
|-------|-------|
| **Instruction** | "从test环境创建staging环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. `wangchuan env switch test` (switch to source first)<br>2. `wangchuan env create staging` (forks from test)<br>3. Offer switch to staging |
| **Constraint** | Must switch to source env before create, since `env create` forks current. |

### TC-11: Switch env
| Field | Value |
|-------|-------|
| **Instruction** | "切换到work环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. **Pre-flight**: `wangchuan status` to detect unsynced changes<br>&nbsp;&nbsp;- Few changes (≤3): warn briefly, ask user: "Push changes before switching?" If yes: `wangchuan push -y`<br>&nbsp;&nbsp;- **Many changes or conflicts**: `wangchuan status -v` → show full diff → **ask user to confirm**: "N unsynced changes detected. Push first, or discard and switch?"<br>2. `wangchuan env switch work` (auto-pulls new env data)<br>3. **Post-switch**: check conflict markers (`grep '<<<<<<< LOCAL'`) + check `localOnly` stale files (`status -v`) → warn user |
| **Constraint** | Must ask before pushing pre-switch. Large conflicts require explicit user confirmation. Must warn stale files. No auto-push after switch. |
| **Anti-pattern** | Switching without asking about unsynced changes; auto-pushing without user confirmation; not confirming on large conflicts |

### TC-12: List envs with health
| Field | Value |
|-------|-------|
| **Instruction** | "查看忘川环境列表" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. `wangchuan env list`<br>2. Per-env: git log hostname extraction → machine count + last sync time<br>3. Current env: `wangchuan status -v` → health/unsynced/anomalies/conflicts<br>4. Report: table of all envs with machine count, health, unsynced, anomalies |
| **Constraint** | Detailed health only available for current env (must switch to inspect others). |

### TC-13: Current env
| Field | Value |
|-------|-------|
| **Instruction** | "看下忘川当前环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | `wangchuan env current` + `wangchuan status -v` → report: env name, machine count, 4D health, unsynced, anomalies, conflicts |

### TC-14: Delete env
| Field | Value |
|-------|-------|
| **Instruction** | "删除忘川work环境" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. Confirm with user: "Delete 'work'? Cloud branch permanently removed."<br>2. Check: not default, not current (if current → switch first)<br>3. `wangchuan env delete work`<br>4. Report: cloud branch deleted. **Note: local workspace files are NOT cleaned** (code limitation — `env delete` only removes git branch). If user wants local cleanup, must manually rm stale files. |
| **Constraint** | `env delete` = git branch deletion only. Local files unaffected — this is a known code limitation vs the "delete local" expectation. |

### TC-15: Pull from another env
| Field | Value |
|-------|-------|
| **Instruction** | "拉取work环境的记忆" |
| **Ref** | `references/environment.md` + `references/sync-conflict.md` |
| **Behavior** | 1. Explain: cross-env pull not supported directly, must switch<br>2. Ask user: "Push current env's changes before switching?" If yes: `wangchuan push -y`<br>3. `wangchuan env switch work` (auto-pulls work data)<br>4. Post-switch: check conflicts + stale files<br>5. Ask: switch back to original? |
| **Constraint** | No `--from-env` flag. Must ask before pushing current env. |

### TC-16: Workspace leakage
| Field | Value |
|-------|-------|
| **Instruction** | "旧环境的技能还在" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. Explain: workspace is shared across envs, pull never deletes stale files<br>2. `wangchuan status -v` → identify `localOnly` files<br>3. Ask user: keep or rm?<br>4. Do NOT blindly `push -y` after removal (would push deletion to current env) |

---

## Snapshot / Rollback (TC-19 ~ TC-21)

### TC-19: Save snapshot
| Field | Value |
|-------|-------|
| **Instruction** | "保存一个快照" |
| **Ref** | `references/environment.md` |
| **Behavior** | `wangchuan snapshot save [name]` → report saved |

### TC-20: Rollback
| Field | Value |
|-------|-------|
| **Instruction** | "回退记忆" / "撤销上次同步" / "恢复删除的技能" |
| **Ref** | `references/environment.md` |
| **Behavior** | 1. **Clarify intent** — ask which scenario:<br>&nbsp;&nbsp;a) Undo last push → find auto-snapshot<br>&nbsp;&nbsp;b) Restore to a time point → `wangchuan snapshot list`<br>&nbsp;&nbsp;c) Recover a **deleted** config/skill → `git log --name-status` to find deletion commit<br>&nbsp;&nbsp;d) Revert a **modified** config → `git log + git show` to find change commit<br>&nbsp;&nbsp;e) Revert an **added** config → `git log` to find addition<br>2. Present candidate versions to user with timestamps/content<br>3. User confirms → execute:<br>&nbsp;&nbsp;- Snapshot: `wangchuan snapshot restore <name>` (restores locally)<br>&nbsp;&nbsp;- Single file: `cd ~/.wangchuan/repo && git checkout <hash> -- <file>`<br>4. Tell user: "Restored locally. Run `wangchuan push` to push to cloud." If user confirms: `wangchuan push -y` |
| **Constraint** | Must help user identify which version to roll back to. No auto-push after restore — ask user first. |

### TC-21: Dry-run
| Field | Value |
|-------|-------|
| **Instruction** | "先看看同步会改什么" |
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | `wangchuan push -n` → report **current env** changes |

---

## Customize / Language / Key (TC-22 ~ TC-25)

### TC-22: Customize path
| Field | Value |
|-------|-------|
| **Instruction** | "claude配置路径是~/.claude-internal" |
| **Behavior** | jq update `profiles.default.claude.workspacePath` → tell user: "Path updated locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |
| **Constraint** | Only change `workspacePath` — all other paths resolve relative to it. |

### TC-23: Switch language
| Field | Value |
|-------|-------|
| **Instruction** | "切换到英文" |
| **Behavior** | `wangchuan lang en` |

### TC-24: Key rotation
| Field | Value |
|-------|-------|
| **Instruction** | "轮换密钥" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | `wangchuan doctor --key-rotate` |

### TC-25: Session start
| Field | Value |
|-------|-------|
| **Instruction** | (auto on session start) |
| **Behavior** | `wangchuan pull` (pull cloud data to local, no push) |

---

## Skills CRUD (TC-26 ~ TC-33)

### TC-26: Create skill — all
| Field | Value |
|-------|-------|
| **Instruction** | "新增 xxx 技能" |
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Create skill files in current agent's skills/ dir<br>2. Skill stays in current agent by default — do NOT prompt to distribute<br>3. Only if user **explicitly asks** to share → ask: All / specific agents / no distribution<br>4. User picks All → cp to all enabled agents with skills/ dir + register in shared-registry<br>5. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `wangchuan push -y` → pushed to **current env** |
| **Constraint** | New skill is agent-specific by default. No auto-distribution prompt. Push targets current env. |
| **Anti-pattern** | Auto-distributing new skill without user asking; prompting "share to other agents?" on creation |

### TC-27: Create skill — specific
| Same as TC-26, user explicitly asks to share to subset → cp selected → register in shared-registry → tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |

### TC-28: Create skill — no distribution
| Same as TC-26, user does not ask to share → only current agent's copy → tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**). This is the default behavior. |

### TC-29: Modify shared skill (shared)
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Check `shared-registry.json` → SHARED<br>2. Auto-cp to all agents (user already opted in)<br>3. Tell user: "Changes saved locally and distributed. Run `wangchuan push` to push to cloud." → if user confirms: `wangchuan push -y` → pushed to **current env** |
| **Constraint** | Shared = auto-distribute, no ask. |

### TC-30: Modify non-shared skill (non-shared)
| Same decision flow as TC-26: ask All/specific/no → tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |

### TC-31: Delete shared skill — all (shared, all)
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Check shared → inform user: "**SHARED skill**"<br>2. **Always ask** (even for shared): All / specific / Cancel<br>3. All → rm from all agents + unregister from shared-registry<br>4. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` → cloud `shared/skills/xxx/` auto-pruned<br>5. Pushed to **current env** |

### TC-32: Delete shared skill — partial (shared, partial)
| Field | Value |
|-------|-------|
| **Behavior** | 1. Inform SHARED → ask → user picks subset<br>2. rm from selected agents + **unregister (demote)** from shared-registry<br>3. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` → cloud `shared/skills/xxx/` pruned. Remaining agents keep local copies independently (no longer tracked as shared)<br>4. Pushed to **current env** |

### TC-33: Delete non-shared skill (non-shared)
| Field | Value |
|-------|-------|
| **Behavior** | 1. Check shared → inform: "**LOCAL skill**"<br>2. Ask: All / specific / Cancel<br>3. rm from selected<br>4. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` → cloud removes agent-specific copy directly (no shared-registry involved)<br>5. Pushed to **current env** |
| **Constraint** | Non-shared skill: no unregister needed, cloud removes `agents/<name>/skills/` entries via stale detection. |

### TC-34: Inspect skill
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | 1. Which agents have it ✓/✗<br>2. Shared or local (shared-registry check)<br>3. Cloud sync status (`repo/shared/skills/xxx/` exists?) |

---

## Custom Agent CRUD (TC-35 ~ TC-38)

### TC-35: Create custom agent
| Same as TC-26, but **only 4 agents** (Claude/Cursor/CodeBuddy/WorkBuddy). **Ref**: `references/resource-crud.md`. Agent stays in current agent by default — only distribute if user explicitly asks. Ask user before push. Push to **current env**. |

### TC-36: Modify shared custom agent
| Same as TC-29, but for `agents/` dir. Use `kind:'agent'` in registry check. Ask user before push. Push to **current env**. |

### TC-37: Delete custom agent
| Same as TC-31/32, but `kind:'agent'`. Only 4 agents. Ask user before push. Push to **current env**. |

### TC-38: Inspect custom agent
| Same as TC-34, but check `agents/` dirs, only 4 agents, `kind:'agent'` in registry. |

---

## MCP Server CRUD (TC-39 ~ TC-42)

### TC-39: Add MCP
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. jq add to current agent's config<br>2. MCP stays in current agent by default — do NOT prompt to copy to other agents<br>3. Only if user **explicitly asks** to share → ask: which agents? (5 MCP-enabled agents, different config files each) → jq write to selected<br>4. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |
| **Constraint** | Each agent's MCP config is independent. No auto-distribution or auto-merge. Cloud stores a merged backup but local configs are NOT auto-merged. Different config files per agent (.claude.json / mcp.json / mcporter.json). |
| **Anti-pattern** | Auto-distributing MCP to other agents; prompting "sync to other agents?" on creation; auto-merging MCP configs across agents |

### TC-40: Modify MCP
| Same as TC-39 but update existing key. MCP stays in current agent by default. Only copy to other agents if user explicitly asks. List which agents have the key first. Push to **current env**. |

### TC-41: Delete MCP
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. List which agents have the key<br>2. Ask: All / specific / Cancel<br>3. `jq 'del(.mcpServers["xxx"])'` on selected agents<br>4. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |
| **Constraint** | `jq del()` is the only way to remove an MCP server. No auto-propagation of deletions across agents. |

### TC-42: Inspect MCP
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | Read mcpServers from each agent's config file → list per agent → compare |

---

## Memory CRUD (TC-43 ~ TC-46)

### TC-43: Write memory
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. Write to current agent's memory file<br>2. Ask: broadcast all / copy specific / no<br>3. `wangchuan memory broadcast/copy` if yes<br>4. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |
| **Constraint** | Claude=`CLAUDE.md`, OpenClaw/CodeBuddy/WorkBuddy/Codex=`MEMORY.md`. Cursor/Gemini have no memory. |

### TC-44: Modify memory
| Same as TC-43 but edit existing → ask sync → tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |

### TC-45: Delete memory
| Field | Value |
|-------|-------|
| **Ref** | `references/resource-crud.md` |
| **Behavior** | 1. `wangchuan memory list`<br>2. Ask: All / specific / Cancel<br>3. rm selected<br>4. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |

### TC-46: Inspect memory
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | 1. `wangchuan memory show <agent>`<br>2. Shared memory status (SHARED.md exists?)<br>3. Cloud sync status (repo/agents/.../MEMORY.md.enc?) |
| **Constraint** | Different filenames per agent. Cursor/Gemini have no memory file — report "no memory for this agent". |

---

## Push / Pull / Conflict (TC-47 ~ TC-50)

### TC-47: Push memory
| Field | Value |
|-------|-------|
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. `wangchuan push -y` — fetches remote first (cloud→local merge if remote ahead), **then pushes** (local→cloud)<br>2. Check conflict markers in .md files<br>3. Auto-merged (non-overlapping) → success<br>4. Conflict markers → show to user → ask resolution → edit → `push -y` again<br>5. Report: pushed to **current env** |
| **Constraint** | Push fetches remote before pushing. Agent must understand this includes a merge step. |

### TC-48: Pull memory
| Field | Value |
|-------|-------|
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. `wangchuan pull`<br>2. Report: pulled from **current env** |

### TC-49: Pull from different env
| Field | Value |
|-------|-------|
| **Ref** | `references/environment.md` + `references/sync-conflict.md` |
| **Behavior** | 1. Explain: must switch env first (no `--from-env`)<br>2. Ask user: "Push current env's changes before switching?" If yes: `push -y`<br>3. `env switch <target>` (auto-pulls target data)<br>4. Post-switch: check conflicts + stale files<br>5. Ask: switch back? |

### TC-50: Sync between agents
| Field | Value |
|-------|-------|
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. **Clarify**: if user says "记忆" → memory only; if "配置" → ask which: Memory / Skills / MCP / Custom agents / All<br>2. Execute per type: `memory copy` / `cp skills/` / `jq merge mcpServers` / `cp agents/`<br>3. Tell user: "Changes saved locally. Run `wangchuan push` to push to cloud." → if user confirms: `push -y` (to **current env**) |
| **Constraint** | "配置" is ambiguous — must ask. Different mechanisms per type. Not all agents support all types. |

---

## Full Diagnostic (TC-51)

### TC-51: Full status
| Field | Value |
|-------|-------|
| **Ref** | `references/inspect-status.md` |
| **Behavior** | 1. `wangchuan status -v`<br>2. Interpret and report: **current env name**, multi-machine count, 4D health (freshness/coverage/integrity/encryption), anomalies (stale lock, pending), unsynced files, conflict warnings, needs-manual-fix items<br>3. Per issue → suggest fix command |

---

## Upgrade (TC-52)

### TC-52: Upgrade wangchuan
| Field | Value |
|-------|-------|
| **Instruction** | "升级忘川" / "upgrade wangchuan" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | 1. `npm update -g wangchuan`<br>2. `wangchuan --version` → report new version<br>3. Tell user: "Upgrade complete. Run `wangchuan pull` to get cloud data, then `wangchuan push` to push newly-discovered local files." → if user confirms: `wangchuan pull` then `wangchuan push -y` → reconcileProfiles auto-detects new sync entries, updates config.json, **pulls cloud first**, then pushes newly-discovered local files. Run push twice if first push only updates config.<br>4. Report: version, new sync entries (if any), files synced, **current env: xxx** |
| **Constraint** | Must use `npm update -g` (not `npm install -g`). Push is NOT automatic after upgrade — must ask user. Cloud must be pulled before pushing. Must report version + what changed. |
| **Anti-pattern** | Auto-pushing after upgrade without asking; manually editing config.json instead of letting reconcileProfiles handle it; not reporting the new version; pushing without pulling cloud first |

---

## Restore (TC-53)

### TC-53: Restore cloud memories to new machine
| Field | Value |
|-------|-------|
| **Instruction** | "恢复云端记忆" / "新机器绑定忘川" / "restore cloud memories" |
| **Ref** | `references/install-setup.md` |
| **Behavior** | 1. Ask repo URL + master key<br>2. Check local data → warn about overwrites → ask backup confirmation<br>3. If declined → STOP<br>4. `wangchuan restore --repo <url> --key <key>`<br>5. Check `wangchuan env list` for multiple environments → if multiple: list, ask user to choose → `env switch <chosen>`<br>6. `wangchuan status -v` to review |
| **Constraint** | Must use `restore` (not `init`). Cloud is source of truth — local additions pushed, nothing deleted from cloud. Must warn about overwrites. Must ask backup confirmation — decline = STOP. |
| **Anti-pattern** | Using `wangchuan init` for restore; deleting cloud data; skipping backup warning; not listing environments |

---

## Handle cloud-deleted files (TC-54)

### TC-54: Handle files deleted from cloud
| Field | Value |
|-------|-------|
| **Instruction** | "另一台机器删除了xxx技能，但我这里还有" / "cloud deleted a skill but it's still local" |
| **Ref** | `references/sync-conflict.md` |
| **Behavior** | 1. Explain: cloud is source of truth — files deleted from cloud are automatically deleted locally on next pull<br>2. If user wants to recover: `cd ~/.wangchuan/repo && git log --name-status -10` to find deletion commit → `git checkout <hash>~1 -- <file>` → `wangchuan push -y` |
| **Constraint** | Cloud deletions are automatically propagated to local. No confirmation needed. Git history preserves all changes for rollback. |
| **Anti-pattern** | Blocking cloud deletions from propagating; requiring user confirmation for cloud-driven changes; re-pushing deleted files |

---

## Non-TTY Constraints

| Command | Required |
|---------|----------|
| `wangchuan init` | `--repo <url>` |
| `wangchuan restore` | `--repo <url>` and `--key <key>` |
| `wangchuan push` | `-y` |
| `wangchuan env create` | Auto-forks (OK) |
