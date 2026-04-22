# Wangchuan Shared Resources Audit — Complete Documentation

**Date**: 2026-04-16  
**Auditor**: Claude  
**Scope**: All auto-detection and auto-distribution code paths for skills, agents, MCP configs

---

## 📋 Quick Links to Audit Documents

### 1. **AUDIT_SUMMARY.txt** (Start Here)
- **Type**: Executive summary
- **Length**: ~200 lines
- **Purpose**: Quick overview of findings
- **Key Content**: 
  - Principle being tested
  - Critical violation found (MCP auto-merge)
  - Correctly implemented components
  - Recommendations by priority

### 2. **AUDIT_TABLE.md** (Detailed Analysis)
- **Type**: Technical reference
- **Length**: ~450 lines
- **Purpose**: Code-level findings with evidence
- **Key Content**:
  - Summary table of all code paths
  - Detailed analysis of each component
  - Code blocks showing exact problem areas
  - Entry points and trigger conditions
  - Risk assessment

### 3. **AUDIT_REPORT_SHARED_RESOURCES.md** (Full Report)
- **Type**: Comprehensive audit report
- **Length**: ~508 lines
- **Purpose**: Complete findings with context and recommendations
- **Key Content**:
  - Executive summary
  - Detailed findings for each file/function
  - Call flow diagrams
  - Issues summary table
  - Specific fix recommendations
  - Testing recommendations
  - Compliance checklist

---

## 🎯 Key Findings Summary

### ❌ Critical Violation: MCP Auto-Merge

**Location**: `src/core/sync-shared.ts` lines 314-365

```
distributeShared() function:
  1. Merges ALL agents' MCP servers
  2. Writes directly to EVERY agent's config file
  3. NO user prompt, NO queue, NO opt-out
```

**Problem**: 
- Agent A's MCP server auto-appears in Agent B without asking
- Could expose credentials across agents
- Violates principle: "resources are agent-specific by default"

**Fix**: Queue MCP changes like skills, require user approval

---

### ✅ Correctly Implemented (3 Components)

1. **Skills Distribution** — Detected, queued, user approves
2. **Custom Agents** — Same as skills (correct)
3. **Delete Detection** — Auto-detected, user confirms before propagation

---

### ⚠️ Minor Issues (2 Components)

1. **Already-Shared Propagation** — Queued but could require explicit confirmation
2. **Auto-Migration** — Silent but one-time; should add user notification

---

## 🔧 What Was Audited

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Skills detection | sync-shared.ts | 223-246 | ✅ OK |
| Already-shared propagation | sync-shared.ts | 192-221 | ⚠️ OK |
| Delete detection | sync-shared.ts | 248-294 | ✅ OK |
| **MCP auto-merge** | sync-shared.ts | 314-365 | ❌ **CRITICAL** |
| Custom agents | sync-shared.ts | 369 | ✅ OK |
| Pending distributions processor | sync-shared.ts | 388-487 | ✅ OK |
| Auto-migration | shared-registry.ts | 117-151 | ⚠️ OK |
| Shared entries filtering | sync.ts | 265-373 | ✅ OK |
| Entry points | sync-stage.ts, commands/sync.ts | 418-424, 87-88, 143-144 | ✅ OK |

---

## 📊 Distribution of Findings

| Issue | Severity | Count | Files |
|-------|----------|-------|-------|
| **Critical** | 🔴 Auto-write without user confirmation | 1 | sync-shared.ts |
| Medium | ⚠️ Silent auto-registration | 1 | shared-registry.ts |
| Low | ✅ Already queued/user asked | 7+ | Multiple |

---

## 🎓 Principle Being Tested

```
"A resource is agent-specific by default. It becomes shared ONLY when 
the user explicitly asks to share it. The system should NEVER auto-detect 
resources as 'new shared' or auto-distribute them without user confirmation."
```

### Compliance Results

| Component | Compliant |
|-----------|-----------|
| Skills | ✅ YES |
| Custom Agents | ✅ YES |
| Delete Propagation | ✅ YES |
| Already-Shared | ✅ YES (with concerns) |
| Auto-Migration | ⚠️ PARTIAL |
| **MCP Servers** | ❌ **NO** |
| **OVERALL** | ❌ **VIOLATION** |

---

## 🚀 Recommended Reading Order

### For Quick Overview (5 min)
1. Read this file (AUDIT_INDEX.md)
2. Skim "Key Findings Summary" above

### For Technical Details (30 min)
1. Read AUDIT_SUMMARY.txt
2. Review "MCP Auto-Merge" section in AUDIT_TABLE.md

### For Complete Understanding (1 hour)
1. Read AUDIT_SUMMARY.txt
2. Review all sections of AUDIT_TABLE.md
3. Read complete AUDIT_REPORT_SHARED_RESOURCES.md

### For Implementation (2 hours)
1. Read "RECOMMENDATIONS" section in AUDIT_REPORT_SHARED_RESOURCES.md
2. Review code blocks with "✅ TO THIS:" showing fix implementation
3. Check "TESTING RECOMMENDATIONS" section

---

## 📝 Call Flow: Where MCP Auto-Merge Happens

```
User runs: wangchuan sync
    ↓
cmdSync() [commands/sync.ts:67]
    ├─→ processPendingDistributions()     ← User is asked here
    │
    └─→ runSync()
        └─→ stageToRepo()
            ├─→ migrateExistingToRegistry()
            │
            ├─→ distributeShared()         ← ❌ MCP AUTO-WRITES HERE
            │    ├─→ detectResourceDistributions('skill')
            │    │    └─→ Saves to pending-distributions.json
            │    │
            │    ├─→ mergeMcp()             ← ❌ MERGE ALL AGENTS
            │    │    └─→ fs.writeFileSync()  ← ❌ AUTO-WRITE
            │    │
            │    └─→ detectResourceDistributions('agent')
            │         └─→ Saves to pending-distributions.json
            │
            └─→ buildFileEntries()
                 └─→ Only syncs registered resources
    │
    └─→ processPendingDistributions()     ← User is asked here
```

**Key Problem**: MCP auto-merge happens between two user prompts with NO queuing

---

## 🔒 Security Implications

**MCP Auto-Merge Risk**:
- ❌ Agent A's credentials auto-shared to Agent B
- ❌ No audit trail of what was added
- ❌ No way to review or opt-out
- ❌ Could expose API keys, tokens, endpoints

**Compared to Skills** (which work correctly):
- ✅ Skills are queued for user review
- ✅ User can decline or select agents
- ✅ Full audit trail in registry
- ✅ User has complete control

---

## ✅ Next Steps

### Immediate (Week 1)
1. [ ] Fix MCP auto-merge (convert to queued model like skills)
2. [ ] Add registry entry support for MCP kind
3. [ ] Update processPendingDistributions() to handle MCP

### Short-term (Week 2-3)
1. [ ] Add user notification for auto-migration
2. [ ] Add `wangchuan audit-shared` command
3. [ ] Add --allow-mcp-auto-merge flag (if keeping auto-merge as option)

### Nice-to-have (Later)
1. [ ] Add --dry-run for distributions
2. [ ] Add config option to disable auto-distribution
3. [ ] Add --verify-mcp flag to review MCP configs

---

## 📞 Questions?

Refer to the specific audit document:
- **"How does X work?"** → AUDIT_TABLE.md
- **"What's the exact problem?"** → AUDIT_SUMMARY.txt (search "MCP Auto-Merge")
- **"How do I fix it?"** → AUDIT_REPORT_SHARED_RESOURCES.md (section "CRITICAL FIXES REQUIRED")
- **"What about the other issues?"** → AUDIT_TABLE.md (sections 1-7)

---

**Audit completed**: 2026-04-16  
**All files in**: `/projects/wangchuan/`  
**Total documentation**: ~1,200 lines across 3 files
