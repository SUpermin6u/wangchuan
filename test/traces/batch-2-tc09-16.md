# Batch 2 Dry-Run Trace: TC-09 through TC-16

| TC | Verdict | Issue (if any) |
|----|---------|----------------|
| TC-09 | PASS | — |
| TC-10 | PASS | — |
| TC-11 | PASS | — |
| TC-12 | PASS | — |
| TC-13 | PASS | — |
| TC-14 | PASS | — |
| TC-15 | PASS | — |
| TC-16 | PASS | — |

## Trace Details

### TC-09: Add skill — single agent only

- **Routing:** "Add skill my-private-helper, Claude only" → matches "Add skill" → `skill-crud.md` → Add Skill ✓
- **Procedure:** Step 2 asks sync target (user already indicated "Claude only"). Step 4 ("specific agents, not all") copies to `~/.claude/skills/` locally + `~/.wangchuan/repo/agents/claude/skills/`. Step 5 pushes. ✓
- **Constraints:** ✓ Goes to `agents/claude/skills/` NOT `shared/`. ✓ Only copies to Claude's local dir.
- **Anti-patterns:** ✓ Not placed in shared/. ✓ No copy to other agents.

### TC-10: Modify shared skill

- **Routing:** "Update code-review skill" → matches "Update skill" → `skill-crud.md` → Modify Skill ✓
- **Procedure:** Step 3 checks `shared/skills/` → found (shared). Step 4 (shared path): auto-syncs to ALL agents without asking. Updates `shared/skills/` in repo + all local agent dirs. Step 6 pushes. ✓
- **Constraints:** ✓ Automatic sync (no question asked). ✓ Both repo and all local copies updated.
- **Anti-patterns:** ✓ No "sync to other agents?" for shared skills. ✓ All agents updated, not just one. ✓ Repo `shared/skills/` updated.

### TC-11: Modify agent-specific skill — promote to shared

- **Routing:** "Update my-helper skill" → matches "Update skill" → `skill-crud.md` → Modify Skill ✓
- **Procedure:** Step 3 checks `shared/skills/` → NOT found. Step 5 (not-shared path): asks "Sync to other agents?" → user selects "All" → uses `mv` from `agents/<agent>/skills/` to `shared/skills/`, copies to all local dirs. Step 6 pushes. ✓
- **Constraints:** ✓ Asks because not currently shared. ✓ "All" promotes to shared tier. ✓ Uses `mv` (move, not copy) — no duplicate.
- **Anti-patterns:** ✓ Does not skip asking for non-shared skills. ✓ No duplicate left in both locations.

### TC-12: Delete shared skill — from all agents

- **Routing:** "Delete code-review skill" → matches "Delete skill" → `skill-crud.md` → Delete Skill ✓
- **Procedure:** Step 2 informs user (shared, lists which agents have it). Step 3 asks "Remove from which agents?" → user selects "All". Step 4 (All path): removes from all local dirs + `shared/skills/` + `agents/*/skills/` in repo. Step 6 pushes. Step 7 confirms. ✓
- **Constraints:** ✓ Informs about shared status BEFORE asking scope. ✓ Asks confirmation. ✓ Both local + repo removed.
- **Anti-patterns:** ✓ Informs first. ✓ Asks scope. ✓ Local copies removed (not just repo).

### TC-13: Delete shared skill — partial removal

- **Routing:** "Delete code-review skill" → same as TC-12 → `skill-crud.md` → Delete Skill ✓
- **Procedure:** Step 2 informs (shared, all 3 agents). Step 3 asks scope → user selects "Claude only". Step 5 ("specific agents, not all"): removes from Claude locally. Then "Was shared + not all removed" sub-path: removes from `shared/skills/`, copies skill to remaining agents' `agents/{cursor,openclaw}/skills/` dirs. Step 6 pushes. ✓
- **Constraints:** ✓ Demoted from shared tier. ✓ Remaining agents (cursor, openclaw) get individual repo copies. ✓ Claude removed both locally and from repo.
- **Anti-patterns:** ✓ Not left in `shared/`. ✓ Only Claude removed (not all). ✓ Remaining agents get their own copies.

### TC-14: Delete agent-specific skill

- **Routing:** "Delete my-helper skill" → matches "Delete skill" → `skill-crud.md` → Delete Skill ✓
- **Procedure:** Step 2 informs (not shared, only Claude uses it). Step 3 asks scope (still asks even for single-agent). Step 5 "Was agent-specific" path: removes from `agents/claude/skills/` in repo + locally. Step 6 pushes. Step 7 confirms. ✓
- **Constraints:** ✓ Still informs + asks scope even for single-agent skills. ✓ Clean removal from both local and repo.
- **Anti-patterns:** ✓ Does not skip inform/ask. ✓ No orphan file in repo.

### TC-15: Push memory — no conflicts

- **Routing:** "Push memory" → matches → `push-memory.md` ✓
- **Procedure:** Step 1 `git pull --rebase`. Step 3 decrypts cloud version, compares with local — identical → skip, or different → proceed. Step 5 encrypts. Step 6 commits with `"Push memory from $(hostname) at $(date +%Y-%m-%d_%H:%M)"`. Step 7 cleans `/tmp/wangchuan_cloud_*`. Step 8 reports. ✓
- **Constraints:** ✓ Pulls before push. ✓ Compares before encrypting (skips if identical). ✓ Cleans /tmp. ✓ Commit message has hostname + timestamp.
- **Anti-patterns:** ✓ Does not push without pulling. ✓ No spurious diffs when unchanged. ✓ No leftover temp files.

### TC-16: Push memory — with conflict

- **Routing:** "Push memory" → same as TC-15 → `push-memory.md` ✓
- **Procedure:** Step 1 pulls. Step 3 decrypts cloud, compares. Step 4 (merge strategy): splits both versions by section headers (`#`, `##`, `###`). Sections only in one version → auto-included. Sections in both with different content → shows labeled CONFLICT block with both versions, offers [Keep local] [Keep cloud] [Manual merge]. Step 5 encrypts merged. Step 6 pushes. ✓
- **Constraints:** ✓ Section-level conflict detection. ✓ Both versions presented clearly. ✓ User chooses resolution. ✓ Non-conflicting sections auto-merged without asking.
- **Anti-patterns:** ✓ No silent overwrite of cloud. ✓ Section-level diff (not entire file). ✓ Non-conflicting additions not asked about.
