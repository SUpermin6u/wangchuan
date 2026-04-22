# WANGCHUAN AUTO-SHARING AUDIT

**Completed**: 2026-04-16  
**Scope**: ALL code paths that automatically detect or distribute shared resources (skills, agents, MCP, plugins)

---

## 📋 DOCUMENTS IN THIS AUDIT

### 1. **AUDIT_SUMMARY.txt** (START HERE)
Quick-reference executive summary with visual boxes and key findings.
- Perfect for quick scanning
- All 4 critical issues listed
- Recommended fixes at a glance

### 2. **AUDIT_AUTO_SHARING.md** (MAIN REPORT)
Comprehensive 1000+ line audit report with:
- Executive summary
- Detailed findings for each issue (Issues #1-4)
- Root cause analysis
- Recommended fixes (#1-6)
- Testing recommendations
- Impact assessment
- Compliance status

### 3. **AUDIT_FLOW_DIAGRAMS.md** (VISUAL GUIDE)
Flow diagrams showing:
- Current broken flows (4 flows)
- Intended principle-compliant flows
- Decision trees
- Comparison tables
- Consequence analysis

---

## 🔴 CRITICAL FINDINGS AT A GLANCE

| # | Issue | Severity | File | Line | Action |
|---|-------|----------|------|------|--------|
| 1 | Silent auto-registration | 🔴 CRITICAL | `src/core/shared-registry.ts` | 117-151 | FIX #1 |
| 2 | Auto-loop in buildSharedEntries | 🔴 CRITICAL | `src/core/sync.ts` | 265-427 | FIX #4 |
| 3 | MCP auto-merge overwrites configs | 🟡 MAJOR | `src/core/sync-shared.ts` | 314-365 | FIX #3 |
| 4 | Repeated "new resource" prompts | 🟡 MAJOR | `src/core/sync-shared.ts` | 223-246 | FIX #5 |

---

## ✅ COMPLIANCE CHECKLIST

### Principle
> "A resource is agent-specific by default. It becomes shared ONLY when the user 
> explicitly asks to share it. The system should NEVER auto-detect resources as 
> 'new shared' or auto-distribute them WITHOUT USER CONFIRMATION."

### Current Status: ❌ VIOLATED in 4 places

- [ ] Issue #1: migrateExistingToRegistry() — Auto-registration without asking
- [ ] Issue #2: buildSharedEntries() — Auto-loop in file entry building
- [ ] Issue #3: MCP auto-merge — Silent config overwrites
- [ ] Issue #4: detectResourceDistributions() — No memory of user rejections

### After Fixes: ✅ COMPLIANT

---

## 🔧 RECOMMENDED FIXES (PRIORITY)

### CRITICAL (Fix First)

**FIX #1: Remove auto-migration on sync**
- File: `src/core/sync-stage.ts:418`
- Action: Remove call to `migrateExistingToRegistry()`
- Impact: Stops silent registration

**FIX #2: Add "never-share" registry**
- Files: `src/core/shared-registry.ts`, `src/core/sync-shared.ts`
- Action: Create `declined-registry.json`
- Impact: Stops repeated prompts

**FIX #3: Stop MCP auto-merge from writing**
- File: `src/core/sync-shared.ts:314-365`
- Action: Make MCP pending like skills OR skip entirely
- Impact: No silent config overwrites

### MAJOR (Fix Second)

**FIX #4: Decouple buildSharedEntries() from auto-migration**
- File: `src/core/sync.ts:275-279`
- Action: Remove migration call from build path
- Impact: Breaks auto-loop

**FIX #5: Add declined-skipping in detectResourceDistributions**
- File: `src/core/sync-shared.ts:223-246`
- Action: Skip declined resources during detection
- Impact: Prevents repeated prompts

### NICE-TO-HAVE (Fix Third)

**FIX #6: Add `wangchuan import` command**
- New File: `src/commands/import.ts`
- Purpose: Explicit import with user selection

---

## 📊 IMPACT MATRIX

| User Type | Impact | Reason |
|-----------|--------|--------|
| 🔴 Multi-agent users | HIGH | Auto-sharing breaks agent isolation |
| 🟡 Single-agent users | LOW | No cross-agent distribution |
| 🔴 Teams | CRITICAL | Auto-sharing exposes private configs |

---

## 🧪 TEST CASES

After applying fixes, verify:

1. **Fresh setup with existing shared/**
   - No auto-registration on first sync
   - User must run `wangchuan import`
   - User can select which resources to import

2. **Single-agent resource detected as "new"**
   - First sync: User declines sharing
   - Second sync: Same resource NOT prompted again
   - Verify resource in declined-registry

3. **MCP auto-merge visibility**
   - User gets prompt to merge MCPs
   - Log shows which servers added to which agents
   - No silent overwrites

4. **Resource stays agent-specific**
   - Create skill in one agent
   - Run sync, user declines sharing
   - Verify resource NOT in shared-registry.json
   - Verify NOT auto-distributed on future syncs

---

## 📝 NEXT STEPS

1. ✅ Audit completed
2. ⬜ Review findings with team
3. ⬜ Approve priority fixes
4. ⬜ Create GitHub issues for each fix
5. ⬜ Implement Fixes #1-3 (blocking)
6. ⬜ Implement Fixes #4-5 (follow-up)
7. ⬜ Add test cases
8. ⬜ Update documentation
9. ⬜ Release with breaking change notes

---

## 📖 HOW TO READ THIS AUDIT

### For Quick Understanding
→ Start with `AUDIT_SUMMARY.txt`

### For Technical Details
→ Read `AUDIT_AUTO_SHARING.md`

### For Visual Understanding
→ Study `AUDIT_FLOW_DIAGRAMS.md`

### For Implementation
→ Reference the specific file/line numbers in the main report

---

## ⚠️ KEY TAKEAWAY

The system currently implements **OPT-OUT sharing** (auto-share by default) when it should implement **OPT-IN sharing** (agent-specific by default).

This breaks the stated principle and can cause:
- Unexpected resource distribution across agents
- Silent configuration overwrites
- User confusion and frustration
- Data exposure in team environments

All 4 issues must be fixed before release.

---

## 📞 REFERENCES

- **Issue #1 Location**: `src/core/shared-registry.ts:117-151`
- **Issue #2 Location**: `src/core/sync.ts:265-373, 395-427`
- **Issue #3 Location**: `src/core/sync-shared.ts:314-365`
- **Issue #4 Location**: `src/core/sync-shared.ts:223-246`

- **Call chain**: `cmdSync()` → `stageToRepo()` → `migrateExistingToRegistry()` → AUTO-REGISTRATION

---

**Audit Report**: `/projects/wangchuan/`
- `AUDIT_AUTO_SHARING.md` — Main report (detailed)
- `AUDIT_SUMMARY.txt` — Executive summary (quick reference)
- `AUDIT_FLOW_DIAGRAMS.md` — Visual flows and comparison
- `AUDIT_README.md` — This file

Generated: 2026-04-16
