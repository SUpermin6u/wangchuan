# Wangchuan Skill Benchmark

This file defines test cases for verifying the wangchuan skill behaves correctly when an AI agent loads it and receives user instructions.

Each TC specifies:
- **Instruction**: What the user says
- **Trigger**: Should the skill activate?
- **Expected behavior**: What the agent should do
- **Critical constraints**: Must-have behaviors
- **Anti-patterns**: Must-NOT-do behaviors

---

## TC-01: Fresh initialization (no existing repo)

**Instruction:** "Initialize wangchuan"

**Trigger:** Yes → `references/init.md`

**Expected behavior:**
1. Check if `~/.wangchuan/` exists
2. Ask user if they have an existing repo
3. User says no → create `~/.wangchuan/` dir
4. Generate master.key with `openssl rand -base64 32`
5. Copy encrypt/decrypt scripts to `~/.wangchuan/scripts/`
6. Ask for git repo URL (or offer `gh repo create`)
7. Clone repo, create directory structure
8. Detect installed agents
9. Scan skills, identify shared vs agent-specific
10. Encrypt memory files, push to repo
11. Output summary with key fingerprint warning

**Critical constraints:**
- master.key must be chmod 600
- ~/.wangchuan dir must be chmod 700
- Must warn user to save master.key
- Must detect agents by checking directory existence

**Anti-patterns:**
- Skip asking about existing repo
- Hardcode agent paths without detection
- Push unencrypted memory to repo
- Proceed without git repo URL

---

## TC-02: Initialization with existing repo (redirect to restore)

**Instruction:** "Initialize wangchuan"

**Trigger:** Yes → `references/init.md`

**Expected behavior:**
1. Check `~/.wangchuan/` — doesn't exist
2. Ask user if they have an existing repo
3. User says "yes, I have a repo" → redirect to restore flow
4. Ask for repo URL + master.key

**Critical constraints:**
- Must redirect to restore.md flow, not continue init
- Must ask for BOTH repo URL and master.key

**Anti-patterns:**
- Create a new key when user has existing repo
- Skip asking for master.key

---

## TC-03: Re-initialization (wangchuan already exists)

**Instruction:** "Initialize wangchuan"

**Trigger:** Yes → `references/init.md`

**Expected behavior:**
1. Check `~/.wangchuan/` — exists
2. Ask user: "Wangchuan is already initialized. Re-initialize?"
3. If user says yes → remove and recreate
4. If user says no → abort

**Critical constraints:**
- Must confirm before destroying existing config
- Must not silently overwrite

**Anti-patterns:**
- Auto-delete without confirmation
- Proceed without checking existing state

---

## TC-04: Restore on new machine

**Instruction:** "Restore wangchuan"

**Trigger:** Yes → `references/restore.md`

**Expected behavior:**
1. Ask for repo URL and master.key
2. Create `~/.wangchuan/` directory
3. Save master.key (chmod 600)
4. Install encrypt/decrypt scripts
5. Git clone the repo
6. Detect local agents
7. For each detected agent: decrypt memory, copy skills (shared + agent-specific)
8. Write config.json
9. Output restore summary

**Critical constraints:**
- Must accept key as file path OR base64 string
- Must only restore to agents that are actually installed locally
- Shared skills must be copied to ALL detected agents
- Memory files must be decrypted before writing to agent dirs

**Anti-patterns:**
- Skip agent detection, assume all agents present
- Write encrypted content to agent memory file
- Fail silently if an agent has no repo data

---

## TC-05: Restore with partial agent coverage

**Instruction:** "Restore memories" (only Claude installed, repo has Claude + Cursor + OpenClaw data)

**Trigger:** Yes → `references/restore.md`

**Expected behavior:**
1. Clone repo (has data for 3 agents)
2. Detect only Claude locally
3. Restore ONLY Claude's memory and skills
4. Skip Cursor and OpenClaw without error
5. Report: "Restored: claude. Skipped (not installed): cursor, openclaw"

**Critical constraints:**
- Only operate on locally detected agents
- No errors for missing agents

**Anti-patterns:**
- Try to create ~/.cursor or ~/.openclaw
- Error out because cursor/openclaw not found

---

## TC-06: View shared skill

**Instruction:** "Show skill code-review"

**Trigger:** Yes → `references/skill-crud.md` → View Skill

**Expected behavior:**
1. Search for "code-review" in shared/skills/, agents/*/skills/, and local dirs
2. Found in `shared/skills/` → report as shared
3. Check which agents have it locally
4. Compare local vs repo version
5. Output formatted status (type, agents using it, sync status)

**Critical constraints:**
- Must search all locations (shared + per-agent + local)
- Must report sync status (local vs repo comparison)
- Must indicate whether shared or agent-specific

**Anti-patterns:**
- Only check one location
- Skip sync status check
- Show raw file content without metadata

---

## TC-07: View non-existent skill

**Instruction:** "Show skill nonexistent-xyz"

**Trigger:** Yes → `references/skill-crud.md` → View Skill

**Expected behavior:**
1. Search all locations
2. Not found anywhere
3. Report: "Skill 'nonexistent-xyz' not found"
4. Optionally suggest similar names if partial matches exist

**Critical constraints:**
- Clear "not found" message
- No errors or crashes

**Anti-patterns:**
- Crash or show error traceback
- Create the skill automatically

---

## TC-08: Add skill — sync to all agents

**Instruction:** "Add a git-commit-helper skill"

**Trigger:** Yes → `references/skill-crud.md` → Add Skill

**Expected behavior:**
1. Help user define skill content (or use already created file)
2. Ask: "Sync to other agents?"
3. Present options: [Current agent only] [Claude] [Cursor] [OpenClaw] [All]
4. User selects "All"
5. Copy to `shared/skills/` in repo
6. Copy to ALL local agent skills dirs
7. git add + commit + push

**Critical constraints:**
- MUST ask about sync target before proceeding
- "All" → goes to shared/skills/ (not per-agent)
- Must copy to local agent dirs too (not just repo)
- Must git push after

**Anti-patterns:**
- Skip asking about sync target
- Put in shared/ but forget local copies
- Forget to git push

---

## TC-09: Add skill — single agent only

**Instruction:** "Add skill my-private-helper, Claude only"

**Trigger:** Yes → `references/skill-crud.md` → Add Skill

**Expected behavior:**
1. Create skill file
2. User indicates "only Claude"
3. Copy to `~/.claude/skills/`
4. Copy to `~/.wangchuan/repo/agents/claude/skills/`
5. NOT in shared/skills/
6. git push

**Critical constraints:**
- Goes to agents/claude/skills/ NOT shared/
- Only copies to Claude's local dir

**Anti-patterns:**
- Put in shared/ even though user said only Claude
- Copy to other agents

---

## TC-10: Modify shared skill

**Instruction:** "Update code-review skill, add a rule: check for unit tests"

**Trigger:** Yes → `references/skill-crud.md` → Modify Skill

**Expected behavior:**
1. Find skill file (in shared/skills/)
2. Detect it's a shared skill
3. Apply modification
4. AUTO-sync to all agents (no need to ask — it's already shared)
5. Update `shared/skills/` in repo
6. Copy updated file to all local agent dirs
7. git push

**Critical constraints:**
- Shared skill modification = automatic sync to all agents
- Must NOT ask "sync to other agents?" for shared skills
- Must update both repo and all local copies

**Anti-patterns:**
- Ask about sync target for an already-shared skill
- Only update one agent's local copy
- Forget to update repo shared/skills/

---

## TC-11: Modify agent-specific skill — promote to shared

**Instruction:** "Update my-helper skill"

**Trigger:** Yes → `references/skill-crud.md` → Modify Skill

**Expected behavior:**
1. Find skill — it's in agents/claude/skills/ (not shared)
2. Apply modification
3. Ask: "Sync to other agents?"
4. User selects "All"
5. Move from agents/claude/skills/ to shared/skills/
6. Copy to all local agent dirs
7. git push

**Critical constraints:**
- Must ask because it's NOT currently shared
- Selecting "All" promotes to shared tier
- Must MOVE (not copy) from agent-specific to shared in repo

**Anti-patterns:**
- Skip asking for non-shared skills
- Leave duplicate in both shared/ and agents/claude/skills/

---

## TC-12: Delete shared skill — from all agents

**Instruction:** "Delete code-review skill"

**Trigger:** Yes → `references/skill-crud.md` → Delete Skill

**Expected behavior:**
1. Find skill — it's in shared/skills/
2. Inform user: "This is a shared skill, currently used by Claude, Cursor, OpenClaw"
3. Ask: "Remove from which agents?"
4. User selects "All"
5. Remove from all local agent dirs
6. Remove from shared/skills/ in repo
7. git push
8. Confirm deletion

**Critical constraints:**
- Must inform about shared status BEFORE asking for deletion scope
- Must ask confirmation (which agents to remove from)
- Must remove from BOTH local dirs and repo

**Anti-patterns:**
- Delete without informing it's shared
- Delete without asking scope
- Only remove from repo but leave local copies

---

## TC-13: Delete shared skill — partial removal

**Instruction:** "Delete code-review skill" → user selects only "Claude"

**Trigger:** Yes → `references/skill-crud.md` → Delete Skill

**Expected behavior:**
1. Find skill in shared/skills/
2. Inform: shared skill, used by all 3 agents
3. Ask scope → user picks "Claude only"
4. Remove from Claude's local dir
5. Since not all agents removed:
   - Remove from shared/skills/ in repo
   - Copy skill to agents/cursor/skills/ and agents/openclaw/skills/
6. git push

**Critical constraints:**
- Shared skill partially deleted → demoted from shared tier
- Remaining agents get individual copies in their agent dirs
- Claude's copy removed both locally and from repo

**Anti-patterns:**
- Leave in shared/ (only some agents have it now)
- Remove from ALL agents when user only said Claude
- Forget to give remaining agents their own repo copies

---

## TC-14: Delete agent-specific skill

**Instruction:** "Delete my-helper skill" (exists only in Claude)

**Trigger:** Yes → `references/skill-crud.md` → Delete Skill

**Expected behavior:**
1. Find skill in agents/claude/skills/
2. Inform: "This is not a shared skill, only Claude uses it"
3. Ask scope (still ask for confirmation)
4. Remove from Claude local dir
5. Remove from agents/claude/skills/ in repo
6. git push

**Critical constraints:**
- Still inform about status and ask scope even for single-agent skills
- Clean removal from both local and repo

**Anti-patterns:**
- Skip informing/asking because it's only one agent
- Leave orphan file in repo

---

## TC-15: Push memory — no conflicts

**Instruction:** "Push memory"

**Trigger:** Yes → `references/push-memory.md`

**Expected behavior:**
1. `git pull --rebase` in repo
2. Read config for enabled agents
3. For each agent: read local memory, decrypt cloud memory
4. Compare — local has new content, cloud unchanged
5. Encrypt local memory → write to repo
6. git add + commit + push
7. Cleanup temp files
8. Report summary

**Critical constraints:**
- Must pull before push (get latest cloud state)
- Must compare before encrypting (skip if identical)
- Must cleanup /tmp files after
- Commit message includes hostname and timestamp

**Anti-patterns:**
- Push without pulling first
- Re-encrypt and push when nothing changed (spurious git diffs)
- Leave decrypted temp files around

---

## TC-16: Push memory — with conflict

**Instruction:** "Push memory" (cloud has changes in same section as local)

**Trigger:** Yes → `references/push-memory.md`

**Expected behavior:**
1. Pull latest
2. Decrypt cloud memory
3. Compare with local — detect conflicting section
4. Show diff to user with clear labels
5. Let user choose resolution (keep local / keep cloud / manual merge)
6. Apply choice, encrypt merged result, push

**Critical constraints:**
- Must detect conflicts at section level (by headers)
- Must present both versions clearly
- Must let user choose resolution strategy
- Non-conflicting sections auto-merged without asking

**Anti-patterns:**
- Silently overwrite cloud with local
- Show entire file diff instead of section-level
- Ask about non-conflicting additions

---

## TC-17: Push memory — first push (no cloud data)

**Instruction:** "Push memory" (repo has no memory files yet)

**Trigger:** Yes → `references/push-memory.md`

**Expected behavior:**
1. Pull (nothing to pull for memory)
2. No .enc file in repo → skip comparison
3. Encrypt local memory directly
4. Push

**Critical constraints:**
- No decrypt attempt when .enc doesn't exist
- Straightforward encrypt-and-push

**Anti-patterns:**
- Error because .enc file not found
- Try to decrypt non-existent file

---

## TC-18: Pull memory — no conflicts

**Instruction:** "Pull memory"

**Trigger:** Yes → `references/pull-memory.md`

**Expected behavior:**
1. `git pull --rebase` in repo
2. For each agent: decrypt cloud memory
3. Compare with local
4. Cloud has additions → append to local
5. Write merged content to agent's memory file
6. Report summary

**Critical constraints:**
- Must not lose local-only content
- Cloud additions appended (not overwrite)
- Suggest "push memory" if local has content not in cloud

**Anti-patterns:**
- Overwrite local with cloud content
- Lose local additions that cloud doesn't have

---

## TC-19: Pull memory — with conflict

**Instruction:** "Pull memory" (local and cloud have diverged)

**Trigger:** Yes → `references/pull-memory.md`

**Expected behavior:**
1. Pull latest
2. Decrypt, compare with local
3. Detect conflicting sections
4. Present diff, ask user for resolution
5. Write merged result to local

**Critical constraints:**
- Same conflict resolution as push (section-level)
- User gets to choose for each conflict

**Anti-patterns:**
- Auto-overwrite local with cloud
- Silently drop cloud changes

---

## TC-20: Pull memory — also syncs shared skills

**Instruction:** "Pull memory"

**Trigger:** Yes → `references/pull-memory.md`

**Expected behavior:**
1. Pull and restore memories (normal flow)
2. Additionally check shared skills in repo vs local
3. If repo has newer shared skills → update local copies
4. Report any skill updates in summary

**Critical constraints:**
- Skill sync is a bonus during pull, not the primary action
- Only shared skills are checked (not agent-specific from other agents)

**Anti-patterns:**
- Skip skill sync entirely
- Overwrite local skill modifications without notice

---

## TC-21: Trigger — should NOT trigger for general git

**Instruction:** "Help me git push the current project"

**Trigger:** No — this is a general git operation, not wangchuan

**Expected behavior:**
- Execute normal git push in current directory
- Do NOT activate wangchuan skill

**Anti-patterns:**
- Activate wangchuan and try to push memories

---

## TC-22: Trigger — should trigger for implicit sync request

**Instruction:** "I switched to a new computer, how do I restore my Claude memories?"

**Trigger:** Yes → route to restore flow

**Expected behavior:**
- Recognize this as a wangchuan restore scenario
- Check if wangchuan is initialized
- If not, guide user through restore

**Critical constraints:**
- Should trigger even without explicit "wangchuan" keyword
- Context about "new machine" + "restore memories" = wangchuan

---

## TC-23: Trigger — should NOT trigger for unrelated AI questions

**Instruction:** "How do I call the Claude API?"

**Trigger:** No — this is about Claude API, not agent memory sync

**Anti-patterns:**
- Activate wangchuan skill

---

## TC-24: Error handling — git push rejection

**Instruction:** "Push memory" (remote has diverged)

**Trigger:** Yes → `references/push-memory.md`

**Expected behavior:**
1. Pull fails with conflicts
2. Try `git rebase --abort` + `git pull --ff-only`
3. If still fails → report to user clearly
4. Do NOT silently lose data

**Critical constraints:**
- Must attempt recovery (rebase abort + ff-only)
- Must report failure clearly if unrecoverable
- Never force push

**Anti-patterns:**
- `git push --force`
- Silent failure
- Lose encrypted data

---

## TC-25: Not initialized — non-init operation

**Instruction:** "Push memory" (but ~/.wangchuan/config.json doesn't exist)

**Trigger:** Yes (skill triggers), but pre-check fails

**Expected behavior:**
1. Run pre-check: `test -f ~/.wangchuan/config.json` → fails
2. Tell user: "Wangchuan is not initialized. Say 'initialize wangchuan' or 'restore wangchuan' first."
3. Do NOT proceed with push

**Critical constraints:**
- Pre-check MUST happen before any operation (except init/restore)
- Clear guidance on what to do next

**Anti-patterns:**
- Try to push without config
- Auto-initialize without asking
