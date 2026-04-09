---
name: wangchuan
description: >
  AI memory sync system — auto-sync configs, skills, and memories across agents and environments.
  TRIGGER: Activate at the END of every task session to check if any configs, memories, or skills
  should be synced. Also activate when user says "sync", "wangchuan", "push memories", "pull memories".
---

# Wangchuan — AI Agent Config Sync System

## When to Activate

This skill MUST activate in these scenarios:

1. **End of every task session** — Before concluding, check if anything valuable was learned or changed
2. **User explicitly requests** — "sync", "wangchuan sync", "push/pull memories"
3. **After modifying agent config files** — CLAUDE.md, settings.json, skills/, .claude.json
4. **After learning something reusable** — New workflow patterns, user preferences, tool configurations

## Auto-start Watch Daemon

On skill activation, check if the watch daemon is running:
```bash
# Check if watch daemon PID file exists and process is alive
if [ -f ~/.wangchuan/watch.pid ] && kill -0 $(cat ~/.wangchuan/watch.pid) 2>/dev/null; then
  : # Watch daemon is running
else
  # Start watch daemon in background for continuous sync
  nohup wangchuan watch > /dev/null 2>&1 &
fi
```
This ensures continuous sync while the agent session is active.

## Self-Evolution Protocol

At the end of each task session, evaluate whether the conversation produced any of these:

| Category | What to look for | Where to update |
|----------|-----------------|-----------------|
| **New skill learned** | Reusable workflow, automation pattern, or domain knowledge | Create/update skill in `~/.claude/skills/` |
| **User preference discovered** | Coding style, tool preference, communication preference | Append to `~/.claude/CLAUDE.md` |
| **Memory worth preserving** | Key decisions, project context, recurring patterns | Append to agent memory file |
| **Config change made** | MCP servers added, settings changed, permissions updated | Already tracked by file sync |

### Decision Criteria — Only Update When Truly Valuable

Do NOT update for:
- Trivial one-off tasks (fixing a typo, answering a quick question)
- Information that is project-specific and not reusable
- Temporary debugging steps

DO update for:
- Patterns the user will likely need again across projects
- Explicit user requests ("remember this", "add this to my preferences")
- New tool integrations or workflow automations
- Corrections to existing memory/skills (fixing outdated info)

## Commands — All 8

```bash
# The ONE daily command — smart bidirectional sync
wangchuan sync                     # alias: s

# Check sync state at a glance
wangchuan status                   # alias: st

# Full detail (file list, diff, history, health)
wangchuan status -v

# Background daemon for continuous sync
wangchuan watch
wangchuan watch -i 10              # custom interval in minutes

# Diagnose + auto-fix everything
wangchuan doctor

# Browse and copy memories between agents
wangchuan memory list
wangchuan memory show openclaw
wangchuan memory copy openclaw claude
wangchuan memory broadcast claude

# Filter to specific agent
wangchuan sync --agent claude

# Multi-environment management
wangchuan env list
wangchuan env create work
wangchuan env switch work

# Switch display language
wangchuan lang zh
```

## Current Sync Status

!`wangchuan status 2>/dev/null || echo "wangchuan not initialized"`

## End-of-Session Checklist

Before concluding any task:

1. **Review**: Did this session produce reusable knowledge?
2. **Evaluate**: Is it worth persisting? (Apply the decision criteria above)
3. **Update**: If yes, update the appropriate file (memory/skill/config)
4. **Sync**: Run `wangchuan sync` to propagate to all agents and cloud
5. **Report**: Briefly tell the user what was synced (if anything)

If nothing valuable was produced, skip silently — do not announce "nothing to sync".
