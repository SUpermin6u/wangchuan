# wangchuan — 智能体记忆同步技能 / AI Agent Memory Sync Skill

## 技能简介 / Overview

忘川（Wangchuan）AI 记忆同步系统的 OpenClaw Skill 封装。在对话中直接调用以同步 AI 智能体的配置文件，跨环境永不遗失记忆。

OpenClaw Skill wrapper for the Wangchuan AI memory sync system. Invoke directly in conversation to sync AI agent configs — memories never lost across environments.

## 命令速查 / Command Reference

```
wangchuan list   [--agent openclaw|claude|gemini]     列出所有受管配置项 / List managed configs
wangchuan status [--agent openclaw|claude|gemini]     查看同步状态和差异摘要 / Show sync status & diff summary
wangchuan diff   [--agent openclaw|claude|gemini]     显示行级文件差异 / Show line-level file diff
wangchuan pull   [--agent openclaw|claude|gemini]     拉取远端配置，还原到本地 / Pull & restore from repo
wangchuan push   [--agent <name>] [-m "<描述>"]       加密推送本地配置到远端 / Encrypt & push to repo
wangchuan dump   [--agent openclaw|claude|gemini]     生成明文快照到临时目录 / Plaintext snapshot to temp dir
wangchuan init   --repo <git地址>                     首次初始化 / First-time init
```

## 调用示例 / Invocation Examples

> 帮我列出忘川管理的所有配置文件 / List all files managed by Wangchuan

> 查看一下忘川的同步状态 / Check Wangchuan sync status

> 只看 openclaw 的配置差异 / Show diff for openclaw only

> 帮我把最新的 AI 记忆同步到本地 / Pull the latest AI memories to local

> 只拉取 openclaw 的配置 / Pull openclaw configs only

> 我修改了 MEMORY.md，帮我推送一下，描述是"更新项目记忆" / Push my MEMORY.md changes with note "update project memory"

> 只推送 claude 的配置 / Push claude configs only

> 生成明文快照，让我检查一下同步内容 / Generate a plaintext dump so I can inspect

## 输出说明 / Output Guide

### list
- `✔ 本地  ✔ 仓库` — 两侧均存在，已同步 / Present on both sides, in sync
- `✔ 本地  · 仓库` — 本地有但未推送 / Local only, not yet pushed
- `✖ 本地  ✔ 仓库` — 仓库有但本地缺失，执行 pull 还原 / In repo but missing locally, run pull
- `[enc]` — 该文件加密存储（AES-256-GCM）/ Encrypted (AES-256-GCM)
- `[字段]` — JSON 字段级提取（只同步指定字段）/ JSON field-level extraction (only syncs specified fields)

### diff
- `+` 绿色行 — 本地新增内容 / Green: local additions
- `-` 红色行 — 仓库有但本地已删除 / Red: removed locally
- 灰色行 — 上下文（未变化）/ Gray: context (unchanged)
- `[enc]` — 加密文件已自动解密后再对比 / Encrypted files auto-decrypted for comparison

### push / pull
- `[已加密]` / `[已解密]` — 经过 AES-256-GCM 处理 / Processed with AES-256-GCM
- `[已清理]` — 所有 agent 都已删除的文件从 repo 移除 / Stale files pruned from repo (delete propagation)
- `⚠ 本地独有` — pull 时检测到本地有但 repo 无的文件，建议 push / Local-only files detected, suggest push

## --agent 说明 / --agent Filter

所有命令均支持 `--agent` 过滤，只操作指定智能体的配置。

All commands support `--agent` to filter by agent.

| 值 / Value | 说明 / Description |
|----|------|
| `openclaw` | MEMORY.md(加密/enc)、AGENTS.md、SOUL.md — 默认/default ~/.openclaw/workspace/ |
| `claude`   | CLAUDE.md、settings.json(加密/enc)、.claude.json→mcpServers 字段提取(加密/enc) — 默认/default ~/.claude-internal/ |
| `gemini`   | settings.internal.json→security+model 字段提取(加密/enc) — 默认/default ~/.gemini/ |

不指定 `--agent` 时，同时操作所有已启用的 agent 及 shared 共享层（skills/MCP/共享记忆）。

When omitted, operates on all enabled agents plus the shared tier (skills/MCP/shared memory).

## 前置条件 / Prerequisites

1. Node.js ≥ 18
2. 已执行过 `wangchuan init`（~/.wangchuan/config.json 存在）/ `wangchuan init` has been run
3. 本地 SSH 密钥可访问目标 git 仓库 / Local SSH key has access to the target repo
4. 跨机器迁移时需手动复制 `~/.wangchuan/master.key` / Copy `master.key` manually when migrating across machines
