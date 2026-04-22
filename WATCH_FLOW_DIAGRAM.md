# WATCH DAEMON EXECUTION FLOW

## Current Implementation (watch.ts)

```
START cmdWatch()
  │
  ├─ Check singleton (PID file)
  ├─ Load config
  ├─ Resolve git branch
  │
  ├─ RUN IMMEDIATELY: await pullFromCloud()  ← First tick
  │   └─ (see pullFromCloud flow below)
  │
  └─ SET INTERVAL: every 5 minutes → pullFromCloud()
     └─ (loop continues)
```

## pullFromCloud() Function

```
pullFromCloud() [guard: if (pulling) return; ]
  │
  ├─ STEP 1: fetchAndCheckRemoteAhead()
  │   ├─ git fetch origin <branch>
  │   ├─ Compare SHA: local vs remote
  │   └─ Return: commits remote is ahead
  │
  ├─ IF remoteAhead === 0:
  │   ├─ logger.debug("remoteUpToDate")  ← SILENT (debug level)
  │   └─ RETURN (nothing to do)
  │
  ├─ STEP 2: git pull origin <branch>
  │   ├─ logger.info("remoteAhead")
  │   └─ IF ERROR with "conflict":
  │       ├─ CALL handleWatchConflicts()
  │       └─ (see conflict flow below)
  │
  ├─ STEP 3: restoreFromRepo(cfg, agent)
  │   ├─ Copy files from repo to agent workspace
  │   ├─ Decrypt encrypted files
  │   └─ logger.ok(pullSummary)
  │
  ├─ CATCH any error:
  │   ├─ IF "conflict" in message:
  │   │   └─ handleWatchConflicts()
  │   └─ ELSE:
  │       └─ logger.error(syncError)
  │
  └─ FINALLY: pulling = false ← ALWAYS resets flag
```

## Merge Conflict Handler

```
handleWatchConflicts(cfg, repoPath, agent)
  │
  ├─ Build file entries from config
  │
  ├─ FOR each file in config:
  │   ├─ IF file NOT in source workspace:
  │   │   └─ SKIP (silently)  ⚠️ NO LOG
  │   │
  │   ├─ IF file NOT in repo:
  │   │   └─ SKIP (silently)  ⚠️ NO LOG
  │   │
  │   ├─ IF NOT .md or .txt file:
  │   │   └─ SKIP (can't auto-merge)
  │   │
  │   ├─ IF local === repo content:
  │   │   └─ SKIP (no conflict)
  │   │
  │   ├─ GET base version: git show HEAD~1
  │   │   └─ IF FAILS:
  │   │       └─ SKIP (silently)  ⚠️ NO LOG WHY
  │   │
  │   ├─ CALL threeWayMerge(base, local, remote)
  │   │
  │   ├─ IF merge succeeds (no markers):
  │   │   ├─ Write resolved content to workspace
  │   │   └─ logger.info("conflictAutoMerged")
  │   │
  │   └─ IF merge fails (has conflict markers):
  │       ├─ Extract conflict snippets
  │       └─ ADD to pending-conflicts.json
  │
  └─ END FOR
     └─ savePendingConflicts() IF any conflicts recorded
         └─ logger.warn("conflictsSaved")

⚠️ CRITICAL BUG: Does NOT call:
   - git add .
   - git commit (to complete merge)
   - git merge --abort (to rollback)
   
   RESULT: .git/MERGE_HEAD still exists!
```

## What DOES Get Called vs What DOESN'T

### ✅ CALLED During Pull:

1. `gitEngine.fetchAndCheckRemoteAhead()`
   - Polls remote for new commits

2. `gitEngine.pull()`
   - Actual git pull with fast-forward or merge

3. `syncEngine.restoreFromRepo(cfg, agent)`
   - Restores pulled files to agent workspace

### ❌ NOT CALLED During Pull:

1. `syncEngine.distributeShared()` ← **CRITICAL**
   - Shared skills NOT propagated to other agents
   - Must be called manually via `wangchuan sync`

2. `syncLock.exists()` or `syncLock.acquire()` ← **IMPORTANT**
   - Watch doesn't check if sync is running
   - Race condition if sync crashes

3. Merge cleanup:
   - `git add .` (stage resolved files)
   - `git commit` (complete merge)
   - `git merge --abort` (rollback if failed)

## Expected vs Actual Flow

### What SHOULD happen when remote has shared skill update:

```
Remote has new shared skill
  │
  ├─ Agent A: wangchuan sync
  │   └─ Pushes skill to cloud ✅
  │
  ├─ Agent B: watch daemon (5 min later)
  │   ├─ Detects remote ahead ✅
  │   ├─ git pull ✅
  │   ├─ restoreFromRepo (pulls skill) ✅
  │   ├─ distributeShared (share with C)  ← MISSING ❌
  │   └─ Agent C has skill NOW
  │
  └─ Result: Real-time propagation ✅
```

### What ACTUALLY happens:

```
Remote has new shared skill
  │
  ├─ Agent A: wangchuan sync
  │   └─ Pushes skill to cloud ✅
  │
  ├─ Agent B: watch daemon (5 min later)
  │   ├─ Detects remote ahead ✅
  │   ├─ git pull ✅
  │   ├─ restoreFromRepo (pulls skill) ✅
  │   └─ STOP (no distributeShared) ❌
  │
  ├─ Agent C: Still doesn't have skill ❌
  │   └─ Only gets it when Agent C runs manual sync
  │
  └─ Result: Delayed propagation 🐢
```

## Error Scenarios That Cause Silent Failures

### Scenario 1: Merge Conflict Leaves Repo Dirty

```
Poll Tick 1:
  ├─ git pull → MERGE CONFLICT ERROR
  ├─ handleWatchConflicts()
  │   └─ Writes conflicts to pending-conflicts.json
  ├─ pulling = false
  └─ .git/MERGE_HEAD still exists! ⚠️

Poll Tick 2 (5 min later):
  ├─ git fetch → OK
  ├─ git pull
  │   └─ ERROR: "fatal: there is no merge to abort"
  ├─ logger.error() logs error
  └─ Stays in error state until manual fix
```

### Scenario 2: Sync Crashes, Leaves Lock

```
cmdSync running:
  ├─ Acquires sync-lock.json
  ├─ Stages files to repo (repo dirty)
  ├─ Process CRASHES → lock not released
  └─ Repo has staged changes

Watch tries to pull:
  ├─ git pull
  │   └─ ERROR: "Your local changes would be overwritten by merge"
  ├─ handleWatchConflicts() called (wrong!)
  │   └─ Tries to 3-way merge but doesn't understand staging area
  └─ Conflict recorded incorrectly

Next sync:
  ├─ Detects stale lock
  ├─ git reset --hard (wipes staged changes)
  └─ Now watch's conflict record is stale/wrong
```

### Scenario 3: Transient Network Error

```
Poll Tick 1:
  ├─ git fetch → NETWORK TIMEOUT
  ├─ logger.error("Fetch failed")
  └─ pulling = false

Poll Tick 2 (5 min later):
  └─ Retries (but 5 min remote updates missed!) ⚠️
```

## Summary of Data Flow Issues

| Component | What Happens | Result |
|-----------|--------------|--------|
| Remote check | `fetchAndCheckRemoteAhead()` ✅ | Works correctly |
| Pull | `git pull` ✅ | Works correctly |
| Restore | `restoreFromRepo()` ✅ | Works correctly |
| **Share** | `distributeShared()` ❌ **MISSING** | Shared skills not propagated |
| **Lock check** | NOT DONE ❌ | No sync/watch coordination |
| **Merge cleanup** | NOT DONE ❌ | Repo left in merge state |
| **Error logging** | Partial ⚠️ | Some errors swallowed silently |

