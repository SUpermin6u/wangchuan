# 忘川 · Wangchuan - 智能体永久记忆共享系统

## 项目概述

**中文名：忘川**  
**英文名：Wangchuan**  
**仓库名：wangchuan**  

忘川是中国神话中冥界的遗忘之河，亡魂渡河、饮水即忘前世一切记忆。而 Wangchuan 系统让你的 AI 记忆在环境切换时永不遗失。

## 需求背景

用户需要在不同环境（DevCloud、本地、VPS 等）调教和配置 claude、gemini、openclaw 等智能体，希望重要的配置信息可以共享和迁移，避免人工复制粘贴和重复调试。

## MVP 功能需求（第一期）

### 核心功能

1. **配置拉取（pull）**：从工蜂私有仓库同步配置到本地
2. **配置推送（push）**：将本地配置推送到工蜂私有仓库
3. **状态查看（status）**：查看当前同步状态和差异
4. **初始化（init）**：首次配置忘川系统

### 支持同步的配置

#### OpenClaw 配置
- `~/.openclaw/workspace/MEMORY.md` - 永久记忆（加密）
- `~/.openclaw/workspace/AGENTS.md` - Agent 行为准则
- `~/.openclaw/workspace/SOUL.md` - Agent 人格设定

#### Claude 配置
- `~/.claude-internal/CLAUDE.md` - 全局指令
- `~/.claude-internal/settings.json` - 权限/插件/模型（加密）
- `~/.claude-internal/.claude.json` → `mcpServers` 字段 - JSON 字段级提取（加密）

#### Gemini 配置
- `~/.gemini/settings.internal.json` → `security`, `model` 字段 - JSON 字段级提取（加密）

#### Shared 共享层
- `shared/skills/` - 从 Claude 和 OpenClaw 的 skills 目录汇聚，自动分发
- `shared/mcp/` - 各 agent 的 MCP 配置提取，跨 agent 共享
- `shared/memory/SHARED.md` - 跨 agent 共享记忆（加密）

> **v1→v2 变更**：移除了不再同步的文件（USER.md、TOOLS.md、config/mcporter.json 整文件、.claude.json 整文件、projects.json、trustedFolders.json）。Claude/Gemini 改为 JSON 字段级提取，只同步有用字段。

## 技术要求

### 目录结构

```
wangchuan/
├── README.md
├── REQUIREMENTS.md
├── package.json
├── .gitignore
├── bin/
│   └── wangchuan.ts            CLI 入口
├── src/
│   ├── core/
│   │   ├── sync.ts             同步引擎（分发、清理、三向操作）
│   │   ├── json-field.ts       JSON 字段级提取与合并
│   │   ├── crypto.ts           AES-256-GCM 加解密
│   │   ├── git.ts              simple-git 封装
│   │   ├── config.ts           配置管理（v2）
│   │   └── migrate.ts          v1→v2 迁移
│   ├── commands/
│   │   ├── init.ts             初始化命令
│   │   ├── pull.ts             拉取命令
│   │   ├── push.ts             推送命令
│   │   ├── status.ts           状态命令
│   │   ├── diff.ts             差异命令
│   │   ├── list.ts             清单命令
│   │   └── dump.ts             明文快照命令
│   ├── utils/
│   │   ├── logger.ts           日志工具
│   │   ├── validator.ts        验证工具
│   │   ├── linediff.ts         行级差异
│   │   └── prompt.ts           交互式提示
│   └── types.ts                全局类型定义
├── skill/
│   ├── SKILL.md                OpenClaw Skill 文档
│   └── wangchuan-skill.sh      Skill 脚本
├── test/
│   ├── crypto.test.ts          加密测试
│   ├── json-field.test.ts      JSON 字段测试
│   └── sync.test.ts            同步引擎测试
└── .wangchuan/
    └── config.example.json     配置示例（v2）
```

### 加密方案

- 使用 Node.js 内置 `crypto` 模块
- 算法：AES-256-GCM
- 密钥存储：`~/.wangchuan/master.key`（本地，不提交）
- 敏感文件以 `.enc` 后缀存储在仓库

### Git 操作

- 使用 `simple-git` npm 包
- 仓库地址：`git@github.com:SUpermin6u/wangchuan.git`
- 分支策略：main 分支
- 提交信息格式：`sync: <操作描述> [<环境>]`

### CLI 命令设计

```bash
# 初始化（首次使用）
wangchuan init --repo git@github.com:SUpermin6u/wangchuan.git

# 拉取远程配置
wangchuan pull

# 推送本地配置
wangchuan push --message "更新配置"

# 查看状态
wangchuan status

# 对比差异
wangchuan diff
```

### OpenClaw Skill 封装

创建 `SKILL.md` 和对应脚本，支持：
- `wangchuan pull` - 拉取同步
- `wangchuan push --message "<msg>"` - 推送更新
- `wangchuan status` - 查看状态

## 安全要求

1. 敏感配置（包含 token/apiKey）必须加密
2. 密钥文件不得提交到 Git
3. 推送前自动检查是否包含明文 token
4. 提供 `.gitignore` 模板防止误提交

## 开发规范

1. 使用 ES6+ 语法
2. 模块化设计，职责清晰
3. 完善的错误处理和日志记录
4. 命令执行前进行必要的验证
5. 提供友好的用户提示信息

## 交付物

1. 完整可运行的 CLI 工具
2. OpenClaw Skill 封装
3. README.md 使用文档
4. `.gitignore` 和 `.wangchuan/config.example.json`
5. 基础测试用例

## 非功能需求

- 性能：单次同步操作 < 5 秒（正常网络条件）
- 可靠性：同步失败自动回滚
- 易用性：命令简洁，提示清晰
- 可扩展性：易于添加新的配置项和智能体支持

## 后续规划（Phase 2）

- 版本历史管理（配置回滚到指定时间点）
- 多环境 Profile 切换（dev/staging/prod 不同配置集）
- 定时自动同步（cron / watch 模式）
- Web UI 管理界面
