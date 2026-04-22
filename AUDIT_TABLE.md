# AUDIT TABLE: Code Paths for Auto Resource Detection & Distribution

Generated: 2026-04-16 | Principle: Resources are agent-specific by default; shared only on explicit request

## Summary Table

| Location | What Happens | User Asked? | Problem? | Fix Suggestion |
|----------|--------------|-------------|----------|-----------------|
| `sync-shared.ts:223-246` (Section 2: New resources) | Detects single-agent skills, creates pending 'add' action | ✅ YES | None — works correctly | N/A |
| `sync-shared.ts:192-221` (Section 1: Already-shared) | Auto-queues distribution to agents missing a registered shared resource | ✅ YES (queued, user confirms) | Low — distribution is queued, not auto-written | Consider requiring explicit --confirm flag |
| `sync-shared.ts:248-294` (Section 3: Delete) | Auto-detects when shared resource deleted from one agent | ✅ YES (user confirms deletion) | None — user has full control | N/A |
| `sync-shared.ts:314-365` (MCP distribution) | **Merges ALL agents' MCP and writes directly to each agent's config** | ❌ **NO** | ❌ **CRITICAL — Auto-writes without asking** | **URGENT: Queue MCP changes like skills, require user approval** |
| `sync-shared.ts:369` (Custom agents) | Detects and queues custom agents for distribution | ✅ YES | None — same flow as skills | N/A |
| `shared-registry.ts:117-151` (migrateExistingToRegistry) | First-time: auto-registers all existing repo/shared/* as shared | ❌ NO | ⚠️ Low — one-time, backward compat | Add user notification: "Auto-migrated X resources to registry" |
| `sync.ts:265-373` (buildSharedEntries) | Filters to only include registry-registered resources | N/A | None — filters correctly | N/A |
| `sync-stage.ts:418-424` (stageToRepo entry) | Calls migrateExistingToRegistry() + distributeShared() on each push | Depends on called functions | MCP issue cascades here | Fix distributeShared() MCP handling |
| `commands/sync.ts:87-88` (pre-sync check) | Loads and processes pending distributions from previous sync | ✅ YES (user confirms) | None — correct | N/A |
| `commands/sync.ts:143-144` (post-push check) | Loads and processes new pending distributions after push | ✅ YES (user confirms) | None — correct | N/A |
| `sync-shared.ts:388-487` (processPendingDistributions) | Groups pending items, prompts user for each, executes on approval | ✅ YES | None — interactive approval required | N/A |

---

## Detailed Findings by Component

### 1. Skills Distribution ✅ CORRECT

**Code Path**: 
```
detectResourceDistributions('skill') 
  → identifies new single-agent skills 
  → creates { action: 'add', ...} 
  → saved to pending-distributions.json 
  → processPendingDistributions() asks user
```

| Property | Value |
|----------|-------|
| Lines | 223-246 (`sync-shared.ts`) |
| Triggered | Every sync |
| User Asked | ✅ YES — Interactive prompt (lines 414-454) |
| Auto-write | ❌ NO — Queued only |
| Registry Entry | ✅ Created only on user approval (line 469) |
| Status | ✅ CORRECT |

**Code Block** (lines 223-246):
```typescript
// ── 2. New resources (single agent, not yet shared): ask user to share ──
const seenNewResources = new Set<string>();
for (const [relFile, srcAbs] of allFiles) {
  const resName = resourceName(relFile);
  if (sharedNames.has(resName)) continue;  // ← Skip if already shared

  const owners = agentHas.get(relFile) ?? new Set<string>();
  if (owners.size !== 1) continue;  // ← Only prompt for single-agent

  seenNewResources.add(resName);
  items.push({
    kind: 'skill',
    action: 'add',
    relFile,
    sourceAgent: allOwner.get(relFile) ?? '',
    targetAgents: otherAgents,
    sourceAbs: srcAbs,
  });  // ← Queued, not written yet
}
```

---

### 2. MCP Auto-Merge ❌ CRITICAL VIOLATION

**Code Path**:
```
distributeShared(cfg)
  → merges ALL agents' mcpServers (lines 315-335)
  → fs.writeFileSync() directly to each agent's config (lines 348-361)
  → NO pending queue, NO user prompt, NO opt-out
```

| Property | Value |
|----------|-------|
| Lines | 314-365 (`sync-shared.ts`) |
| Triggered | Every sync (unconditional call on line 424) |
| User Asked | ❌ **NO** — No prompt, no queue, no confirmation |
| Auto-write | ✅ **YES** — Direct fs.writeFileSync() |
| Registry Entry | ❌ NO — MCP has no registry tracking |
| Severity | ❌ **CRITICAL** |
| Status | ❌ **VIOLATION** |

**Problematic Code Block** (lines 314-365):
```typescript
// ── Distribute MCP configs: automatic (unchanged) ──────────────
// ❌ This is the problem: no user confirmation!
const mergedMcp: Record<string, unknown> = {};
const mcpMtimes: Record<string, number> = {};

// Phase 1: Merge all agents' MCP (lines 317-335)
for (const source of shared.mcp.sources) {
  const p = profiles[source.agent];
  if (!p.enabled) continue;
  const srcPath = path.join(expandHome(p.workspacePath), source.src);
  const json = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
  const mcpField = json[source.field];  // e.g., "mcpServers"
  if (mcpField && typeof mcpField === 'object') {
    // Merge MCP servers from this agent
    for (const [key, val] of Object.entries(mcpField)) {
      if (!(key in mergedMcp) || mtime > (mcpMtimes[key] ?? 0)) {
        mergedMcp[key] = val;  // ← Takes latest version
        mcpMtimes[key] = mtime;
      }
    }
  }
}

// Phase 2: Write merged MCP to EVERY agent (lines 336-365)
if (Object.keys(mergedMcp).length > 0) {
  for (const source of shared.mcp.sources) {  // ← Write to ALL agents
    const p = profiles[source.agent];
    const srcPath = path.join(...);
    let json = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
    const currentMcp = (json[source.field] ?? {});
    
    // Add merged servers to each agent
    for (const [key, val] of Object.entries(mergedMcp)) {
      if (!(key in currentMcp)) {
        currentMcp[key] = val;  // ← AUTO-ADD without asking!
        changed = true;
      }
    }
    
    if (changed) {
      // ❌ DIRECT WRITE — No pending queue, no user confirmation!
      fs.writeFileSync(srcPath, JSON.stringify(json, null, 2), 'utf-8');
      logger.debug(`  ${t('sync.distributeMcp', { agent: source.agent })}`);
    }
  }
}
```

**Why This Violates Principle**:
1. Agent A's MCP server auto-appears in Agent B's config without any prompt
2. MCP servers often contain sensitive credentials (API keys, tokens)
3. User has no way to opt-out or review what was added
4. Happens on EVERY sync — user cannot predict or control it
5. No registry entry means no way to track "approved" MCP servers

**Impact**: 
- If Agent A defines MCP server "custom-tool" with API key
- Next sync automatically adds it to Agent B's config
- Agent B didn't ask for it, doesn't know what it does, might inherit unwanted access

---

### 3. Custom Agents ✅ CORRECT

**Code Path**: Same as skills

| Property | Value |
|----------|-------|
| Lines | 369 (`sync-shared.ts` in `distributeShared()`) |
| Detection | `detectResourceDistributions('agent', ...)` |
| User Asked | ✅ YES |
| Auto-write | ❌ NO |
| Status | ✅ CORRECT |

---

### 4. Delete Detection ✅ CORRECT

**Code Path**:
```
detectResourceDistributions() Section 3 (lines 248-294)
  → detects when shared resource missing from one agent
  → creates { action: 'delete', ...}
  → processPendingDistributions() asks whether to delete from other agents
```

| Property | Value |
|----------|-------|
| Lines | 248-294 (`sync-shared.ts`) |
| Detection | Checks if base dir exists but resource missing |
| User Asked | ✅ YES — User confirms each deletion |
| Auto-propagation | ❌ NO — Queued for approval |
| Edge Cases | Handles new agents correctly (checks baseDir exists) |
| Status | ✅ CORRECT |

**Code Block** (lines 265-275):
```typescript
// Check if the agent's base directory for this kind exists
// (distinguishes "active agent that deleted a resource" from "newly enabled agent with no data")
const baseDir = path.join(expandHome(p.workspacePath), source.dir);
const baseDirExists = fs.existsSync(baseDir);

if (fs.existsSync(dir)) {
  agentsWithResource.push(agent);
} else if (baseDirExists) {
  // Agent has the base dir but resource is missing → likely deleted
  agentsDeletedResource.push(agent);
}
```

---

### 5. Already-Shared Propagation ⚠️ ACCEPTABLE

**Code Path**:
```
detectResourceDistributions() Section 1 (lines 192-221)
  → for each registered shared resource
  → checks which agents lack it
  → creates { action: 'add', ...} for missing agents
  → processPendingDistributions() asks before distributing
```

| Property | Value |
|----------|-------|
| Lines | 192-221 (`sync-shared.ts`) |
| Scenario | Agent B joins workspace, needs existing shared resources |
| Detection | Compares registry against actual agent directories |
| User Asked | ✅ YES — User confirms in processPendingDistributions() |
| Auto-write | ❌ NO — Queued only |
| Status | ⚠️ ACCEPTABLE (could require explicit --confirm) |

**Code Block** (lines 192-221):
```typescript
// ── 1. Already-shared resources: distribute to agents that don't have them ──
for (const [relFile, srcAbs] of allFiles) {
  const resName = resourceName(relFile);
  if (!sharedNames.has(resName)) continue;  // ← Only registered resources

  const owners = agentHas.get(relFile) ?? new Set<string>();
  const sourceAgent = allOwner.get(relFile) ?? '';

  for (const targetAgent of allSourceAgents) {
    if (targetAgent === sourceAgent) continue;
    const targetHasIt = owners.has(targetAgent);

    if (!targetHasIt) {
      // Shared resource missing from this agent → queue distribution
      items.push({
        kind,
        action: 'add',
        relFile,
        sourceAgent,
        targetAgents: [targetAgent],
        sourceAbs: srcAbs,
      });
    }
  }
}
```

---

### 6. Auto-Migration ⚠️ MINOR ISSUE

**Code Path**:
```
stageToRepo() [line 418]
  → migrateExistingToRegistry(repoPath)
  → reads repo/shared/skills/ and repo/shared/agents/
  → auto-registers all as shared with sourceAgent: 'migrated'
```

| Property | Value |
|----------|-------|
| Lines | 117-151 (`shared-registry.ts`) + 418-419 (`sync-stage.ts`) |
| When | On first sync after upgrade |
| Detection | Silent scan of existing repo/shared/* |
| User Asked | ❌ NO — Auto-registration without notification |
| One-time | ✅ YES — Only runs once (checks if registry empty) |
| Justification | Backward compat: existing shared/ dirs mean user intended sharing |
| Status | ⚠️ ACCEPTABLE but should notify user |

**Code Block** (lines 117-151):
```typescript
export function migrateExistingToRegistry(repoPath: string): void {
  if (!fs.existsSync(repoPath)) return;
  const data = loadRegistry();
  if (data.entries.length > 0) return;  // ← Only runs once

  const entries: SharedRegistryEntry[] = [];

  // Skills
  const skillsDir = path.join(repoPath, 'shared', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      if (name.startsWith('.')) continue;
      const stat = fs.statSync(path.join(skillsDir, name));
      if (stat.isDirectory()) {
        entries.push({
          name,
          kind: 'skill',
          sourceAgent: 'migrated',  // ← Marks as migrated
          sharedAt: new Date().toISOString(),
        });
      }
    }
  }

  if (entries.length > 0) {
    saveRegistry({ entries });
    // ❌ MISSING: User notification here
  }
}
```

**Recommendation**: Add notification
```typescript
if (entries.length > 0) {
  saveRegistry({ entries });
  logger.info(`Auto-migrated ${entries.length} existing shared resources to registry.`);
  logger.info(`Run 'wangchuan audit-shared' to review all shared resources.`);
}
```

---

### 7. buildSharedEntries ✅ CORRECT

**Code Path**:
```
buildFileEntries()
  → buildSharedEntries(cfg)
  → for each skill/agent in workspace
  → only includes if isShared(kind, resName) ✅
```

| Property | Value |
|----------|-------|
| Lines | 265-373 (`sync.ts`) |
| Logic | Only syncs registered shared resources |
| User Control | ✅ User already approved during previous sync |
| Status | ✅ CORRECT |

**Key Code** (lines 294-296):
```typescript
for (const relFile of skillWalker(scanBase)) {
  // Only include files belonging to shared-registered resources
  const resName = resourceName(relFile);
  if (!isShared('skill', resName)) continue;  // ← Filters by registry
  // ... add to entries
}
```

---

## Entry Points & Trigger Conditions

| Function | Called From | Condition | Frequency | User Control |
|----------|-------------|-----------|-----------|--------------|
| `distributeShared()` | `stageToRepo()` line 424 | `!agent && !skipShared` | Every full push | `--skip-shared` flag |
| `processPendingDistributions()` | `cmdSync()` lines 87, 143 | `!skipShared && (isTTY \|\| yes)` | Before & after push | `--yes` auto-confirms; `--skip-shared` skips |
| `migrateExistingToRegistry()` | `stageToRepo()` line 418 | Always (but only runs once) | Once per upgrade | N/A |
| `buildSharedEntries()` | `buildFileEntries()` line 423 | `!agent` (full sync only) | Every sync | N/A |

---

## Risk Assessment

| Component | Risk Level | Explanation |
|-----------|------------|-------------|
| Skills | ✅ LOW | User asked before registration; queued, not auto-written |
| Custom Agents | ✅ LOW | Same flow as skills |
| Delete Detection | ✅ LOW | User asked before deletion |
| Already-Shared | ⚠️ MEDIUM | Auto-queued but user confirms; reasonable default |
| Auto-Migration | ⚠️ MEDIUM | One-time, but silent; should notify user |
| **MCP Auto-Merge** | 🔴 **CRITICAL** | Auto-written without asking; could expose credentials |

---

## Audit Checklist

- ✅ Skills: Detection works, user asked, queued not auto-written
- ✅ Custom Agents: Same as skills
- ✅ Delete: Detection works, user asked
- ⚠️ Already-Shared: User asked, but could require explicit confirmation
- ⚠️ Auto-Migration: User not notified; add logger.info()
- ❌ **MCP: Auto-written without user confirmation — FIX REQUIRED**

---

Generated: 2026-04-16
Full Report: `AUDIT_REPORT_SHARED_RESOURCES.md` (508 lines)
Summary: `AUDIT_SUMMARY.txt`
