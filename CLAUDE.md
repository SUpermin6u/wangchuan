# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Wangchuan (忘川)** — AI memory sync system. A skill-first architecture that encrypts and syncs AI agent memories and skills across environments via a private Git repo. The AI agent itself executes operations guided by markdown skill files — no CLI tool needed.

Supported agents: **Claude** (`~/.claude/`), **Cursor** (`~/.cursor/`), **OpenClaw** (`~/.openclaw/`)

## Architecture

**Skill-First**: No compiled code. The entire project IS the skill. The AI agent reads `SKILL.md` to understand triggers and routing, then follows procedure files in `references/` to execute operations using Bash, Read, and Write tools natively.

```
wangchuan/                      ← this entire dir is the skill
├── SKILL.md                    # Main entry: triggers + routing table
├── references/
│   ├── init.md                 # Initialize wangchuan
│   ├── restore.md              # Restore on new machine
│   ├── skill-crud.md           # Skill add/modify/delete/view + sharing
│   ├── push-memory.md          # Push memory to cloud
│   └── pull-memory.md          # Pull memory from cloud
├── scripts/
│   ├── encrypt.sh              # openssl AES-256-CBC encrypt
│   └── decrypt.sh              # openssl AES-256-CBC decrypt
├── config.example.json         # Configuration template
├── test/skill-benchmark.md     # 25 test cases for skill verification
├── CLAUDE.md                   # This file
└── README.md
```

## Runtime Data (`~/.wangchuan/`)

```
~/.wangchuan/
├── config.json             # Agent paths + repo URL
├── master.key              # Encryption key (chmod 600)
├── scripts/                # Copied encrypt/decrypt helpers
└── repo/                   # Git clone of sync repo
    ├── shared/skills/      # Skills shared across all agents (plaintext)
    └── agents/<name>/
        ├── memory/         # Per-agent encrypted memory (.enc)
        └── skills/         # Per-agent specific skills (plaintext)
```

## How It Works

1. Agent reads `SKILL.md` → matches user intent to a trigger
2. Routes to the appropriate `references/*.md` file
3. Follows the step-by-step procedure using shell commands
4. Encryption handled by `scripts/encrypt.sh` / `decrypt.sh` (openssl)
5. Sync handled by standard git commands

## Dependencies

- `git` — sync transport
- `openssl` — AES-256-CBC encryption
- `gh` (optional) — auto-create GitHub repos

## Key Concepts

- **Shared skill**: A skill in `repo/shared/skills/` distributed to all agents
- **Agent-specific skill**: A skill in `repo/agents/<name>/skills/` for one agent only
- **Memory**: Agent's persistent context file (e.g. CLAUDE.md), always encrypted in repo
- **Master key**: AES-256 key at `~/.wangchuan/master.key`, required for decrypt on new machines

---

## Documentation Sync Rules (IRON LAW — zero tolerance)

**Every change that adds, removes, or modifies a command, agent, or user-visible behavior MUST update ALL of the following files IN THE SAME COMMIT:**

| File | What to update |
|------|---------------|
| `SKILL.md` | Routing table, agent detection, config structure, version |
| `references/*.md` | Detailed procedures for affected operations |
| `CLAUDE.md` | Architecture description, agent list, key concepts |
| `README.md` | Commands table, install instructions, agent list, repo structure |
| `README.zh-CN.md` | Same as README.md but in Chinese |
| `config.example.json` | If agent profiles or config fields changed |

**This is NOT a "do it later" task. If you change skill files and don't update docs in the same commit, you are shipping a bug.**

Pre-commit verification:
```bash
# Verify all routing entries in SKILL.md have corresponding reference files
for f in $(grep -oP 'references/\S+\.md' SKILL.md | sed 's/`//g'); do
  test -f "$f" && echo "OK: $f" || echo "MISSING: $f"
done
```

---

## Skill Benchmark (IRON LAW — zero tolerance)

**Every change to skill files (`SKILL.md`, `references/*.md`) MUST pass the Skill Benchmark before commit.**

The benchmark file is at `test/skill-benchmark.md`. It contains 25 test cases (TC-01 through TC-25) that define the expected behavior when an AI agent loads the wangchuan skill and receives user instructions.

### What the benchmark tests

Each TC specifies: user instruction → expected routing → expected agent behavior → critical constraints → anti-patterns.

Coverage: initialization (fresh/existing/re-init), restore (full/partial), skill CRUD (add/modify/delete/view for shared and agent-specific), memory push/pull (no conflict/with conflict/first push), trigger accuracy (should/should-not trigger), error handling.

### When to run the benchmark

- After modifying any skill file (SKILL.md or references/)
- After changing encryption scripts
- Before any release or commit that touches skill logic

### How to verify

For each affected TC, trace the flow:
1. Does the user intent match the skill's routing table in SKILL.md?
2. Does the routing table point to the correct reference file and section?
3. Does the reference file contain the exact commands and decision flow described in the TC?
4. Are all critical constraints satisfied?
5. Are all anti-patterns avoided?

If any TC fails, fix the skill files before committing. If a change introduces new behavior not covered by existing TCs, add new TCs to the benchmark first.

---

## Release Checklist (MANDATORY — execute in order)

Every release MUST complete ALL steps. Skipping any step is a release blocker.

1. **Docs sync verification**: Confirm `SKILL.md`, `CLAUDE.md`, `README.md`, `README.zh-CN.md` all reflect current state. Run the pre-commit verification above.
2. **Privacy check**: Verify no tokens, API keys, or passwords in any committed file.
3. **Language check**: All files in `references/`, `scripts/`, and `test/` must be English only.
   ```bash
   grep -rP '[\x{4e00}-\x{9fff}]' references/ scripts/ test/ SKILL.md | grep -v 'README.zh-CN'
   # Must return empty
   ```
4. **Skill Benchmark**: Trace ALL affected TCs in `test/skill-benchmark.md` against skill files. This is BLOCKING — if any TC fails, fix before proceeding.
5. **Encrypt/decrypt round-trip test**:
   ```bash
   echo "test" > /tmp/wc_test.txt
   scripts/encrypt.sh ~/.wangchuan/master.key /tmp/wc_test.txt /tmp/wc_test.enc
   scripts/decrypt.sh ~/.wangchuan/master.key /tmp/wc_test.enc /tmp/wc_test.dec
   diff /tmp/wc_test.txt /tmp/wc_test.dec && echo "PASS" || echo "FAIL"
   rm -f /tmp/wc_test.txt /tmp/wc_test.enc /tmp/wc_test.dec
   ```
6. **Commit**: `git add -A && git commit` (include all doc files)
7. **Push**: `git push origin main`
