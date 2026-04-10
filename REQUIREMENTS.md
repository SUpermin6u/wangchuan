# 忘川 · Wangchuan - 智能体永久记忆共享系统 / AI Agent Permanent Memory Sharing System

## 项目概述 / Overview

**中文名：忘川 / Chinese name: Wangchuan (忘川)**
**英文名：Wangchuan**
**仓库名：wangchuan**

忘川是中国神话中冥界的遗忘之河，亡魂渡河、饮水即忘前世一切记忆。而 Wangchuan 系统让你的 AI 记忆在环境切换时永不遗失。

In Chinese mythology, Wangchuan is the River of Oblivion — souls crossing it forget all past memories. The Wangchuan system ensures your AI memories are never lost across environments.

## 需求背景 / Background

用户需要在不同环境（DevCloud、本地、VPS 等）调教和配置 claude、gemini、openclaw 等智能体，希望重要的配置信息可以共享和迁移，避免人工复制粘贴和重复调试。

Users need to configure AI agents (Claude, Gemini, OpenClaw) across different environments (DevCloud, local, VPS, etc.) and want their configurations to be shareable and migratable, eliminating manual copy-paste and repeated tuning.

## MVP 功能需求（第一期）/ MVP Requirements (Phase 1)

### 核心功能 / Core Features

1. **配置拉取（pull）/ Config Pull**：从私有仓库同步配置到本地 / Sync configs from private repo to local
2. **配置推送（push）/ Config Push**：将本地配置推送到私有仓库 / Push local configs to private repo
3. **状态查看（status）/ Status Check**：查看当前同步状态和差异 / View current sync status and diff
4. **初始化（init）/ Initialize**：首次配置忘川系统 / First-time system setup
5. **差异对比（diff）/ Diff**：逐文件行级差异比较 / Per-file line-level diff
6. **清单列表（list）/ List**：列出所有托管文件 / List all managed files
7. **明文快照（dump）/ Dump**：生成明文快照到临时目录 / Generate plaintext snapshot to temp dir
8. **语言切换（lang）/ Language**：切换 CLI 显示语言 zh/en / Switch CLI display language zh/en

### 支持同步的配置 / Sync Scope

#### OpenClaw 配置 / OpenClaw Configs
- `~/.openclaw/workspace/MEMORY.md` - 永久记忆（加密）/ Long-term memory (encrypted)
- `~/.openclaw/workspace/AGENTS.md` - Agent 行为准则 / Agent behavior rules
- `~/.openclaw/workspace/SOUL.md` - Agent 人格设定 / Agent persona

#### Claude 配置 / Claude Configs
- `~/.claude/CLAUDE.md` - 全局指令 / Global instructions
- `~/.claude/settings.json` - 权限/插件/模型（加密）/ Permissions/plugins/model (encrypted)
- `~/.claude/.claude.json` → `mcpServers` 字段 - JSON 字段级提取（加密）/ JSON field-level extraction (encrypted)

#### Gemini 配置 / Gemini Configs
- `~/.gemini/settings.internal.json` → `security`, `model` 字段 - JSON 字段级提取（加密）/ JSON field-level extraction (encrypted)

#### Shared 共享层 / Shared Tier
- `shared/skills/` - 从 Claude 和 OpenClaw 的 skills 目录汇聚，自动分发 / Merged from all agents, auto-distributed
- `shared/mcp/` - 各 agent 的 MCP 配置提取，跨 agent 共享 / Extracted MCP configs, cross-agent sharing
- `shared/memory/SHARED.md` - 跨 agent 共享记忆（加密）/ Cross-agent shared memory (encrypted)

> **v1→v2 变更 / v1→v2 Changes**：移除了不再同步的文件（USER.md、TOOLS.md、config/mcporter.json 整文件、.claude.json 整文件、projects.json、trustedFolders.json）。Claude/Gemini 改为 JSON 字段级提取，只同步有用字段。/ Removed obsolete files; Claude/Gemini switched to JSON field-level extraction.

## 技术要求 / Technical Requirements

### 目录结构 / Project Structure

```
wangchuan/
├── README.md
├── REQUIREMENTS.md
├── package.json
├── .gitignore
├── bin/
│   └── wangchuan.ts            CLI 入口 / CLI entry
├── src/
│   ├── core/
│   │   ├── sync.ts             同步引擎 / Sync engine
│   │   ├── json-field.ts       JSON 字段级提取与合并 / JSON field extraction & merge
│   │   ├── crypto.ts           AES-256-GCM 加解密 / AES-256-GCM encrypt/decrypt
│   │   ├── git.ts              simple-git 封装 / simple-git wrapper
│   │   ├── config.ts           配置管理（v2）/ Config management (v2)
│   │   └── migrate.ts          v1→v2 迁移 / v1→v2 migration
│   ├── commands/
│   │   ├── init.ts             初始化命令 / init command
│   │   ├── pull.ts             拉取命令 / pull command
│   │   ├── push.ts             推送命令 / push command
│   │   ├── status.ts           状态命令 / status command
│   │   ├── diff.ts             差异命令 / diff command
│   │   ├── list.ts             清单命令 / list command
│   │   ├── dump.ts             明文快照命令 / dump command
│   │   └── lang.ts             语言切换命令 / lang command
│   ├── utils/
│   │   ├── logger.ts           日志工具 / Logger
│   │   ├── validator.ts        验证工具 / Validator
│   │   ├── linediff.ts         行级差异 / Line diff
│   │   └── prompt.ts           交互式提示 / Interactive prompt
│   ├── i18n.ts                国际化消息字典 / i18n message dictionary
│   └── types.ts                全局类型定义 / Global type definitions
├── skill/
│   ├── SKILL.md                OpenClaw Skill 文档 / OpenClaw Skill doc
│   └── wangchuan-skill.sh      Skill 脚本 / Skill script
├── test/
│   ├── crypto.test.ts          加密测试 / Crypto tests
│   ├── json-field.test.ts      JSON 字段测试 / JSON field tests
│   └── sync.test.ts            同步引擎测试 / Sync engine tests
└── .wangchuan/
    └── config.example.json     配置示例（v2）/ Config example (v2)
```

### 加密方案 / Encryption

- 使用 Node.js 内置 `crypto` 模块 / Uses Node.js built-in `crypto` module
- 算法 / Algorithm：AES-256-GCM
- 密钥存储 / Key storage：`~/.wangchuan/master.key`（本地，不提交 / local, never committed）
- 敏感文件以 `.enc` 后缀存储在仓库 / Sensitive files stored as `.enc` in repo

### Git 操作 / Git Operations

- 使用 `simple-git` npm 包 / Uses `simple-git` npm package
- 仓库地址 / Repo：`git@github.com:SUpermin6u/wangchuan.git`
- 分支策略 / Branch strategy：main 分支 / main branch
- 提交信息格式 / Commit message format：`sync: <中文描述> / <english> [<agent>][<环境>]`

### CLI 命令设计 / CLI Commands

```bash
# 初始化（首次使用）/ Initialize (first use)
wangchuan init --repo git@github.com:SUpermin6u/wangchuan.git

# 拉取远程配置 / Pull remote configs
wangchuan pull

# 推送本地配置 / Push local configs
wangchuan push --message "更新配置"

# 查看状态 / Check status
wangchuan status

# 对比差异 / Compare diff
wangchuan diff

# 明文快照 / Plaintext snapshot
wangchuan dump

# 切换语言 / Switch language
wangchuan lang zh
wangchuan lang en
```

### OpenClaw Skill 封装 / OpenClaw Skill Wrapper

创建 `SKILL.md` 和对应脚本，支持 / Create `SKILL.md` and script, supporting:
- `wangchuan pull` - 拉取同步 / Pull sync
- `wangchuan push --message "<msg>"` - 推送更新 / Push update
- `wangchuan status` - 查看状态 / Check status

## 安全要求 / Security Requirements

1. 敏感配置（包含 token/apiKey）必须加密 / Sensitive configs must be encrypted
2. 密钥文件不得提交到 Git / Key files must never be committed
3. 推送前自动检查是否包含明文 token / Auto-check for plaintext tokens before push
4. 提供 `.gitignore` 模板防止误提交 / Provide `.gitignore` template to prevent accidental commits

## 开发规范 / Development Standards

1. 使用 ES6+ 语法 / ES6+ syntax
2. 模块化设计，职责清晰 / Modular design, clear separation of concerns
3. 完善的错误处理和日志记录 / Comprehensive error handling and logging
4. 命令执行前进行必要的验证 / Pre-execution validation
5. 提供友好的用户提示信息 / User-friendly prompts and messages

## 交付物 / Deliverables

1. 完整可运行的 CLI 工具 / Fully functional CLI tool
2. OpenClaw Skill 封装 / OpenClaw Skill wrapper
3. README.md 使用文档（中英对照）/ README.md documentation (bilingual)
4. `.gitignore` 和 `.wangchuan/config.example.json`
5. 基础测试用例 / Test suite

## 非功能需求 / Non-functional Requirements

- 性能 / Performance：单次同步操作 < 5 秒 / Single sync < 5 seconds (normal network)
- 可靠性 / Reliability：同步失败自动回滚 / Auto-rollback on failure
- 易用性 / Usability：命令简洁，提示清晰 / Concise commands, clear prompts
- 可扩展性 / Extensibility：易于添加新的配置项和智能体支持 / Easy to add new configs and agents

## 后续规划（Phase 2）/ Roadmap (Phase 2)

- ~~版本历史管理（配置回滚到指定时间点）~~ ✅ Implemented as `wangchuan snapshot` (save/list/restore/delete)
- ~~多环境 Profile 切换（dev/staging/prod 不同配置集）~~ ✅ Implemented as `wangchuan env`
- ~~定时自动同步（cron / watch 模式）~~ ✅ Implemented as `wangchuan watch`
- Web UI 管理界面 / Web UI management interface
