# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**忘川 (Wangchuan)** — AI 记忆同步系统。TypeScript CLI 工具，让 AI 智能体（Claude/Gemini/OpenClaw）的配置和记忆通过 Git 仓库加密同步，支持跨环境迁移和一键还原。

## Build & Dev Commands

```bash
npm run build        # tsc 编译 → dist/（postbuild 自动 chmod +x）
npm run dev          # tsx 直接运行，无需编译：npm run dev -- pull --agent claude
npm run test         # 运行全部测试（crypto + json-field + sync）
npm run typecheck    # tsc --noEmit 类型检查
```

开发时用 `npm run dev -- <command> [flags]` 直接运行 CLI，无需先 build。

## Architecture

ES Modules (`"type": "module"`)，Node.js ≥ 18.19.0，严格 TypeScript（`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）。

### 三层同步架构

Repo 结构分两层：
- `shared/` — 跨 agent 共享资源（skills 合并、MCP 配置共享、共享记忆 SHARED.md）
- `agents/<name>/` — per-agent 跨环境同步（MEMORY.md、CLAUDE.md、settings 等）

配置版本号 `version: 2`，旧版本自动迁移（`migrate.ts`）。

### 同步原则

- **repo 是 single source of truth**：push 时本地所有 agent 都没有的条目 → 从 repo 清理；pull 时 repo 没有的 → 不分发
- **新增自动共享**：任一 agent 新增 skill 或 MCP server → push 时自动分发到所有 agent
- **删除可传播**：所有 agent 都删除某 skill/MCP → push 后从 repo 清理 → 其他环境 pull 时自然消失
- **不覆盖已有**：分发 skill/MCP 时，目标 agent 已有同名条目则保留原样
- **pull 检测 localOnly**：本地有但 repo 没有的文件会提示用户 push

### Core Engines (`src/core/`)

- **sync.ts** — 同步引擎。`buildFileEntries()` 是文件条目的单一事实来源，统一循环处理三个 agent + shared tier。支持三种条目类型：`syncFiles`（整文件）、`syncDirs`（目录递归）、`jsonFields`（JSON 字段级提取）。`distributeShared` 在 push 前将 skills/MCP 分发到各 agent。`pruneRepoStaleFiles` 在 push 后清理 repo 中的过期文件。`stageToRepo` / `restoreFromRepo` / `diff` 三向操作。
- **json-field.ts** — JSON 字段级提取与合并。`extractFields` 从大 JSON 中 pick 指定字段，`mergeFields` 将字段 merge 回目标 JSON 不破坏其他内容。用于 `.claude.json` 仅同步 `mcpServers` 而不同步 tipsHistory/projects 等无用字段。
- **crypto.ts** — AES-256-GCM 加解密，密文格式 `[IV 12B][AuthTag 16B][CipherText] → Base64 → .enc`。密钥存储于 `~/.wangchuan/master.key`（0o600 权限）。
- **git.ts** — simple-git 封装。`cloneOrFetch` 幂等，`commitAndPush` 无变更时返回 `{committed: false}`，失败时 `rollback` 执行 `git reset --soft HEAD~1`。
- **config.ts** — 配置管理 `~/.wangchuan/config.json`。`DEFAULT_PROFILES` 定义 per-agent 同步策略，`DEFAULT_SHARED` 定义跨 agent 共享策略。`CONFIG_VERSION` 控制迁移。
- **migrate.ts** — 版本迁移。`ensureMigrated()` 在每个命令执行前自动检测并迁移旧配置（v1→v2：repo 结构变更、skills 合并、清理无用文件）。迁移前自动备份到 `~/.wangchuan/backup-v1/`，失败时自动回滚。

### Commands (`src/commands/`)

七个命令：`init`、`pull`、`push`、`status`、`diff`、`list`、`dump`。均支持 `--agent openclaw|claude|gemini` 过滤。每个命令（除 init 外）在 `config.load()` 后调用 `ensureMigrated()` 确保配置已升级。

### Type System (`src/types.ts`)

所有接口使用 `readonly` 修饰。核心类型：
- `AgentProfile` — 统一的 agent 配置（syncFiles/syncDirs/jsonFields）
- `JsonFieldEntry` — JSON 字段级提取配置
- `SharedConfig` — 跨 agent 共享配置（skills sources、MCP sources、共享文件）
- `FileEntry` — 同步条目（`agentName: AgentName | 'shared'`，可选 `jsonExtract`）
- `StageResult` — push 结果（含 `deleted` 过期文件清理列表）
- `RestoreResult` — pull 结果（含 `localOnly` 本地独有文件列表）

## Import Conventions

所有内部导入必须带 `.js` 后缀（NodeNext module resolution）：
```typescript
import { cryptoEngine } from '../core/crypto.js';
```

## Testing

测试框架为 Node.js 内置 `node:test`，测试文件在 `test/` 目录，通过 tsx 加载。覆盖 crypto 模块、json-field 模块和 sync 同步引擎（含共享分发、删除传播、一键还原、JSON 容错等 42 个用例）。

## Release Checklist

每次提交代码前必须按顺序执行：

1. **隐私检查**：确认代码和配置中没有泄露 token、apiKey、密码等敏感信息
2. **更新文档**：同步更新 `CLAUDE.md`、`README.md`、`REQUIREMENTS.md`、`skill/SKILL.md`，确保与代码变更一致
3. **升级版本号**：修改 `package.json` 的 `version` 字段（遵循 semver：breaking change → major，新功能 → minor，bugfix → patch）
4. **类型检查 + 测试**：`npm run typecheck && npm test` 全部通过
5. **提交推送**：git commit + push
6. **发布 npm**：`npm publish`
