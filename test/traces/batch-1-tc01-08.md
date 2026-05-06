# Batch 1: TC-01 through TC-08 Dry-Run Traces

## Summary Table

| TC | Verdict | Issue (if any) |
|----|---------|----------------|
| TC-01 | PASS | — |
| TC-02 | PASS | — |
| TC-03 | PASS | — |
| TC-04 | PASS | — |
| TC-05 | PASS | — |
| TC-06 | PASS | — |
| TC-07 | PASS | — |
| TC-08 | PASS | — |

## Detailed Traces

### TC-01: Fresh initialization (no existing repo)

**Routing:** "Initialize wangchuan" → SKILL.md table: `Init / setup / initialize wangchuan` → `references/init.md` ✅

**Procedure trace:**
- Step 1: `test -d ~/.wangchuan` → doesn't exist → continues ✅
- Step 2: Asks about existing repo → user says no → continues ✅
- Step 3: `mkdir -p` + `chmod 700 ~/.wangchuan` ✅
- Step 4: `openssl rand -base64 32` + `chmod 600 master.key` ✅
- Step 5: Copies encrypt/decrypt scripts ✅
- Step 6: Asks for git repo URL (offers `gh repo create`) ✅
- Step 7: Agent detection via `test -d` ✅
- Step 8: Writes config.json ✅
- Step 9: Scans skills, classifies shared vs agent-specific ✅
- Step 10: Encrypts memory files ✅
- Step 11: `git add -A && commit && push` ✅
- Step 12: Summary with key fingerprint + save warning ✅

**Critical constraints:** All satisfied (chmod 600/700, warns to save key, detects agents).
**Anti-patterns:** All avoided (asks about repo, detects agents, encrypts before push, requires repo URL).

---

### TC-02: Initialization with existing repo (redirect to restore)

**Routing:** "Initialize wangchuan" → `references/init.md` ✅

**Procedure trace:**
- Step 1: `~/.wangchuan` doesn't exist → continues ✅
- Step 2: Asks "Do you have an existing repo?" → user says yes → **explicitly** redirects to `restore.md` ✅

**Critical constraints:** Redirects to restore flow ✅; restore.md Step 1 asks for BOTH repo URL and master.key ✅.
**Anti-patterns:** No new key generated (redirects away) ✅; master.key required by restore flow ✅.

---

### TC-03: Re-initialization (wangchuan already exists)

**Routing:** "Initialize wangchuan" → `references/init.md` ✅

**Procedure trace:**
- Step 1: `test -d ~/.wangchuan` → exists → asks "Re-initialize?" ✅
- User says yes → `rm -rf ~/.wangchuan` then continues ✅
- User says no → abort ✅

**Critical constraints:** Confirms before destroying ✅; no silent overwrite ✅.
**Anti-patterns:** No auto-delete ✅; checks existing state first ✅.

---

### TC-04: Restore on new machine

**Routing:** "Restore wangchuan" → SKILL.md table: `Restore / restore wangchuan / restore memories` → `references/restore.md` ✅

**Procedure trace:**
- Step 1: Asks for repo URL AND master key (file path or base64) ✅
- Step 2: Creates `~/.wangchuan/` with chmod 700 ✅
- Step 3: Saves master.key with chmod 600 (handles both file path and base64 input) ✅
- Step 4: Installs encrypt/decrypt scripts ✅
- Step 5: `git clone` ✅
- Step 6: Detects local agents via `test -d` ✅
- Step 7: For each detected agent: (a) decrypt memory, (b) copy agent-specific skills, (c) copy shared skills ✅
- Step 8: Writes config.json ✅
- Step 10: Output summary ✅

**Critical constraints:** Accepts key as file/base64 ✅; only restores detected agents ✅; shared skills to ALL detected ✅; decrypts before writing ✅.
**Anti-patterns:** Detects agents (no assumption) ✅; decrypts first ✅; skips silently if no repo data ✅.

---

### TC-05: Restore with partial agent coverage

**Routing:** "Restore memories" → `references/restore.md` ✅

**Procedure trace:**
- Step 5: Clones repo (has data for claude, cursor, openclaw) ✅
- Step 6: Only `~/.claude` exists → only "claude" detected ✅
- Step 7: Iterates only detected agents → restores only Claude ✅
- Cursor/OpenClaw not detected → skipped silently (restore.md: "If encrypted file doesn't exist... skip silently" + SKILL.md: "agent dir missing → skip silently") ✅

**Critical constraints:** Only operates on locally detected agents ✅; no errors for missing ✅.
**Anti-patterns:** Does not create ~/.cursor or ~/.openclaw ✅; no error for missing agents ✅.

---

### TC-06: View shared skill

**Routing:** "Show skill code-review" → SKILL.md table: `View skill / show skill / inspect skill` → `references/skill-crud.md → View Skill` ✅

**Procedure trace:**
- Step 1: Searches shared/skills/, agents/*/skills/, and local agent dirs ✅
- Step 2: Determines shared status, which agents use it, sync status (compare local vs repo) ✅
- Step 3: Outputs formatted status with type, agents, sync info ✅

**Critical constraints:** Searches all locations ✅; reports sync status ✅; indicates shared/agent-specific ✅.
**Anti-patterns:** Checks multiple locations ✅; includes sync status ✅; shows metadata not just raw content ✅.

---

### TC-07: View non-existent skill

**Routing:** "Show skill nonexistent-xyz" → `references/skill-crud.md → View Skill` ✅

**Procedure trace:**
- Step 1: Searches all locations via fuzzy match → no results ✅
- Agent infers "not found" from empty search (SKILL.md Execution Model: "Make intelligent decisions at branch points") ✅

**Critical constraints:** Clear "not found" outcome (no crash-prone operations) ✅; no errors ✅.
**Anti-patterns:** No crash ✅; no auto-creation in View flow ✅.

---

### TC-08: Add skill — sync to all agents

**Routing:** "Add a git-commit-helper skill" → SKILL.md table: `Add skill / create skill` → `references/skill-crud.md → Add Skill` ✅

**Procedure trace:**
- Step 1: Confirms skill content ✅
- Step 2: Asks "Sync to other agents?" with options [Current only / Claude / Cursor / OpenClaw / All] ✅
- Step 3 (user picks "All"): Copies to `shared/skills/` in repo AND all local agent dirs ✅
- Step 5: `git add -A && commit && push` ✅

**Critical constraints:** Asks sync target ✅; "All" → shared/skills/ ✅; copies to local dirs ✅; git push ✅.
**Anti-patterns:** Does not skip asking ✅; copies to both repo and local ✅; includes git push ✅.
