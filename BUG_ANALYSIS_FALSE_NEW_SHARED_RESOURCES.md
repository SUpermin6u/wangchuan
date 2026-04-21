# Bug Report: False "New Shared Resources" Detection After `wangchuan restore`

## The Problem

After running `wangchuan restore` on a new machine, the next `wangchuan sync` **incorrectly** identifies existing shared skills as "new shared resources" and attempts to broadcast them to all agents.

Example: `patch-weixin` and `workbuddy-channel-setup` were already synced to `repo/shared/skills/` on the original machine and are present in the cloud. But after restore on a new machine, they're flagged as "new" and the user gets spurious prompts to "share" them to other agents.

---

## Root Cause Analysis

### Architecture Overview

The system uses a **LOCAL-ONLY registry** (`~/.wangchuan/shared-registry.json`) to track which resources are explicitly registered as shared:
- **NOT synced to cloud repo**
- Only exists in `~/.wangchuan/` on each machine
- Created/updated by user confirming resource sharing

### The Bug Sequence

**1. On Machine A (Original):**
- User creates skills in agent workspace
- First sync: `detectResourceDistributions()` sees skill in ONE agent → prompts to share
- User confirms → `registerShared()` → registry saved → skill pushed to `repo/shared/skills/`

**2. On Machine B (New Machine - Restore):**
- `wangchuan restore` clones repo
  - `repo/shared/skills/patch-weixin/` exists in cloud
  - `restoreFromRepo()` calls `buildFileEntries(cfg, repoPath)`
  - This calls `buildSharedEntries(cfg, repoPath)` 
  - Which calls `migrateExistingToRegistry(repoPath)`
  - **SHOULD scan `repo/shared/skills/` and populate registry** ✓
- Restore copies skills from `repo/shared/skills/` to workspace dirs

**3. On Machine B (Next Sync - THE BUG):**
- `stageToRepo()` is called for push
- **BEFORE** calling `buildFileEntries()`:
  - Calls `distributeShared(cfg)`
  - Which calls `detectResourceDistributions()` **<-- BUG SURFACES HERE**
  - Which calls `getSharedNames()` to get registry entries
  - Sees skills in workspace (from restore) but **registry appears EMPTY** ❌
  - Classifies them as "NEW" resources in single agent
  - Prompts user to broadcast to all agents

---

## Why Registry is Empty

The registry should have been populated during step 2 above, BUT there are two possible failure modes:

### Failure Mode 1: buildSharedEntries() Not Called
```
buildFileEntries(cfg, repoPath, agent, filter)
  if (!agent) {
    entries.push(...buildSharedEntries(cfg, repoDirBase))  // ← ONLY if agent is undefined
  }
```

If `agent` parameter is somehow non-undefined, `buildSharedEntries()` is skipped, and migration never runs.

### Failure Mode 2: Registry Guard Prevents Update
```typescript
export function migrateExistingToRegistry(repoPath: string): void {
  const data = loadRegistry();
  if (data.entries.length > 0) return;  // ← Only runs if registry is EMPTY
  
  // Scan repo/shared/skills/ and populate...
  if (entries.length > 0) {
    saveRegistry({ entries });  // ← Saves to disk
  }
}
```

This is correct behavior (only migrate once), but if migration somehow failed, the registry stays empty forever.

### Failure Mode 3: Timing Issue
Even if migration runs during restore, `detectResourceDistributions()` is called **BEFORE** `buildFileEntries()` in `stageToRepo()`:
```typescript
export async function stageToRepo(...) {
  if (!agent && !skipShared) {
    distributeShared(cfg);      // ← Called first (before migration)
  }
  const entries = buildFileEntries(cfg, undefined, agent, filter);  // ← Migration happens here
  // ...
}
```

But this shouldn't matter because:
- During restore: migration runs and saves to **disk**
- During next sync: migration already ran, so registry should be **loaded from disk**

---

## The Real Issue

Looking at the code flow, `migrateExistingToRegistry()` **SHOULD** work correctly:

1. ✓ Called during restore with `repoPath`
2. ✓ Scans `repo/shared/skills/` and finds existing shared resources
3. ✓ Saves them to `~/.wangchuan/shared-registry.json` (disk)
4. ✓ Next sync loads registry from disk
5. ✓ `detectResourceDistributions()` should see shared resources in registry

**BUT THE REGISTRY IS EMPTY ON NEXT SYNC**, which means:

**Either:**
- `migrateExistingToRegistry()` was NOT called during restore
- **OR** it failed to save the registry to disk
- **OR** the registry file is being cleared/reset between restore and sync
- **OR** the registry is being read from the wrong path

---

## Key Code Locations to Check/Fix

1. **`src/core/sync-restore.ts:101-115`** — `restoreFromRepo()`
   - Verify `buildFileEntries(cfg, repoPath)` is actually called with correct path
   - Add logging to confirm migration runs

2. **`src/core/shared-registry.ts:117-151`** — `migrateExistingToRegistry()`
   - Verify it actually scans the repo directory
   - Verify `saveRegistry()` is called and completes
   - Add error handling if save fails

3. **`src/core/sync-stage.ts:404-422`** — `stageToRepo()`
   - Current order: `distributeShared()` **before** `buildFileEntries()`
   - Consider moving `buildFileEntries()` call before `distributeShared()`
   - OR ensure migration has completed before distribution detection

4. **`src/core/sync.ts:265-306`** — `buildSharedEntries()`
   - Verify it correctly passes `repoDirBase` to `migrateExistingToRegistry()`
   - Confirm condition `if (!agent)` doesn't prevent `buildSharedEntries()` call during restore

---

## Recommended Fix

### Fix 1: Ensure Migration Runs Before Distribution (Safest)

Modify `stageToRepo()` to migrate registry BEFORE calling `distributeShared()`:

```typescript
export async function stageToRepo(...): Promise<StageResult> {
  // Force migration before distribution detection
  const { buildSharedEntries } = await import('./sync.js');
  buildSharedEntries(cfg);  // Triggers migrateExistingToRegistry()
  
  // Now distribute shared resources
  if (!agent && !skipShared) {
    distributeShared(cfg);  // Registry now populated
  }
  
  const entries = buildFileEntries(cfg, undefined, agent, filter);
  // ... rest of staging ...
}
```

### Fix 2: Ensure Registry is Synced to Repo (Better Long-term)

Make `shared-registry.json` part of the sync (stored in `repo/shared/registry.json`):
- Sync the registry file to cloud like other data
- On restore, the registry comes automatically from cloud
- No need to re-scan and migrate

This requires structural changes but is more robust.

### Fix 3: Explicit Migration on First Sync After Restore

Add explicit check in `stageToRepo()` or `processPendingDistributions()`:
```typescript
// After restore, ensure registry is populated from cloud repo
if (!fs.existsSync(registryPath) || fs.readFileSync(registryPath).length === 0) {
  migrateExistingToRegistry(repoPath);
}
```

---

## Testing

After fix, verify:
1. Create skill on Machine A, sync
2. Restore to Machine B
3. On Machine B, run `wangchuan sync`
4. Should NOT see "new shared resources" prompts for existing skills from cloud
5. Existing shared skills should be correctly distributed based on registry

