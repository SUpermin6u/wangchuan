# WATCH DAEMON AUDIT — DIRECT ANSWERS TO YOUR QUESTIONS

## Q1: Default poll interval? How does it check for remote changes?

**Answer:**
- **Default interval:** 5 minutes (`DEFAULT_INTERVAL_MINUTES = 5` at line 25)
- **How it checks for remote changes:**
  1. Calls `gitEngine.fetchAndCheckRemoteAhead(repoPath, branch)` (line 125)
  2. This runs `git fetch origin <branch>` to get remote updates
  3. Compares local branch SHA vs. remote branch SHA
  4. Counts commits between them using `git log from:branch to:origin/branch`
  5. Returns number of commits remote is ahead (0 = up to date)

**Evidence:** src/commands/watch.ts:25, 112, 158–160; src/core/git.ts:88–96

---

## Q2: What does watch loop do each tick? fetchAndCheckRemoteAhead? git pull + restoreFromRepo?

**Answer:**

Each tick (every 5 minutes):

1. ✅ **YES calls `fetchAndCheckRemoteAhead()`** (line 125)
   - Detects remote has new commits
   - If 0 commits, returns early (no action needed)
   - If > 0 commits, proceeds to pull

2. ✅ **YES calls `git pull`** (line 134)
   - Actual pull happens here: `await gitEngine.pull(repoPath, branch)`
   - Uses `git pull origin <branch>` with `--rebase: false`

3. ✅ **YES calls `restoreFromRepo()`** (line 137)
   - Copies pulled changes from repo back to agent workspaces
   - Applies decryption, restores credentials, etc.

**Critical Gap:** ❌ **Does NOT call `distributeShared()`** 
- This means shared skills/agents are NOT propagated to other agents during watch pull
- Users must run manual `wangchuan sync` to distribute shared resources

**Evidence:** src/commands/watch.ts:118–155

---

## Q3: Error handling paths that silently swallow errors and skip pull?

**Answer:**

**Errors are NOT silently swallowed — they ARE logged.** But there are fragility issues:

1. ✅ `logger.error()` is called for non-conflict errors (line 150)
2. ✅ Conflict errors trigger `handleWatchConflicts()` (line 148)

**BUT — problematic silent failures in `handleWatchConflicts()`:**

- Line 195: If source file doesn't exist → silently skips (no log)
- Line 197: If repo file doesn't exist → silently skips (no log)
- Line 208: If `git show HEAD~1` fails → silently returns (no log about why base version not found)
- Line 210: If 3-way merge fails → silently continues (but only saves conflicts if `hasConflicts === true`)

**Critical issue:** Repo left in dirty state after errors:
- If `git pull` succeeds but `restoreFromRepo()` fails → repo has unpulled changes, next poll will fail
- `pulling = false` (line 153) resets flag even if error occurred
- Next poll tries `git pull` again but repo is in dirty/merge state → fails again

**Evidence:** src/commands/watch.ts:145–154, 186–234

---

## Q4: Does watch daemon log when it detects remote changes? Or when it skips?

**Answer:**

| Scenario | Logging Level | Visible? |
|----------|---------------|----------|
| Poll triggered | `logger.step()` line 122 | ✅ YES |
| Remote has commits | `logger.info()` line 131 | ✅ YES |
| Pull succeeded | `logger.ok()` line 139 | ✅ YES (if synced.length > 0) |
| Remote is up-to-date | `logger.debug()` line 127 | ❌ NO (debug-level) |
| Pull has 0 synced files | No log | ❌ NO |
| Error occurs | `logger.error()` line 150 | ✅ YES |

**Issue:** Users won't see logs when "nothing to do" because up-to-date status is at debug level.

**Evidence:** src/commands/watch.ts:122–143

---

## Q5: Is there a sync lock that could prevent watch from pulling?

**Answer:**

**Design:** Watch daemon **does NOT check or use sync lock**. This is intentional — watch is pull-only.

**BUT — potential race condition exists:**

1. `cmdSync` acquires `sync-lock.json` with its PID
2. `cmdSync` stages files to repo (repo becomes dirty)
3. Watch poll tries `git pull` → **ERROR: "Your local changes would be overwritten"**
4. Watch tries to handle as conflict but it's actually sync's staged changes
5. `cmdSync` finishes and releases lock
6. Repo is now in corrupted state

**Stale lock detection:**
- ✅ `syncLock.acquire()` detects dead PID (line 57)
- ✅ Cleans dirty state with `git reset --hard` (line 62)
- ❌ But watch never checks — so watch doesn't benefit from cleanup

**Evidence:** src/core/sync-lock.ts:54–90; src/commands/watch.ts has no syncLock import or usage

---

## Q6: Does watch daemon call `distributeShared`? Could that interfere?

**Answer:**

**No, watch daemon does NOT call `distributeShared()` at all.**

**Files that SHOULD have it:**
- `src/commands/sync.ts` line 214 calls `stageToRepo()` which eventually triggers `distributeShared()` before push
- `src/commands/watch.ts` — **NO CALL TO distributeShared**

**Impact — shared skills NOT propagated in real-time:**
1. Agent A pushes new shared skill to cloud
2. Watch daemon on Agent B pulls it from cloud ✅
3. Skill restored to Agent B's workspace ✅
4. Shared registry updated ❌ NO — never happens
5. Agent C does NOT receive skill until they manually run `wangchuan sync` ❌
6. This defeats the purpose of real-time watch daemon

**Could interference occur?** No — because watch doesn't call it. But watch SHOULD call it.

**Evidence:** src/commands/watch.ts:118–155 (no distributeShared); src/commands/sync.ts:214 (has it)

---

## Q7: What happens if watch daemon encounters merge conflict during pull?

**Answer:**

**Scenario: Remote has conflicting changes**

1. `git pull` is called (line 134)
2. Git detects conflict, throws error with "conflict" in message
3. **Repo is now in MERGE IN PROGRESS state** (`.git/MERGE_HEAD` exists)
4. Watch catches error (line 145)
5. Checks if message includes 'conflict' (line 147) → YES
6. Calls `handleWatchConflicts()` (line 148)

**Inside `handleWatchConflicts()`:**
- For `.md` and `.txt` files: attempts 3-way merge (line 210)
- If merge succeeds: writes resolved content (line 213) ✅
- If merge fails: saves conflict snippets to pending-conflicts.json (line 231) ✅

**BUT — CRITICAL BUG:**
- `handleWatchConflicts()` **never calls `git add`, `git commit`, or `git merge --abort`**
- Repo is left in merge state!
- `pulling = false` (line 153) allows next poll to proceed
- Next poll tries `git pull` again → **ERROR: "fatal: there is no merge to abort"**

**What SHOULD happen:**
- After resolving conflicts: `git add .` then `git commit` to complete merge
- If can't resolve: `git merge --abort` to rollback
- Currently: neither happens!

**Evidence:** src/commands/watch.ts:145–234; lines 210–231 have no git commit/merge calls

---

## Q8: Is there a `skipShared` flag preventing pulling shared resources?

**Answer:**

**No relevant `skipShared` flag for watch daemon.**

In `cmdSync()`:
- `skipShared` flag exists (line 67)
- Used to skip pending distributions check (line 85)
- Used to skip pending conflicts check (line 91)
- Used to skip pending deletions check (line 106)
- Passed to `stageToRepo()` (line 214)

In `cmdWatch()`:
- `WatchOptions` type has NO `skipShared` field (src/types.ts)
- Watch daemon cannot opt out of anything
- Watch daemon doesn't call `distributeShared()` anyway, so flag wouldn't matter

**Evidence:** src/commands/sync.ts:67; src/commands/watch.ts:95 (no skipShared in WatchOptions)

---

## CRITICAL SYNC LOCK ISSUES

### sync-lock.ts — Could a stale lock file block the watch?

**Answer:**

**Not block watch, but can CONFUSE watch:**

1. ✅ Stale lock detection works: if PID is dead, lock is released (line 62)
2. ✅ `git reset --hard` cleans dirty state (line 116)
3. ❌ **But watch daemon doesn't know about lock or dirty state**
4. ❌ If sync crashes during `stageToRepo()`, watch hits dirty repo error and misinterprets it as merge conflict

**Scenario:**
- Time T1: `cmdSync` acquires lock, starts staging files
- Time T2: Process crashes (e.g., SIGKILL)
- Time T3: Sync lock file left behind with dead PID
- Time T4: Watch runs, tries `git pull` → ERROR: "Your local changes to files would be overwritten"
- Time T5: Watch tries to handle as conflict, but it's actually sync's staged files
- Time T6: Next `cmdSync` runs, detects stale lock, cleans dirty state with `git reset --hard`
- Time T7: Watch repo state is now unknown (conflicting with time T6 reset)

**Evidence:** src/core/sync-lock.ts:54–90; watch.ts has no sync lock awareness

---

## DOES `cmdSync` ACQUIRE A LOCK THAT BLOCKS WATCH?

**Answer:**

**Design: NO — watch does not check lock, so watch is not blocked.**

But potential for interference:

1. `cmdSync` acquires lock (sync.ts line 137)
2. `cmdSync` calls `stageToRepo()` which modifies repo (line 214)
3. Watch polls during this time → tries `git pull` while repo is being modified
4. Git error: "Your local changes would be overwritten by merge"
5. Watch mishandles as merge conflict

**The lock DOES prevent concurrent `cmdSync` operations:**
- If sync A is running, sync B throws "another sync running" (sync-lock.ts line 58)
- This is correct

**But lock does NOT prevent watch from running during sync:**
- Watch should respect the lock or fail gracefully
- Currently watch doesn't know about lock

**Evidence:** src/commands/sync.ts:137 (acquire lock); src/commands/watch.ts (no lock check)

---

## SUMMARY: ISSUES THAT CAUSE WATCH TO SILENTLY FAIL TO PULL UPDATES

| Issue | Severity | How to Reproduce |
|-------|----------|-----------------|
| **No `distributeShared()` call** | CRITICAL | Create shared skill in Agent A, push with sync; watch on Agent B pulls but doesn't distribute to Agent C |
| **Merge state not cleaned up** | HIGH | Create conflicting edit in two branches; watch gets merge error but leaves repo in merge state; next poll fails |
| **Sync lock race condition** | HIGH | Kill `cmdSync` during push; leave lock file; watch tries pull during sync's staging → dirty index error |
| **Transient network error** | MEDIUM | Network flaky for one poll; watch logs error and waits 5 mins; remote changes missed |
| **Conflict handling silent failures** | MEDIUM | Create edge case (base version not found, missing files); watch logs nothing about failure |
| **Debug-level "up to date" log** | LOW | User runs watch, sees no output, assumes it crashed or is stuck |

