# Batch 3: TC-17 to TC-25 Dry-Run Traces

## Trace Details

### TC-17: Push memory — first push (no cloud data)

**Routing:** "Push memory" → SKILL.md routing table → `references/push-memory.md` ✓

**Procedure trace:**
1. Step 1: `git pull --rebase` — pulls (nothing relevant for memory) ✓
2. Step 2: Read config ✓
3. Step 3: For each agent, checks if `.enc` exists in repo → "If new (no .enc in repo) → encrypt directly" ✓
4. Step 5: Encrypt local file directly ✓
5. Step 6: Commit + push ✓

**Constraints check:**
- No decrypt attempt when .enc doesn't exist: ✓ (procedure says "If new → encrypt directly", skips decrypt/compare)
- Straightforward encrypt-and-push: ✓

**Anti-patterns check:**
- Error because .enc file not found: Avoided ✓ (explicit "If new" branch)
- Try to decrypt non-existent file: Avoided ✓

---

### TC-18: Pull memory — no conflicts

**Routing:** "Pull memory" → SKILL.md routing table → `references/pull-memory.md` ✓

**Procedure trace:**
1. Step 1: `git pull --rebase` ✓
2. Step 3: Decrypt cloud memory, read local, compare ✓
3. Step 4: Merge strategy — "Cloud has content local doesn't → append to local" ✓
4. Step 4: "Local has content cloud doesn't → keep local (suggest push later)" ✓
5. Step 7: Report includes "Local-only content" suggestion ✓

**Constraints check:**
- Must not lose local-only content: ✓ (merge strategy explicitly keeps local content)
- Cloud additions appended (not overwrite): ✓ (section-level merge, append new sections)
- Suggest "push memory" if local has content not in cloud: ✓ (Step 7 report template)

**Anti-patterns check:**
- Overwrite local with cloud content: Avoided ✓
- Lose local additions: Avoided ✓

---

### TC-19: Pull memory — with conflict

**Routing:** "Pull memory" → `references/pull-memory.md` ✓

**Procedure trace:**
1. Step 1: Pull latest ✓
2. Step 3: Decrypt, compare with local ✓
3. Step 4: "Conflicting sections → show to user" with Choose: [Keep local] [Keep cloud] [Manual merge] ✓
4. Step 4.5: Write merged result to local file ✓

**Constraints check:**
- Same conflict resolution as push (section-level): ✓ (identical merge strategy)
- User gets to choose for each conflict: ✓ (explicit Choose prompt)

**Anti-patterns check:**
- Auto-overwrite local with cloud: Avoided ✓ (user choice required)
- Silently drop cloud changes: Avoided ✓

---

### TC-20: Pull memory — also syncs shared skills

**Routing:** "Pull memory" → `references/pull-memory.md` ✓

**Procedure trace:**
1. Steps 1–4: Normal memory pull flow ✓
2. Step 5: "Sync shared skills" — diff repo shared/skills/ vs local agent dirs, update if repo newer ✓
3. Step 7: Report (though report template doesn't explicitly mention skill updates)

**Constraints check:**
- Skill sync is a bonus during pull, not primary action: ✓ (Step 5 happens after memory in Steps 1–4)
- Only shared skills are checked: ✓ (Step 5 only checks `shared/skills/`)

**Anti-patterns check:**
- Skip skill sync entirely: Avoided ✓ (Step 5 explicitly handles it)
- Overwrite local skill modifications without notice: PARTIAL ISSUE — Step 5 says "If repo has newer shared skills → update local copies" but doesn't define how to detect "newer" or warn user about local modifications being overwritten.

---

### TC-21: Trigger — should NOT trigger for general git

**Routing:** "Help me git push the current project" — SKILL.md description triggers on "syncing memories or skills between agents/machines". A general `git push` of the current project is unrelated.

**Analysis:** The SKILL.md trigger description says to trigger on "any mention of syncing agent data, sharing skills between AI tools, or encrypted memory backup." A plain "git push the current project" does NOT mention agent data, skills between AI tools, or memory backup. The skill should NOT trigger. ✓

**Constraints check:** N/A (non-trigger case)

**Anti-patterns check:**
- Activate wangchuan and try to push memories: Should be avoided ✓ (no trigger keywords matched)

---

### TC-22: Trigger — should trigger for implicit sync request

**Routing:** "I switched to a new computer, how do I restore my Claude memories?" — SKILL.md description: "cross-machine agent setup" + "restore agent settings" + "any mention of syncing agent data". This matches. → Pre-check → `references/restore.md` ✓

**Analysis:** The trigger description covers "cross-machine agent setup" and "backup/restore agent settings" explicitly. "New computer" + "restore Claude memories" clearly maps to restore flow.

**Constraints check:**
- Should trigger even without explicit "wangchuan" keyword: ✓ (SKILL.md says "Trigger even if the user doesn't say 'wangchuan' explicitly")
- Context matches: ✓

---

### TC-23: Trigger — should NOT trigger for unrelated AI questions

**Routing:** "How do I call the Claude API?" — This is about the Claude API, not about syncing agent memories/skills.

**Analysis:** SKILL.md triggers on syncing memories, skills, configs, cross-machine setup, backup/restore. "Call the Claude API" is about API usage — no trigger keywords match.

**Anti-patterns check:**
- Activate wangchuan skill: Should be avoided ✓ (no semantic match)

---

### TC-24: Error handling — git push rejection

**Routing:** "Push memory" → `references/push-memory.md` ✓

**Procedure trace:**
1. Step 1: `git pull --rebase` — procedure says "If pull fails due to conflicts, do `git rebase --abort` and `git pull --ff-only`. If that also fails, report to user." ✓
2. Step 6: Push — "If push fails → `git pull --rebase` then retry once." ✓
3. SKILL.md Error Handling: "git push fails → git pull --rebase then retry push once. If still fails, report to user." ✓

**Constraints check:**
- Must attempt recovery: ✓ (rebase abort + ff-only in Step 1; pull --rebase retry in Step 6)
- Must report failure clearly if unrecoverable: ✓ ("report to user")
- Never force push: ✓ (no `--force` anywhere in procedure)

**Anti-patterns check:**
- `git push --force`: Avoided ✓
- Silent failure: Avoided ✓ (explicit "report to user")
- Lose encrypted data: Avoided ✓ (abort rebase preserves state)

---

### TC-25: Not initialized — non-init operation

**Routing:** "Push memory" → SKILL.md Pre-check fires first ✓

**Procedure trace:**
1. SKILL.md Pre-check: `test -f ~/.wangchuan/config.json` → fails (NOT_INIT)
2. SKILL.md says: "If not initialized, stop and tell the user: 'Wangchuan is not initialized. Say "initialize wangchuan" to set up, or "restore wangchuan" to restore from cloud.'"
3. Does NOT proceed to push-memory.md ✓

**Constraints check:**
- Pre-check MUST happen before any operation (except init/restore): ✓ (SKILL.md places it before routing table)
- Clear guidance on what to do next: ✓ (message includes both options)

**Anti-patterns check:**
- Try to push without config: Avoided ✓ (pre-check blocks)
- Auto-initialize without asking: Avoided ✓ (only informs user)

---

## Summary

| TC | Verdict | Issue (if any) |
|----|---------|----------------|
| TC-17 | PASS | — |
| TC-18 | PASS | — |
| TC-19 | PASS | — |
| TC-20 | PARTIAL | Step 5 lacks definition of "newer" detection and doesn't warn user before overwriting local skill modifications |
| TC-21 | PASS | — |
| TC-22 | PASS | — |
| TC-23 | PASS | — |
| TC-24 | PASS | — |
| TC-25 | PASS | — |
