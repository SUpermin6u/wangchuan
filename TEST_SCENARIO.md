# Test Scenario: Shared Resources Registry Fix

## Overview
This document provides manual test scenarios to verify the fix for the false "new shared resources" detection bug after `wangchuan restore`.

## Prerequisites
- Two machines or virtual environments
- Git repository with authentication setup
- Encryption key generated

## Scenario 1: Basic Restore → Sync Workflow

### Setup (Machine A - Original)
```bash
# Machine A
wangchuan init --repo=https://github.com/user/wangchuan-repo.git --key=/path/to/key
cd ~/.wangchuan/agents/claude  # Navigate to an agent workspace
mkdir -p skills/test-skill-1
echo "This is a test skill" > skills/test-skill-1/README.md
wangchuan sync
# When prompted: "Share test-skill-1 with all agents?" → YES
# When prompted: "Share any MCP servers?" → NO (if no MCP changes)
```

### Expected Result After Sync (Machine A)
- ✓ Skill appears in `repo/shared/skills/test-skill-1/` in git
- ✓ Registry file at `~/.wangchuan/shared-registry.json` contains entry for test-skill-1
- ✓ No spurious prompts

### Restore (Machine B - New Machine)
```bash
# Machine B
wangchuan restore --repo=https://github.com/user/wangchuan-repo.git --key=/path/to/key
# Wait for restore to complete
# Registry should be populated during restore
cat ~/.wangchuan/shared-registry.json
# Should show: test-skill-1 is registered
```

### Sync (Machine B - The Test)
```bash
# Machine B
wangchuan sync
```

### Expected Result After Sync (Machine B)
- ✓ NO prompt asking to "Share test-skill-1 with all agents"
- ✓ test-skill-1 appears in appropriate agent workspaces
- ✓ Registry still contains test-skill-1 entry
- ✗ FAILURE: Prompt asking to re-share test-skill-1 (bug not fixed)

### Verification
```bash
# On Machine B
ls ~/.wangchuan/agents/*/skills/test-skill-1/
# Should list the skill in relevant agent directories

grep -A2 "test-skill-1" ~/.wangchuan/shared-registry.json
# Should show:
# "name": "test-skill-1",
# "kind": "skill",
# "sourceAgent": "migrated",
```

---

## Scenario 2: Multiple Shared Resources

### Setup (Machine A)
```bash
# Machine A
# Create multiple shared resources
mkdir -p ~/.wangchuan/agents/claude/skills/{skill-a,skill-b,skill-c}
mkdir -p ~/.wangchuan/agents/grok/skills/{skill-d}
echo "Skill A" > ~/.wangchuan/agents/claude/skills/skill-a/README.md
echo "Skill B" > ~/.wangchuan/agents/claude/skills/skill-b/README.md
echo "Skill C" > ~/.wangchuan/agents/claude/skills/skill-c/README.md
echo "Skill D" > ~/.wangchuan/agents/grok/skills/skill-d/README.md

# Sync and accept all sharing prompts
wangchuan sync
# YES to each sharing prompt
```

### Restore (Machine B)
```bash
wangchuan restore --repo=<url> --key=<key>
cat ~/.wangchuan/shared-registry.json
# Should contain entries for: skill-a, skill-b, skill-c, skill-d
```

### Test (Machine B)
```bash
# Run sync multiple times
wangchuan sync  # First sync - should migrate registry if not already
wangchuan sync  # Second sync - should use cached registry
wangchuan sync  # Third sync - should have no sharing prompts
```

### Expected Results
- ✓ First sync: May see registry migration happening
- ✓ Second+ syncs: NO "new shared resources" prompts
- ✓ All skills appear in correct agent workspaces
- ✓ Registry persists with all entries

---

## Scenario 3: Registry Corruption Recovery

### Setup (Machine B after Restore)
```bash
wangchuan restore --repo=<url> --key=<key>
# Intentionally corrupt registry to test defensiveness
rm ~/.wangchuan/shared-registry.json
# or truncate it:
# echo '{"entries":[]}' > ~/.wangchuan/shared-registry.json
```

### Test
```bash
wangchuan sync
# Should NOT prompt to re-share existing skills
# Should rebuild registry from repo/shared/ files
cat ~/.wangchuan/shared-registry.json
# Should contain all previously shared skills
```

### Expected Results
- ✓ Registry rebuilt from repo
- ✓ No spurious "new shared resources" prompts
- ✓ All previously shared skills handled correctly

---

## Scenario 4: Agent-Specific Sync (Should Skip Migration)

### Setup
```bash
# Machine A or B with existing setup
wangchuan sync --agent=claude
# This targets single agent only
```

### Expected Results
- ✓ No unnecessary registry scanning
- ✓ Normal sync operation for that agent

---

## Scenario 5: Watch Mode (Should Skip Migration)

### Setup
```bash
# Machine A or B
wangchuan watch --skipShared
# or just
wangchuan watch
# Create new skill
mkdir ~/.wangchuan/agents/claude/skills/watch-test
```

### Expected Results
- ✓ No registry migration in watch mode
- ✓ Distributions deferred for interactive confirmation

---

## Debugging / Verification Commands

### Check Registry Contents
```bash
cat ~/.wangchuan/shared-registry.json | jq .
# or
jq '.entries[] | {name, kind, sourceAgent}' ~/.wangchuan/shared-registry.json
```

### Check Repo Structure
```bash
ls -la <repo>/shared/skills/
ls -la <repo>/shared/agents/
# Should match entries in registry
```

### Trace Registry Population
```bash
# Add debug logging before running sync (if needed):
# In src/core/shared-registry.ts, add console logs
npm run build
DEBUG=wangchuan:* wangchuan sync
```

### Check Sync History
```bash
cat ~/.wangchuan/sync-history.json | jq '.[-5:]'
# Last 5 sync events
```

---

## Success Criteria

✓ After restore on new machine, running sync does NOT prompt to re-share existing skills
✓ Registry file contains entries for all shared skills/agents
✓ Shared resources appear in correct agent workspaces
✓ Multiple syncs don't degrade registry or cause repeated prompts
✓ Registry corruption is handled gracefully

## Failure Indicators

✗ "Share <skill> with all agents?" prompt appears after restore
✗ Registry file is empty after restore
✗ Same skill is promped to be shared multiple times
✗ Registry file is corrupted/malformed

---

## Regression Testing

After fix is deployed, run these checks monthly:

1. Test basic restore → sync workflow (Scenario 1)
2. Test with 5+ shared resources (Scenario 2)
3. Test watch mode doesn't cause issues
4. Monitor logs for unexpected registry migrations

