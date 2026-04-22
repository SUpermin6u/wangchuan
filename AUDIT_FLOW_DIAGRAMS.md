# WANGCHUAN AUTO-SHARING: FLOW DIAGRAMS

## THE PROBLEM: Current Flow vs. Intended Flow

---

## CURRENT FLOW (VIOLATES PRINCIPLE)

### Flow 1: Auto-Registration Loop on Every Sync

```
User runs: $ wangchuan sync
    ↓
cmdSync() 
    ↓
runSync()
    ↓
stageToRepo(cfg, agent, filter, yes, skipShared)
    ↓
[Line 418] migrateExistingToRegistry(repoPath)  ← ⚠️ SILENT AUTO-MIGRATION
    ├─→ Scans shared/skills/ directory
    ├─→ Scans shared/agents/ directory
    └─→ Auto-registers ALL found items in registry WITHOUT ASKING
        (Source: shared-registry.json written with sourceAgent='migrated')
    ↓
distributeShared(cfg)
    ├─→ detectResourceDistributions('skill', ...)
    │   └─→ Section 1: Already-shared resources → auto-distribute to agents
    └─→ detectResourceDistributions('agent', ...)
        └─→ Section 1: Already-shared resources → auto-distribute to agents
    ↓
[If not yet registered] processPendingDistributions() called
    ├─→ User prompted: "Share <resource> with agents X,Y,Z?"
    └─→ User's response ONLY affects THIS resource, NOT saved to declined-registry
    ↓
Next sync:
    └─→ Same prompt appears AGAIN (no memory of rejection)

RESULT: 
❌ Resources auto-registered without asking
❌ Auto-distribution to agents happens before user sees any prompt
❌ Repeated prompts for rejected resources
❌ User frustration → accidental sharing
```

---

### Flow 2: Auto-Registration via buildFileEntries()

```
User runs: $ wangchuan sync  (or status, doctor, watch, etc.)
    ↓
buildFileEntries(cfg)  [Called from stageToRepo, buildSharedEntries, sync, etc.]
    ↓
[Line 423] buildSharedEntries(cfg, repoDirBase)
    ↓
[Line 276] if (repoDirBase) { migrateExistingToRegistry(repoDirBase) }
[Line 279] else { migrateExistingToRegistry(repoPath) }  ← ⚠️ AUTO-MIGRATION
    ├─→ Scans shared/ directory in repo
    ├─→ Registers all existing shared skills/agents
    └─→ Writes to shared-registry.json
    ↓
[Line 294-305] For each registered skill:
    ├─→ Check isShared('skill', name) → TRUE (just registered!)
    └─→ Add to file entries with repoRel='shared/skills/<name>'
    ↓
Return to stageToRepo() with file entries INCLUDING all registered shared resources
    ↓
These resources are now SYNCED to repo with assumption they're shared

RESULT:
❌ Auto-registration happens DURING file entry building
❌ Invisible to user (not interactive)
❌ Called from multiple places (sync, status, doctor, watch)
❌ No user can opt-out
```

---

### Flow 3: MCP Auto-Merge (Silent Config Overwrite)

```
User runs: $ wangchuan sync
    ↓
stageToRepo()
    ↓
distributeShared(cfg)
    ↓
[Line 314-335] FOR EACH MCP SOURCE:
    ├─→ Read agent's MCP servers from config file
    ├─→ Take LATEST version (by mtime)
    └─→ Merge ALL into mergedMcp[] map
    ↓
[Line 336-365] FOR EACH AGENT:
    ├─→ Read agent's current MCP servers
    ├─→ For each key in mergedMcp:
    │   └─→ If key not in agent's config OR value differs
    │       └─→ 🔥 SILENTLY OVERWRITE agent's config
    └─→ Write modified config back to agent's workspace
    ↓
Users don't see what happened until they check their configs

RESULT:
❌ Agent A's MCP config silently replaces Agent B's
❌ No user prompt or confirmation
❌ Only debug-level logging (hidden by default)
❌ Users unaware their configs changed
❌ Violates principle: "Only distribute with explicit user confirmation"

EXAMPLE:
Agent A (mtime: 2026-04-16 10:00):
  { "anthropic": { "command": "uv run", "args": [...] } }

Agent B (mtime: 2026-04-16 09:00):
  { "anthropic": { "command": "python", "args": [...] } }

After distributeShared():
  Agent B now has Agent A's config (newer mtime wins)
  NO PROMPT SHOWN TO USER
```

---

### Flow 4: Repeated "New Resource" Prompts (No Declined Memory)

```
Sync #1:
User runs: $ wangchuan sync
    ↓
Agent A has skill: my-custom-skill
    (single agent, not yet registered)
    ↓
detectResourceDistributions() Section 2:
    └─→ Detect "my-custom-skill" as "new single-agent resource"
    └─→ Add to pending: 'add my-custom-skill to agents B,C,D?'
    ↓
processPendingDistributions():
    ├─→ User prompted: "Share my-custom-skill with B,C,D? [0/1/2/3/...]"
    └─→ User enters: "3" (option to decline)
    ↓
User's response recorded in: pending-distributions.json (CLEARED after)
NO RECORD in declined-registry or never-share list
    ↓
syncSession ends


Sync #2 (next day):
User runs: $ wangchuan sync
    ↓
Agent A still has skill: my-custom-skill
    (user hasn't changed it)
    ↓
detectResourceDistributions() Section 2:
    └─→ Detect "my-custom-skill" as "new single-agent resource" AGAIN
    └─→ Add to pending: 'add my-custom-skill to agents B,C,D?'
    ↓
processPendingDistributions():
    ├─→ SAME PROMPT APPEARS AGAIN!
    └─→ User frustrated → either accepts accidentally or stops syncing

RESULT:
❌ No memory of user's rejection
❌ Repeated prompts for same resource
❌ Cognitive overload in multi-agent setup
❌ Users forced to make same decision repeatedly
❌ Some users accidentally say "yes" to stop the prompts
```

---

## INTENDED FLOW (PRINCIPLE-COMPLIANT)

```
User explicitly wants to share a resource:
    ↓
Scenario 1: Resource in Agent A's workspace
────────────────────────────────────────
User runs: $ wangchuan share skill my-skill
    ↓
System checks:
    ├─→ my-skill exists in Agent A? YES
    ├─→ Already shared? NO
    └─→ In declined-registry? NO → Proceed
    ↓
Prompt user: "Share my-skill with [B,C,D,...]?"
    ├─→ Show preview of what will happen
    ├─→ Confirm: "Register in shared-registry.json?"
    └─→ Confirm: "Copy to selected agents' workspaces?"
    ↓
User confirms
    ↓
Register in shared-registry.json
    ├─→ Entry: { name: 'my-skill', kind: 'skill', sourceAgent: 'a' }
    └─→ Save with timestamp
    ↓
Next sync: 
    └─→ Only distributes already-registered resources
    └─→ No repeated prompts for my-skill


Scenario 2: Resource migrating from old workflow
────────────────────────────────────────────────
Existing shared/ in repo from previous system version
    ↓
User runs: $ wangchuan import
    ↓
System scans: repo/shared/skills/ and repo/shared/agents/
    ↓
Prompt user: "Found X resources in shared/. Which should be registered?"
    ├─→ [ ] skill-1 (in agent-a)
    ├─→ [ ] skill-2 (in agent-b)
    ├─→ [ ] agent-custom (in agent-a)
    └─→ [Select all / None]
    ↓
User confirms selection
    ↓
Only selected resources registered in shared-registry.json
    ↓
Rejected resources: added to declined-registry.json
    ├─→ Entry: { name: 'skill-3', kind: 'skill', reason: 'user-declined-import' }
    └─→ These resources stay agent-specific, never prompted again
    ↓
Next sync:
    └─→ Only distributes user-selected resources


Scenario 3: User explicitly does NOT want to share
───────────────────────────────────────────────────
User creates: Agent A's ~/workspace/skills/experimental-skill/
    ↓
First sync:
    ├─→ System detects "experimental-skill" as new single-agent resource
    ├─→ Prompts: "Share experimental-skill with [B,C,D,...]?"
    └─→ User enters: "never" or clicks "Never share"
    ↓
System records in declined-registry.json:
    ├─→ Entry: { name: 'experimental-skill', kind: 'skill', reason: 'user-rejected' }
    └─→ Timestamp: 2026-04-16T10:00:00Z
    ↓
Future syncs:
    ├─→ detectResourceDistributions() skips resources in declined-registry
    └─→ NO PROMPT for experimental-skill again
    ↓
If user later changes mind:
    └─→ Run: $ wangchuan undecline skill experimental-skill
        └─→ Remove from declined-registry.json
        └─→ Next sync will prompt to share again


Scenario 4: MCP Merge (Principle-Compliant)
────────────────────────────────────────────
Agent A's mcpServers.json:
  { "anthropic": { "command": "uv run", ... } }

Agent B's mcpServers.json:
  { "claude": { "command": "python", ... } }

First sync:
    ↓
System detects: Different MCP servers across agents
    ↓
Prompt user: "Found MCP servers in multiple agents. Merge across all?"
    ├─→ anthropic (from agent-a)
    ├─→ claude (from agent-b)
    └─→ Confirm merge? [yes/no]
    ↓
User says YES
    ↓
Create pending distribution for MCP:
    └─→ Show which servers will be added to which agents
    ↓
After confirmation:
    ├─→ All agents get both anthropic + claude
    ├─→ Log clearly shows what was merged
    └─→ Changes synced to repo
    ↓
User says NO
    ↓
No merge, each agent keeps its own servers
```

---

## COMPARISON TABLE

| Aspect | Current Flow | Intended Flow |
|--------|-------------|---------------|
| **Auto-registration** | ✓ Silent, automatic | ✗ Explicit `wangchuan import` command |
| **User confirmation** | ✗ No prompt until distribution | ✓ Multiple confirmation points |
| **Memory of rejection** | ✗ No declined-registry | ✓ Tracks user's "never-share" decisions |
| **Repeated prompts** | ✓ Same prompt every sync | ✗ Prompt only once, then remember |
| **MCP distribution** | ✓ Silent auto-merge | ✗ Prompt before merging |
| **Cognitive load** | ✓ High (noisy) | ✗ Low (targeted prompts) |
| **Data isolation** | ✗ Broken by auto-sharing | ✓ Preserved until user requests |
| **Principle compliance** | ✗ OPT-OUT default | ✓ OPT-IN default |

---

## KEY DIFFERENCES

### Auto-Registration

**CURRENT:**
```
Repo has shared/skills/abc → Auto-register → Always distributed
```

**INTENDED:**
```
Repo has shared/skills/abc → User runs import → User selects → Then distributed
```

### Repeated Prompts

**CURRENT:**
```
Sync 1: Prompt "Share X?" → User: No
Sync 2: Prompt "Share X?" → User: No  ← SAME PROMPT!
Sync 3: Prompt "Share X?" → User: No  ← ANNOYING!
```

**INTENDED:**
```
Sync 1: Prompt "Share X?" → User: No
        └─→ Add to declined-registry
Sync 2: NO PROMPT (X in declined-registry)
Sync 3: NO PROMPT (X in declined-registry)
        └─→ Only re-prompt if user explicitly: wangchuan undecline skill X
```

### MCP Handling

**CURRENT:**
```
stageToRepo() → distributeShared() → [SILENT MERGE & WRITE] → Agent configs changed
```

**INTENDED:**
```
stageToRepo() → distributeShared() → [DETECT DIFFERENCES] → createPendingMCP() 
    → processPendingDistributions() → User Prompt → [CONFIRMED MERGE] → Write
```

---

## DECISION TREE: WHEN TO DISTRIBUTE

### Current (Broken)

```
Is resource in shared/ repo directory?
    ├─ YES → Auto-register → Always distribute
    └─ NO → Check if was registered before
        ├─ YES → Distribute
        └─ NO → Single-agent? Prompt to share (but repeated every sync)
```

### Intended (Fixed)

```
Is resource registered in shared-registry.json?
    ├─ YES → Distribute to all agents
    ├─ NO → Is resource in declined-registry.json?
    │   ├─ YES → Do NOT prompt, stay agent-specific
    │   └─ NO → Single-agent resource?
    │       ├─ YES → Prompt user (once per resource)
    │       │   ├─ User says YES → Register + distribute
    │       │   └─ User says NO → Add to declined-registry
    │       └─ NO → Do nothing
```

---

## CONSEQUENCES OF CURRENT FLOW

### For Multi-Agent Users

1. **Unexpected Sharing**: Resources silently shared across agents
2. **Config Pollution**: Agent B gets Agent A's MCP config without notice
3. **Loss of Control**: Can't prevent auto-sharing of agent-specific resources
4. **Repeated Decisions**: Same "share this?" prompt appears every sync

### For Teams

1. **Data Exposure**: Private configs might be auto-shared across team members
2. **Unpredictable Behavior**: Different behavior depending on sync timing
3. **Debugging Difficulty**: Hard to trace why a config appeared in an agent

### For Maintainers

1. **Bug Reports**: Users report "my MCP config changed" issues
2. **Support Load**: Questions about unexpected resource sharing
3. **Trust Issues**: Users lose confidence in the system

---

## RESOLUTION PATH

1. ✅ Audit completed (THIS DOCUMENT)
2. ⬜ Remove auto-migration from sync (FIX #1)
3. ⬜ Add declined-registry (FIX #2)
4. ⬜ Make MCP pending instead of auto-merge (FIX #3)
5. ⬜ Decouple buildSharedEntries from migration (FIX #4)
6. ⬜ Add declined-skipping to detection (FIX #5)
7. ⬜ Create `wangchuan import` command (FIX #6)
8. ⬜ Test with all scenarios
9. ⬜ Update documentation
10. ⬜ Release with breaking change notes

---

Generated: 2026-04-16
Audit: `/projects/wangchuan/AUDIT_AUTO_SHARING.md`
