# WANGCHUAN WATCH DAEMON AUDIT REPORT

## EXECUTIVE SUMMARY

The watch daemon appears **structurally sound** but has several potential failure modes that could cause it to **silently skip updates**. The main concerns are:

1. **No polling actually happens on first tick** — The watch daemon only runs `pullFromCloud()` immediately on startup, then waits for the interval timer to fire. If the user's system time is wrong or the daemon is killed within minutes of startup, no polling occurs.

2. **Merge conflict handling doesn't rollback failed pulls** — If `git pull` succeeds but `restoreFromRepo` fails, the repo is left in a dirty state. The watch daemon logs the error but doesn't clean up, and the next poll might fail due to uncommitted merge conflicts.

3. **Sync lock doesn't block watch, but could interfere** — The watch daemon doesn't check the sync lock. However, if `cmdSync` holds the lock and fails, it leaves the sync-lock.json behind. The watch daemon could then get a "merge conflicts" error on pull if the sync partially modified files.

4. **No retry logic** — A transient fetch/pull error logs once and continues polling. The watch waits the full interval before retrying, during which remote changes are not detected.

5. **Error swallowing on watch conflicts** — The `handleWatchConflicts()` function silently returns if any intermediate step fails (missing files, git show fails, etc.). Users won't know the conflict was recorded.

6. **distributeShared NOT called during watch pull** — The watch daemon only calls `fetchAndCheckRemoteAhead()`, `git pull`, and `restoreFromRepo()`. It does NOT call `distributeShared()`, so shared skill/agent updates are not propagated to other agents during watch mode.

---

## DETAILED FINDINGS

### 1. DEFAULT POLL INTERVAL & REMOTE CHECK

**File:** `src/commands/watch.ts` lines 25, 112, 158–160

```typescript
const DEFAULT_INTERVAL_MINUTES = 5;
const intervalMinutes = interval ?? DEFAULT_INTERVAL_MINUTES;

// Periodic remote polling (pull-only)
const pollInterval = setInterval(() => {
  void pullFromCloud();
}, intervalMinutes * 60 * 1_000);
```

**How it checks for remote changes:**
- Uses `gitEngine.fetchAndCheckRemoteAhead(repoPath, branch)` (line 125)
- This calls `git fetch origin <branch>` then counts commits via `git log from:branch to:origin/branch` (git.ts:88–96)
- Returns 0 if local === remote, otherwise returns commit count

**Issues:**
- ✅ Remote polling interval is clear (default 5 minutes)
- ⚠️ **No exponential backoff or retry logic** — transient network errors cause it to skip one poll cycle
- ⚠️ **First tick timing is confusing** — `pullFromCloud()` runs immediately on line 177, then timer starts. If daemon crashes within 5 minutes, no polling occurs.

---

### 2. WATCH LOOP BEHAVIOR ON EACH TICK

**File:** `src/commands/watch.ts` lines 118–155

The `pullFromCloud()` function:

1. **Line 119:** Guards with `if (pulling) return;` — prevents concurrent pulls (good!)
2. **Line 125:** Calls `fetchAndCheckRemoteAhead()` — **YES** ✅
3. **Line 126–129:** If remote is NOT ahead (remoteAhead === 0), logs debug and returns early (good!)
4. **Line 134:** Calls `gitEngine.pull()` — **YES** ✅
5. **Line 137:** Calls `syncEngine.restoreFromRepo()` — **YES** ✅

**Critical Gap:** Does NOT call `distributeShared()`! 

**Does it pull if remote is ahead?**
- ✅ YES — line 134 calls `await gitEngine.pull()`
- ✅ YES — line 137 calls `await syncEngine.restoreFromRepo(cfg, agent)` to apply changes

**But merge conflict handling is fragile:**
- Line 147 catches errors and checks if message includes 'conflict' or '冲突'
- If conflicts exist, calls `handleWatchConflicts()` (line 148)
- Otherwise logs error and continues (line 150)
- **PROBLEM:** If `restoreFromRepo` partially fails (e.g., file permission error), the repo might be in a **dirty merge state** and the next pull could fail with "fatal: merge in progress"

---

### 3. ERROR HANDLING PATHS THAT SWALLOW ERRORS

**File:** `src/commands/watch.ts` lines 145–154

```typescript
catch (err) {
  const errorMsg = (err as Error).message;
  if (errorMsg.includes('conflict') || errorMsg.includes('\u51b7突')) {
    await handleWatchConflicts(cfg, repoPath, agent);
  } else {
    logger.error(t('watch.syncError', { error: errorMsg }));
  }
} finally {
  pulling = false;  // ⚠️ Reset flag even if error occurred
}
```

**Issues:**
1. ✅ Errors ARE logged (line 150)
2. ⚠️ **Merge conflicts are handled but not fully validated:**
   - `handleWatchConflicts()` silently returns if files don't exist (line 195)
   - `handleWatchConflicts()` silently returns if base version not found (line 208)
   - `handleWatchConflicts()` silently returns if merge fails (line 210)
   - No error logging if these intermediate steps fail
   - Users think conflict was handled, but might have been silently skipped

3. ⚠️ **Pulling flag reset despite errors** — If pull fails partway through, `pulling = false` (line 153) still executes, allowing next poll to retry immediately. But repo is left in a **dirty state** (merge in progress), causing next pull to fail.

---

### 4. LOGGING WHEN DETECTING REMOTE CHANGES

**File:** `src/commands/watch.ts` lines 125–131

```typescript
logger.step(t('watch.triggerSync', { reason: t('watch.reasonPoll'), time: timestamp() }));
const remoteAhead = await gitEngine.fetchAndCheckRemoteAhead(repoPath, branch);
if (remoteAhead === 0) {
  logger.debug(t('sync.remoteUpToDate'));  // Debug level, not visible
  return;
}
logger.info(t('sync.remoteAhead', { count: remoteAhead }));
```

**Logging:**
- ✅ `logger.step()` shows when poll triggers (line 122)
- ✅ `logger.info()` shows when remote is ahead (line 131)
- ✅ `logger.ok()` shows pull summary (line 139)
- ✅ `logger.error()` shows sync errors (line 150)
- ⚠️ When remote is up-to-date, only **debug-level** log (line 127) — users won't see "nothing to do"
- ⚠️ When pull succeeds but `restoreFromRepo` returns 0 synced files, no log (line 138 condition)

---

### 5. SYNC LOCK INTERFERENCE

**File:** `src/core/sync-lock.ts`

The watch daemon **does NOT check or use the sync lock**. This is a design choice.

**However, watch can be BLOCKED if:**
1. `cmdSync` is running and holds `sync-lock.json`
2. Watch tries to run `git pull` while cmdSync is staging files — could cause merge conflicts
3. Sync lock file exists but process is dead — next `cmdSync` cleans it up, but watch already has repo state corruption

**Potential race condition:**
- Time T1: `cmdSync` acquires lock, starts staging files to repo
- Time T2: Watch runs, tries to `git pull` — GIT ERROR: "cannot pull while merge in progress" or "dirty index"
- Time T3: Watch catches error, tries to handle as conflict, but actually repo is in sync's staging state
- Time T4: `cmdSync` releases lock, removes lock file
- Time T5: Next watch poll retries pull — but repo is now in unknown state

**Issue:** No coordination between watch and sync. Watch should respect the lock or fail gracefully.

---

### 6. DISTRIBUTESHA SHARED CALL

**File:** `src/commands/watch.ts`

The watch daemon **does NOT call `distributeShared()`** at all!

**In sync.ts (line 214):**
```typescript
stageResult = await syncEngine.stageToRepo(cfg, agent, filter, yes, skipShared, skipStaleDetection);
```

This triggers `distributeShared()` internally before push.

**But in watch.ts, there is NO equivalent call.** The watch daemon only:
1. `fetchAndCheckRemoteAhead()`
2. `git pull`
3. `restoreFromRepo()`

**Impact:**
- ⚠️ If a shared skill is updated in the cloud by one agent, the watch daemon pulls it to the repo
- ⚠️ But `restoreFromRepo()` only copies files back to the **specific agent** being watched (or all if `agent` is undefined)
- ⚠️ Other agents that should receive this shared resource do NOT receive it until they run `wangchuan sync`
- ⚠️ This defeats the purpose of the watch daemon as a real-time sync daemon

**Example:**
1. Agent A pushes a new shared skill to cloud
2. Watch daemon running on Agent B pulls changes from cloud
3. Skill is restored to Agent B's workspace
4. But Agent C is NOT notified or updated — it only sees the skill if Agent C runs `wangchuan sync` manually

---

### 7. MERGE CONFLICT HANDLING

**File:** `src/commands/watch.ts` lines 145–234

```typescript
catch (err) {
  if (errorMsg.includes('conflict') || errorMsg.includes('\u51b7突')) {
    await handleWatchConflicts(cfg, repoPath, agent);
  } else {
    logger.error(t('watch.syncError', { error: errorMsg }));
  }
}
```

**What happens if merge conflict during pull:**

1. `git pull` fails with merge conflict error (simple-git throws)
2. Repo is now in **merge in progress** state (`.git/MERGE_HEAD` exists)
3. `handleWatchConflicts()` is called (line 148):
   - Iterates through file entries (line 194)
   - For .md/.txt files, attempts 3-way merge (line 210)
   - If merge succeeds, writes resolved content (line 213)
   - If merge fails, saves to pending-conflicts.json (line 231)
   - **But never calls `git add` or `git commit` or `git merge --abort`**

4. **CRITICAL ISSUE:** After `handleWatchConflicts()` returns, repo is still in merge state!
   - `.git/MERGE_HEAD` still exists
   - `pulling = false` (line 153) allows next poll to proceed
   - Next poll tries `git pull` again — **ERROR: "fatal: there is no merge to abort"**

**No rollback:** If merge fails, watch should run `git merge --abort` to clean up, but it doesn't!

---

### 8. SKIPSHARED FLAG

**File:** `src/commands/sync.ts` lines 67–91

The `skipShared` flag is used by `cmdSync()`:
- Line 85: Skip pending distributions check if `skipShared === true`
- Line 91: Skip pending conflicts check if `skipShared === true`
- Line 106: Skip pending deletions check if `skipShared === true`
- Line 214: Pass to `stageToRepo()` which calls `distributeShared()`

**But the watch daemon does NOT use `skipShared` at all.** There's no skipShared flag in `WatchOptions`.

**Impact:**
- Watch daemon has NO way to opt out of shared distribution
- But watch also doesn't CALL distributeShared, so skipShared doesn't matter

---

### 9. SYNC LOCK FILE STALENESS

**File:** `src/core/sync-lock.ts` lines 54–90

The sync lock:
- Written when `cmdSync` starts (line 73)
- Contains `{ startedAt, pid }` (lines 66–69)
- Released when `cmdSync` finishes (line 149 in sync.ts)

**Stale lock detection (line 56):**
```typescript
if (existing) {
  if (isPidAlive(existing.pid)) {
    throw new Error(t('syncLock.anotherRunning', { pid: existing.pid }));
  }
  // Stale lock — dead process, clean up
  logger.warn(t('syncLock.staleLock', { pid: existing.pid }));
  await this.cleanDirtyState(repoPath);
  this.release();
}
```

**Issues:**
1. ✅ Stale lock IS detected (PID no longer alive)
2. ✅ Dirty state IS cleaned (calls `git reset --hard`)
3. ⚠️ But watch daemon never checks the lock! So watch never knows if sync crashed and left dirty state

**Scenario:**
1. `cmdSync` acquires lock
2. `cmdSync` stages files to repo (repo now dirty)
3. `cmdSync` crashes before releasing lock
4. Watch daemon runs and tries `git pull` — **ERROR: "Your local changes to files would be overwritten"**
5. Watch catches error, tries to handle as conflict, but isn't really a conflict
6. Next `cmdSync` detects stale lock, cleans dirty state, but watch is already confused

---

## SUMMARY TABLE OF ISSUES

| Issue | Severity | Impact | Evidence |
|-------|----------|--------|----------|
| No distributeShared call in watch | **CRITICAL** | Shared skills not propagated in real-time | watch.ts: no distributeShared call |
| Merge conflict doesn't rollback repo | **HIGH** | Repo left in merge state, next poll fails | watch.ts:148, no git merge --abort |
| Sync lock not checked by watch | **HIGH** | Watch can conflict with sync | sync-lock.ts checked only by cmdSync |
| Dirty state from failed sync not cleaned | **MEDIUM** | Watch hits "local changes" error | watch.ts no sync lock awareness |
| No retry logic for transient errors | **MEDIUM** | Single network error skips 5-min window | watch.ts:158, no retry |
| Conflict handling errors silently swallow failures | **MEDIUM** | Conflicts recorded to pending but might fail | watch.ts:195–208, no error logging |
| Debug-level logging for "up to date" | **LOW** | Users see no output when nothing to do | watch.ts:127 uses logger.debug |

---

## RECOMMENDATIONS

### 1. **Add merge abort on conflict failure**
```typescript
async function pullFromCloud(): Promise<void> {
  try {
    // ...
    await gitEngine.pull(repoPath, branch);
  } catch (err) {
    // Check if repo is in merge state
    const inMerge = fs.existsSync(path.join(repoPath, '.git', 'MERGE_HEAD'));
    if (inMerge) {
      logger.warn('Aborting incomplete merge...');
      await gitEngine.mergeAbort(repoPath); // Add this
    }
    throw err;
  }
}
```

### 2. **Check sync lock before watch poll**
```typescript
async function pullFromCloud(): Promise<void> {
  if (syncLock.exists()) {
    logger.debug('Sync in progress, skipping this poll');
    return;
  }
  // ... proceed with pull
}
```

### 3. **Add distributeShared to watch mode**
```typescript
const result = await syncEngine.restoreFromRepo(cfg, agent);
// NEW: distribute shared resources to other agents
syncEngine.distributeShared(cfg);
```

### 4. **Add exponential backoff for transient errors**
```typescript
let retryCount = 0;
const pullWithRetry = async () => {
  try {
    await pullFromCloud();
    retryCount = 0; // reset on success
  } catch (err) {
    retryCount++;
    if (retryCount < 3) {
      logger.warn(`Pull failed, will retry in ${Math.min(30, intervalMinutes * retryCount)} seconds`);
      setTimeout(pullWithRetry, Math.min(30 * 1000, intervalMinutes * retryCount * 1000));
    } else {
      logger.error('Max retries exceeded');
    }
  }
};
```

### 5. **Add error logging to handleWatchConflicts**
```typescript
for (const entry of entries) {
  if (!fs.existsSync(entry.srcAbs)) {
    logger.debug(`Conflict file missing: ${entry.srcAbs}`);
    continue;
  }
  // ... existing code
}
```

### 6. **Log when pull completes with no changes**
```typescript
if (result.synced.length > 0) {
  logger.ok(t('sync.pullSummary', { ... }));
} else {
  logger.info('Pull succeeded, no new files to restore');
}
```

---

## CONCLUSION

The watch daemon is **functional but fragile**. The main production issues are:

1. **No shared resource distribution** — watch doesn't propagate shared skills/agents to other agents
2. **Incomplete merge conflict cleanup** — repo can be left in merge state
3. **No sync lock awareness** — potential for watch and sync to interfere

These should be fixed before deploying watch as the primary real-time sync mechanism.

