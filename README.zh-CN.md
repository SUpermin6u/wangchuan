# 忘川 (Wangchuan)

[English](README.md)

[![npm version](https://img.shields.io/npm/v/wangchuan)](https://www.npmjs.com/package/wangchuan)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.19.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 忘川是中国神话中冥界的遗忘之河，亡魂渡河饮水即忘前世一切记忆。 而 **忘川** 让你的 AI 智能体记忆在环境切换时永不遗失。

**忘川是一个 AI 智能体技能。** 安装一次，任何 AI 智能体（OpenClaw、Claude、Gemini、Codex……）都能跨机器同步配置、记忆、技能和 MCP 服务 —— 加密、版本化、冲突感知。

---

## 为什么是技能？

今天的 AI 智能体运行在孤立的环境里。换台电脑、重置容器、拿到新笔记本，每个 Agent 都要从零开始 —— 没记忆、没技能、没 MCP 配置。

忘川的解法是**融入 Agent 的大脑**：

```
用户: "初始化忘川"
Agent: (安装 CLI, 询问仓库地址, 自动探测本地全部 Agent,
        全量同步到云端, 启动后台拉取守护)

用户: "新增 xxx 技能"
Agent: (创建技能, 询问分发到哪些 Agent,
        复制到选中的 Agent, 推送到云端)

用户: "切换到 work 环境"
Agent: (同步当前变更, 切换分支, 拉取 work 环境数据,
        检查冲突, 重启后台守护)
```

**Agent 负责一切。** 你只需要对话。技能文件（`skill/SKILL.md`）教会 Agent 如何管理你的记忆 —— 不需要手动敲 CLI。

### 技能架构

```
skill/
├── SKILL.md                    ← Agent 加载此文件（~100 行，路由表）
├── references/
│   ├── resource-crud.md        ← 技能/Agent/MCP/记忆 增删改查
│   ├── sync-conflict.md        ← 推送/拉取/冲突解决
│   ├── environment.md          ← 环境管理、回退、快照
│   ├── inspect-status.md       ← 资源查看、健康诊断
│   └── install-setup.md        ← 初始化、密钥管理
└── wangchuan-skill.sh          ← OpenClaw Shell 包装器
```

主文件 SKILL.md 控制在 120 行以内。Agent 遇到具体任务（如"删除技能"）时，按需加载对应的参考文件 —— 渐进式加载，不是一股脑灌 prompt。

### 技能基准测试

每次技能变更都经过 **51 个测试用例**（`test/skill-benchmark.md`）验证：

- 29 条用户指令（初始化、4 种资源的增删改查、推送/拉取、回退、环境管理）
- 4 个环境隔离场景（跨环境拉取、工作空间泄漏、恢复时环境选择、watch 重启）
- 全局规则（watch 自动启动、环境感知同步、非 TTY 约束）

### 安装技能

```bash
# 安装 CLI
npm install -g wangchuan

# 首次同步后技能自动分发到所有 Agent
# 或手动复制到某个 Agent：
cp -r skill/ ~/.claude/skills/wangchuan/
```

---

## 快速开始

```bash
npm install -g wangchuan

# 初始化 — 自动检测已安装的智能体并执行首次同步
wangchuan init

# 在新机器上（支持任意 Git 托管）：
wangchuan init --repo git@github.com:you/brain.git --key wangchuan_<hex>
```

---

## 命令列表

| 命令 | 别名 | 描述 | 主要参数 |
|------|------|------|----------|
| `init` | — | 首次初始化 — 自动检测智能体，支持一键创建仓库（GitHub CLI），执行首次同步 | `--repo`、`--key`、`--force` |
| `sync` | `s` | 智能双向同步 — 日常唯一命令 | `-a, --agent`、`-n, --dry-run`、`-o, --only`、`-x, --exclude` |
| `status` | `st` | 一屏总览 + 健康评分 | `-v, --verbose` |
| `watch` | — | 仅拉取的后台守护进程，持续同步云端变更 | `-i, --interval <分钟>` |
| `doctor` | — | 诊断 + 自动修复所有问题 | `--key-export`、`--key-rotate`、`--setup` |
| `memory` | — | 浏览/复制智能体记忆 | `list`、`show`、`copy`、`broadcast` |
| `env` | — | 多环境管理 | `list`、`create`、`switch`、`current`、`delete` |
| `snapshot` | `snap` | 管理同步快照 | `save`、`list`、`restore`、`delete` |
| `lang` | — | 切换显示语言 | `zh`、`en` |

---

## 支持的智能体

| 智能体 | 默认路径 | 同步内容 |
|--------|---------|----------|
| **OpenClaw** | `~/.openclaw/workspace/` | MEMORY.md（加密）、AGENTS.md、SOUL.md、TOOLS.md、IDENTITY.md、USER.md（加密）、HEARTBEAT.md、memory/（加密）、openclaw.json → agents/skills/ui（加密）、skills/ |
| **Claude** | `~/.claude/` | CLAUDE.md、settings.json（加密）、`.claude.json` → mcpServers（加密）、commands/（目录）、plugins/（已安装 + 市场源） |
| **Gemini** | `~/.gemini/` | `settings.internal.json` → security + model + general（加密）、skills/（目录） |
| **CodeBuddy** | `~/.codebuddy/` | MEMORY.md（加密）、CODEBUDDY.md、mcp.json → mcpServers（加密）、settings.json → enabledPlugins + hooks（加密）、plugins/（市场源） |
| **WorkBuddy** | `~/.workbuddy/` | MEMORY.md（加密）、IDENTITY.md、SOUL.md、USER.md（加密）、BOOTSTRAP.md、mcp.json → mcpServers（加密）、settings.json → enabledPlugins + hooks（加密）、skills/（目录）、extensions/ |
| **Cursor** | `~/.cursor/` | rules/（目录）、mcp.json → mcpServers（加密）、cli-config.json → 字段（加密）、extensions/、hooks.json |
| **Codex** | `~/.codex/` | MEMORY.md（加密）、instructions.md、config.toml（加密）、skills/（目录）、memories/（加密） |

各智能体的 `workspacePath` 均可在 `~/.wangchuan/config.json` 中自定义。

---

## 功能特性

### 加密
- **AES-256-GCM** 认证加密 — 防篡改
- 密钥存储在本地 `~/.wangchuan/master.key`（永不提交）
- 密文格式：`IV(12B) + AuthTag(16B) + CipherText` → Base64 → `.enc`

### 跨智能体共享
- 技能、MCP 配置和自定义子智能体自动分发到所有智能体
- MCP 配置合并为一份共享云端文件（`shared/mcp/mcpServers.json.enc`）
- 删除传播 — 所有智能体都删除后自动从仓库清理

### 三路合并
- 自动冲突解决，支持 `.md`、`.txt`、`.json`、`.yaml`、`.yml`
- 不重叠编辑 → 静默合并
- 重叠冲突 → 写入冲突标记供用户解决
- Watch 守护记录无法自动解决的冲突到 `pending-conflicts.json`，下次交互时提示

### 多环境管理
- 创建隔离环境：`wangchuan env create work`
- 即时切换：`wangchuan env switch work`
- Git 分支级隔离；共享本地工作空间，自动检测泄漏

### Watch 守护进程（仅拉取）
- `wangchuan watch` 持续在后台拉取云端变更
- **不会推送** — 用户需手动 `wangchuan sync` 推送
- 技能每次交互后自动启动
- 环境切换时自动重启

### 快照回滚
- 每次同步前自动创建快照（安全网）
- 命名快照：`wangchuan snapshot save before-refactor`
- 恢复：`wangchuan snapshot restore <name>`（自动推送到云端）

---

## 支持的 Git 托管

忘川支持**任意 Git 托管**，只要支持 SSH 或 HTTPS 协议：

| 平台 | 仓库地址示例 |
|------|------------|
| **GitHub** | `git@github.com:you/brain.git` |
| **GitLab** | `git@gitlab.com:you/brain.git` |
| **Gitee（码云）** | `git@gitee.com:you/brain.git` |
| **Bitbucket** | `git@bitbucket.org:you/brain.git` |
| **Gitea** | `git@gitea.example.com:you/brain.git` |
| **自建服务** | 任意 SSH/HTTPS Git 地址 |

> **提示**：已安装 GitHub CLI（`gh`）时，`wangchuan init` 可一键创建私有仓库。

---

## 配置文件

位于 `~/.wangchuan/config.json`：

```jsonc
{
  "repo": "git@github.com:you/brain.git",
  "branch": "main",
  "localRepoPath": "~/.wangchuan/repo",
  "keyPath": "~/.wangchuan/master.key",
  "version": 2,
  "profiles": {
    "default": {
      "openclaw": { "enabled": true, "workspacePath": "~/.openclaw/workspace" },
      "claude":   { "enabled": true, "workspacePath": "~/.claude" },
      "gemini":   { "enabled": true, "workspacePath": "~/.gemini" }
    }
  },
  "shared": {
    "skills": { "sources": [{ "agent": "claude", "dir": "skills/" }] },
    "mcp":    { "sources": [{ "agent": "claude", "src": ".claude.json", "field": "mcpServers" }] },
    "syncFiles": []
  }
}
```

---

## 安全规范

1. `master.key` 已加入 `.gitignore`，不会意外提交
2. 同步前自动扫描明文 token
3. 迁移密钥请用加密方式传输
4. ⚠️ **master.key 丢失将无法解密历史配置，请做好备份！**

---

## 安装

```bash
npm install -g wangchuan
```

从源码安装：

```bash
git clone https://github.com/SUpermin6u/wangchuan.git
cd wangchuan && npm install && npm run build && npm link
```

需要 Node.js ≥ 18.19.0。

---

## 许可证

MIT
