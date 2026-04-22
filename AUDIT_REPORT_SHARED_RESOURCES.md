# WANGCHUAN AUTO-SHARING AUDIT REPORT

**Principle**: A resource is agent-specific by default. It becomes shared ONLY when the user explicitly asks to share it. The system should NEVER auto-detect resources as "new shared" or auto-distribute them WITHOUT USER CONFIRMATION.

**Current Date**: 2026-04-16

---

## EXECUTIVE SUMMARY

**CRITICAL FINDINGS**: 4 major issues found where resources are auto-detected/auto-distributed without proper user confirmation.

| Issue # | Severity | Component | Description |
|---------|----------|-----------|-------------|
| 1 | 🔴 CRITICAL | `migrateExistingToRegistry()` | Auto-registers ALL existing shared/ resources as shared during migration without any user confirmation |
| 2 | 🔴 CRITICAL | `buildSharedEntries()` + `buildFileEntries()` | Auto-includes only registered shared resources in sync — BUT registration happens automatically |
| 3 | 🟡 MAJOR | MCP auto-merge in `distributeShared()` | Auto-merges ALL agents' MCP servers and distributes to ALL agents without any prompt |
| 4 | 🟡 MAJOR | `detectResourceDistributions()` Section 2 | Detects "new single-agent resources" and creates pending distributions — triggers on EVERY sync |

---

## DETAILED FINDINGS

### 1. ⚠️ `migrateExistingToRegistry()` — CRITICAL AUTO-REGISTRATION

**File**: `src/core/shared-registry.ts:117-151`

**What happens**:
```typescript
export function migrateExistingToRegistry(repoPath: string): void {
  if (!fs.existsSync(repoPath)) return;
  const data = loadRegistry();
  if (data.entries.length > 0) return; // already migrated

  const entries: SharedRegistryEntry[] = [];

  // Skills
  const skillsDir = path.join(repoPath, 'shared', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      // ... ALL existing skills auto-registered ...
      entries.push({ name, kind: 'skill', sourceAgent: 'migrated', sharedAt: ... });
    }
  }

  // Custom agents
  const agentsDir = path.join(repoPath, 'shared', 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const name of fs.readdirSync(agentsDir)) {
      // ... ALL existing agents auto-registered ...
      entries.push({ name, kind: 'agent', sourceAgent: 'migrated', sharedAt: ... });
    }
  }

  if (entries.length > 0) {
    saveRegistry({ entries });  // ← WRITES TO REGISTRY WITHOUT USER CONFIRMATION
  }
}
```

**Called from**:
- `src/core/sync-stage.ts:418` — `stageToRepo()` calls it AUTOMATICALLY on every push (if no agent filter and no skipShared)
- `src/core/sync.ts:276,279` — `buildSharedEntries()` calls it AUTOMATICALLY when building file entries
- `src/commands/sync.ts:67` — Full sync command (line 214: `stageToRepo(cfg, agent, filter, yes, skipShared)`)

**User confirmation?**: ❌ **NONE**. This is a SILENT auto-registration.

**Problem**: 
- Existing resources in `shared/skills/` and `shared/agents/` are assumed to have been intentionally shared
- BUT they may have been:
  - Manually copied there for migration
  - Accidentally placed there by a script
  - Left from an old workflow the user no longer follows
- The user is NEVER asked "I found X skills in shared/. Should these be registered as shared?"

**Risk**: User's workflows break if shared registration causes unexpected distribution on next sync.

---

### 2. 🔴 `buildSharedEntries()` + `buildFileEntries()` — AUTO-INCLUSION BASED ON REGISTRATION

**File**: `src/core/sync.ts:265-373` + `395-427`

**What happens**:
```typescript
// Line 265-305: buildSharedEntries() 
for (const relFile of skillWalker(scanBase)) {
  const resName = resourceName(relFile);
  if (!isShared('skill', resName)) continue;  // ← ONLY include if registered
  
  entries.push({
    srcAbs:    path.join(wsPath, source.dir, relFile),
    repoRel:   path.join('shared', 'skills', relFile),  // ← Goes to shared/ tier
    // ...
  });
}

// Line 395-427: buildFileEntries()
export function buildFileEntries(cfg, repoDirBase?, agent?, filter?): FileEntry[] {
  // ... build agent entries ...
  if (!agent) {
    entries.push(...buildSharedEntries(cfg, repoDirBase));  // ← Called automatically
  }
  return applyFilter(deduplicateEntries(entries), filter);
}
```

**Called from**:
- Every sync/restore command via `stageToRepo()` (line 430 in sync-stage.ts)
- Every status check via `cmdStatus()` (lines 151, 222, 280, 374, 443 in commands/status.ts)
- Every doctor check via `cmdDoctor()` (line 475 in commands/doctor.ts)
- Watch mode via conflict detection (line 191 in commands/watch.ts)

**User confirmation?**: ❌ **NONE**. Inclusion in shared/ is automatic IF resource is registered.

**Problem**: 
- `buildSharedEntries()` calls `migrateExistingToRegistry()` internally (line 276-279)
- This means `buildFileEntries()` ALWAYS auto-registers everything on first call
- Then subsequent calls include all auto-registered resources in the sync automatically
- Combined with Issue #1, this creates a hidden auto-sharing loop

**Chain reaction**:
1. User runs `wangchuan sync`
2. `stageToRepo()` → `migrateExistingToRegistry()` → auto-registers all existing shared/ resources
3. `buildFileEntries()` → `buildSharedEntries()` → includes those now-registered resources
4. `distributeShared()` → `detectResourceDistributions()` detects them as "shared already" → auto-distributes to all agents
5. User's workspaces get polluted with resources they never explicitly asked to share

---

### 3. 🟡 MCP AUTO-MERGE IN `distributeShared()` — NO USER PROMPT

**File**: `src/core/sync-shared.ts:305-377`

**What happens**:
```typescript
export function distributeShared(cfg: WangchuanConfig): void {
  // ... (skills handled with pending prompts) ...
  
  // ── Distribute MCP configs: automatic (unchanged) ──────────────
  const mergedMcp: Record<string, unknown> = {};
  const mcpMtimes: Record<string, number> = {};
  
  // STEP 1: Merge all agents' MCP servers
  for (const source of shared.mcp.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const srcPath = path.join(expandHome(p.workspacePath), source.src);
    if (!fs.existsSync(srcPath)) continue;
    try {
      const mtime = fs.statSync(srcPath).mtimeMs;
      const json = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Record<string, unknown>;
      const mcpField = json[source.field];
      if (mcpField && typeof mcpField === 'object') {
        // ← ALL MCP servers from ALL agents are merged
        for (const [key, val] of Object.entries(mcpField as Record<string, unknown>)) {
          if (!(key in mergedMcp) || mtime > (mcpMtimes[key] ?? 0)) {
            mergedMcp[key] = val;
            mcpMtimes[key] = mtime;
          }
        }
      }
    } catch { /* ignore parse failures */ }
  }
  
  // STEP 2: Distribute merged MCP to ALL agents
  if (Object.keys(mergedMcp).length > 0) {
    for (const source of shared.mcp.sources) {
      const p = profiles[source.agent];
      if (!p.enabled) continue;
      const srcPath = path.join(expandHome(p.workspacePath), source.src);
      try {
        let json: Record<string, unknown> = {};
        if (fs.existsSync(srcPath)) {
          json = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Record<string, unknown>;
        }
        const currentMcp = (json[source.field] ?? {}) as Record<string, unknown>;
        let changed = false;
        for (const [key, val] of Object.entries(mergedMcp)) {
          if (!(key in currentMcp)) {
            currentMcp[key] = val;  // ← AUTO-ADDED to agent's config
            changed = true;
          } else if (JSON.stringify(currentMcp[key]) !== JSON.stringify(val)) {
            currentMcp[key] = val;  // ← AUTO-UPDATED in agent's config
            changed = true;
          }
        }
        if (changed) {
          json[source.field] = currentMcp;
          fs.mkdirSync(path.dirname(srcPath), { recursive: true });
          fs.writeFileSync(srcPath, JSON.stringify(json, null, 2), 'utf-8');  // ← SILENT WRITE
          logger.debug(`  ${t('sync.distributeMcp', { agent: source.agent })}`);
        }
      } catch { /* ignore */ }
    }
  }
  // ...
}
```

**When does this run?**
- `stageToRepo()` (line 424 in sync-stage.ts) calls `distributeShared()` AUTOMATICALLY
- This happens on EVERY full sync (unless `--skip-shared` flag is used)
- Runs BEFORE user sees any pending distributions prompt

**User confirmation?**: ❌ **NONE**. MCP is auto-merged and auto-distributed with only a debug log.

**Problem**:
- If Agent A adds MCP server `anthropic` with one config
- If Agent B has MCP server `anthropic` with a different config
- The LATEST (by mtime) wins and is silently distributed to ALL agents
- Users may not notice their MCP config was changed
- This violates the principle: **No auto-distribution without explicit user confirmation**

**Example**:
```json
// Agent A's mcpServers.json (modified 2026-04-16 10:00)
{ "anthropic": { "command": "uv", "args": [...] } }

// Agent B's mcpServers.json (modified 2026-04-16 09:00)
{ "anthropic": { "command": "python", "args": [...] } }

// After distributeShared(), Agent B now has Agent A's config (silent overwrite)
```

---

### 4. 🟡 `detectResourceDistributions()` Section 2 — AUTO-DETECTION OF "NEW" RESOURCES

**File**: `src/core/sync-shared.ts:183-297` (Section 2: lines 223-246)

**What happens**:
```typescript
function detectResourceDistributions(
  kind: 'skill' | 'agent',
  sources: ReadonlyArray<{ readonly agent: string; readonly dir: string }>,
  profiles: AgentProfiles,
): PendingDistribution[] {
  const { allFiles, allOwner, agentHas, allSourceAgents, perAgent } = aggregateResources(sources, profiles);
  const items: PendingDistribution[] = [];
  const sharedNames = new Set(getSharedNames(kind));

  // ── 1. Already-shared resources: distribute to agents that don't have them ──
  // (This is correct — only distributes what's already registered as shared)

  // ── 2. New resources (single agent, not yet shared): generate 'add' pending ──
  const seenNewResources = new Set<string>();
  for (const [relFile, srcAbs] of allFiles) {
    const resName = resourceName(relFile);
    if (sharedNames.has(resName)) continue;  // ← Skip already-shared

    const owners = agentHas.get(relFile) ?? new Set<string>();
    if (owners.size !== 1) continue;  // ← Only for single-agent resources
    if (seenNewResources.has(resName)) continue;  // ← One prompt per resource

    const sourceAgent = allOwner.get(relFile) ?? '';
    const otherAgents = allSourceAgents.filter(a => a !== sourceAgent);
    if (otherAgents.length === 0) continue;

    seenNewResources.add(resName);
    items.push({  // ← CREATE PENDING DISTRIBUTION
      kind,
      action: 'add',
      relFile,
      sourceAgent,
      targetAgents: otherAgents,
      sourceAbs: srcAbs,
    });
  }

  // ── 3. Delete: shared resource removed from an agent ──
  // (This part is correct — only prompts for already-shared resources)

  return items;
}
```

**Called from**:
- `distributeShared()` (line 312 in sync-shared.ts) calls `detectResourceDistributions('skill', ...)`
- `distributeShared()` (line 369 in sync-shared.ts) calls `detectResourceDistributions('agent', ...)`
- This happens on EVERY sync that calls `stageToRepo()` → `distributeShared()`

**User confirmation?**: 🟡 **PARTIAL**. The user IS prompted in `processPendingDistributions()`, BUT:

**Problems**:
1. **DETECTION TRIGGERS AUTOMATICALLY**: Every single-agent resource that exists is detected as "new to share"
2. **PROMPT FIRES FOR EVERY SYNC**: If user declines a resource, it appears as "new" again next sync
3. **NO MEMORY OF USER REJECTION**: When a user says "no" to sharing a resource, there's no `declined-registry` or `never-share` list
4. **NOISY**: Users will see the same prompts repeatedly for resources they never intended to share
5. **COGNITIVE OVERLOAD**: In a multi-agent setup with many skills, users will be flooded with prompts

**Chain reaction**:
1. User creates skill `my-custom-skill/` in Agent A's workspace
2. Runs `wangchuan sync`
3. Gets prompted: "Share my-custom-skill with agents B, C, D?" 
4. User declines
5. Next sync, same prompt appears again (user rejected but system has no memory)
6. User gets frustrated and either:
   - Accidentally clicks yes
   - Stops running sync
   - Moves skill to a location they think won't be shared (accidental)

---

## AUDIT TABLE: ALL AUTO-ACTIONS WITHOUT USER CONFIRMATION

| Location | What happens | Is user asked? | Problem? | Fix suggestion |
|----------|-------------|----------------|---------|-----------------|
| `migrateExistingToRegistry()` line 117-151 | Auto-registers ALL existing shared/ resources in registry on first run | ❌ NO | Silent auto-registration violates principle | (1) Don't auto-migrate; (2) Prompt user to select which shared/ resources to register; (3) Create `never-share` registry for explicit opt-out |
| `buildSharedEntries()` line 276-279 | Calls `migrateExistingToRegistry()` on every build of file entries | ❌ NO | Combined with Issue 1, causes hidden auto-registration loop | Stop calling migrate from build path; call only explicitly when user requests import |
| `stageToRepo()` line 418 | Calls `migrateExistingToRegistry()` before push | ❌ NO | Adds auto-registration to every sync | Move migration to explicit command: `wangchuan migrate` |
| `distributeShared()` MCP section line 314-365 | Auto-merges ALL agents' MCP servers and writes to ALL agents | ❌ NO (only debug log) | Silent auto-merge of configs violates principle; users unaware their MCP changed | Either: (1) Create pending distribution for MCP like skills; (2) Skip MCP auto-merge; (3) Only merge, don't write (save as pending) |
| `detectResourceDistributions()` section 2 line 223-246 | Detects single-agent resources and creates pending "add" | 🟡 PARTIAL (user is prompted later) | Triggers EVERY sync; creates noisy repeated prompts; no "never-share" memory | (1) Add declined-resources registry; (2) Only prompt once per resource; (3) Exclude declined resources from future detection |
| `processPendingDistributions()` line 388-487 | User prompted to share resources | ✅ YES | This part is correct | Keep as is, but fix upstream issues |

---

## ROOT CAUSE ANALYSIS

The root cause is a **layered auto-detection system** that assumes resources are opt-out (auto-share by default) rather than opt-in (agent-specific by default):

1. **Layer 1 - Auto-Registration**: `migrateExistingToRegistry()` silently registers everything
2. **Layer 2 - Auto-Inclusion**: `buildSharedEntries()` calls Layer 1, auto-including in sync
3. **Layer 3 - Auto-Distribution**: `detectResourceDistributions()` auto-detects "new" resources
4. **Layer 4 - Auto-Merge**: MCP auto-merge happens before user sees prompts

The intended flow (per the code comments) was:
- "A resource is shared ONLY when user explicitly confirms"
- "On decline: resource stays agent-specific, NOT pushed to shared tier"

But the actual flow is:
- Everything migrates automatically (Layer 1)
- Everything gets registered automatically (Layer 1)
- Everything gets distributed automatically if it was previously in shared/ (Layer 2)
- New resources get flagged for sharing (Layer 3)
- MCP always merges (Layer 4)

---

## RECOMMENDED FIXES (PRIORITY ORDER)

### CRITICAL (Fix first)

#### Fix #1: Remove auto-migration on sync
**File**: `src/core/sync-stage.ts:418`
```typescript
// BEFORE:
if (!agent && !skipShared) {
  migrateExistingToRegistry(repoPath);  // ← AUTO-MIGRATE
}

// AFTER:
// Remove this call. User should explicitly run: wangchuan import
// OR show a prompt: "Found X shared resources. Register them? [yes/no]"
```

#### Fix #2: Add "never-share" registry
**Files**: `src/core/shared-registry.ts`, `src/core/sync-shared.ts`
- Create parallel registry: `declined-registry.json` or `never-share-list`
- When user declines a resource in `processPendingDistributions()`, add to never-share
- In `detectResourceDistributions()` Section 2, skip resources in never-share list

#### Fix #3: Stop MCP auto-merge from writing
**File**: `src/core/sync-shared.ts:314-365`
```typescript
// BEFORE: Auto-writes merged MCP to all agents

// AFTER: Option A - Create pending distribution for MCP
// Move MCP merge to pendingItems like skills
// User gets prompted: "Merge these MCP servers across all agents?"

// OR Option B - Skip MCP distribution entirely
// Let users manage MCP manually (lower risk)
```

### MAJOR (Fix second)

#### Fix #4: Decouple `buildSharedEntries()` from auto-migration
**File**: `src/core/sync.ts:275-279`
```typescript
// BEFORE:
if (repoDirBase) {
  migrateExistingToRegistry(repoDirBase);
}

// AFTER:
// Remove migration from build path
// Call only explicitly when user requests: wangchuan import
```

#### Fix #5: Add "declined-skipping" in detectResourceDistributions
**File**: `src/core/sync-shared.ts:223-246`
```typescript
// BEFORE: Auto-detects all single-agent resources

// AFTER:
const declinedResources = new Set(loadDeclinedResources(kind));
for (const [relFile, srcAbs] of allFiles) {
  const resName = resourceName(relFile);
  
  // Skip: already shared
  if (sharedNames.has(resName)) continue;
  
  // Skip: user previously declined
  if (declinedResources.has(resName)) continue;  // ← NEW
  
  // ... detect as new ...
}
```

### NICE-TO-HAVE (Fix third)

#### Fix #6: Add `wangchuan import` command
**New file**: `src/commands/import.ts`
- Explicitly prompt user to select which resources from shared/ should be registered
- Provide preview of what will happen
- Create detailed log of what was imported

#### Fix #7: Better UX for pending distributions
**File**: `src/commands/sync.ts:83-88`
- Show summary of pending distributions BEFORE syncing
- Offer option to review and decline specific resources
- Show which agents will receive which resources

---

## TESTING RECOMMENDATIONS

### Test Case 1: Fresh setup with existing shared/ resources
```bash
# Setup: existing shared/skills/ and shared/agents/
$ wangchuan sync
# Expected: NO auto-migration. User must run "wangchuan import"
# Then prompted to select which resources to register
# Then prompted in processPendingDistributions()
```

### Test Case 2: Single-agent resource detected as "new"
```bash
# Setup: Agent A has skill "my-skill"
$ wangchuan sync  (first time)
# User declines sharing
$ wangchuan sync  (second time)
# Expected: NO prompt for "my-skill" again (should be in never-share)
```

### Test Case 3: MCP auto-merge visibility
```bash
# Setup: Agent A has MCP server X, Agent B has MCP server Y
$ wangchuan sync
# Expected: User gets PROMPT to merge MCPs, not silent write
# After confirming: log shows which MCP servers were added to which agents
```

### Test Case 4: Resource stays agent-specific until explicitly shared
```bash
# Setup: Agent A creates skill "temp-skill"
# No shared registration
$ wangchuan sync
# Expected: "temp-skill" shown in pending; user declines
$ grep temp-skill ~/.wangchuan/shared-registry.json
# Expected: NOT in registry
# After another sync:
$ wangchuan sync  (second time)
# Expected: "temp-skill" NOT shown as pending again
```

---

## IMPACT ASSESSMENT

### Who is affected?
- **Multi-agent users**: High impact (auto-sharing breaks isolation)
- **Single-agent users**: Low impact (no cross-agent distribution)
- **Teams using wangchuan**: Critical (auto-sharing could expose private config)

### Severity scale:
- 🔴 **Critical**: Data/config unexpectedly shared across agents
- 🟡 **Major**: Silent writes to user's configuration
- 🟢 **Minor**: UX could be clearer

### Recommendation: 
**Address Fixes #1-#3 before next release**. These are breaking the stated principle and could cause unexpected data sharing.

---

## COMPLIANCE WITH PRINCIPLE

**Stated Principle**: 
> "A resource is agent-specific by default. It becomes shared ONLY when the user explicitly asks to share it. The system should NEVER auto-detect resources as "new shared" or auto-distribute them."

**Current compliance**: ❌ **VIOLATED in 4 places**

**After fixes**: ✅ **COMPLIANT**

---

## NEXT STEPS

1. ✅ Create this audit (DONE)
2. ⬜ Approve priority fixes
3. ⬜ Create GitHub issues for each fix
4. ⬜ Implement Fixes #1-3 (blocking)
5. ⬜ Implement Fixes #4-5 (follow-up)
6. ⬜ Add test cases from "Testing Recommendations"
7. ⬜ Update documentation with explicit sharing workflow
8. ⬜ Announce breaking changes if needed

