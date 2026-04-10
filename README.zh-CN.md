# 忘川 (Wangchuan)

[English](README.md)

[![npm version](https://img.shields.io/npm/v/wangchuan)](https://www.npmjs.com/package/wangchuan)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.19.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> AI 记忆加密同步 — 跨机器、跨智能体，永不遗失。

忘川通过私有 Git 仓库加密同步你的 AI 智能体配置、记忆和技能。一条命令同步，一个守护进程保持全局最新。

---

## 快速开始

```bash
npm install -g wangchuan

# 1. 初始化 — 自动检测已安装的智能体并执行首次同步
wangchuan init

# 2. 启动后台守护进程（可选）
wangchuan watch
```

在新机器上：

```bash
wangchuan init --repo git@github.com:you/brain.git --key /path/to/master.key
```

---

## 命令列表

| 命令 | 别名 | 描述 | 主要参数 |
|------|------|------|----------|
| `init` | — | 首次初始化 — 自动检测智能体，支持 `gh repo create` 创建仓库，执行首次同步 | `--repo`、`--key`、`--force` |
| `sync` | `s` | 智能双向同步 — 日常唯一命令 | `-a, --agent`、`-n, --dry-run`、`-o, --only`、`-x, --exclude` |
| `status` | `st` | 一屏总览 + 健康评分 | `-v, --verbose` |
| `watch` | — | 后台守护进程，持续自动同步 | `-i, --interval <分钟>` |
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
| **Claude** | `~/.claude/` | CLAUDE.md、settings.json（加密）、`.claude.json` → mcpServers（加密） |
| **Gemini** | `~/.gemini/` | `settings.internal.json` → security + model + general（加密） |
| **CodeBuddy** | `~/.codebuddy/` | MEMORY.md（加密）、CODEBUDDY.md、mcp.json → mcpServers（加密）、settings.json → enabledPlugins（加密） |
| **WorkBuddy** | `~/.workbuddy/` | MEMORY.md（加密）、IDENTITY.md、SOUL.md、USER.md（加密）、mcp.json → mcpServers（加密） |
| **Cursor** | `~/.cursor/` | rules/（目录）、mcp.json → mcpServers（加密）、cli-config.json → 字段（加密） |
| **Codex** | `~/.codex/` | AGENTS.md、instructions.md |

各智能体的 `workspacePath` 均可在 `~/.wangchuan/config.json` 中自定义。

---

## 功能特性

### 加密
- **AES-256-GCM** 认证加密 — 防篡改
- 密钥存储在本地 `~/.wangchuan/master.key`（永不提交）
- 密文格式：`IV(12B) + AuthTag(16B) + CipherText` → Base64 → `.enc`
- 每次同步前自动扫描泄露的 token

### 跨智能体共享
- Skills、MCP 配置和自定义子智能体自动分发到所有智能体
- `agents/` 目录中的自定义子智能体通过 `shared/agents/` 在 Claude/Cursor/CodeBuddy/WorkBuddy 间同步
- 删除传播 — 所有智能体都删除后自动从仓库清理
- 已有条目不会被覆盖

### 快照回滚
- `wangchuan snapshot save [name]` — 在危险操作前保存命名快照
- `wangchuan snapshot list` — 查看所有已保存的快照
- `wangchuan snapshot restore <name>` — 回滚到指定快照
- `wangchuan snapshot delete <name>` — 删除快照

### 自定义智能体注册
- 在 `config.json` 中通过 `customAgents` 字段定义自定义智能体，无需重新编译
- 自定义智能体与内置智能体一样参与同步

### 扩展冲突解决
- 三方合并现在支持 `.json`、`.yaml`、`.yml` 文件（除 `.md`/`.txt` 外）

### 多环境管理
- 创建隔离环境：`wangchuan env create work`
- 即时切换：`wangchuan env switch work`
- 每个环境拥有独立的智能体配置

### Watch 守护进程
- `wangchuan watch` 持续后台同步
- 可配置间隔：`wangchuan watch -i 10`
- PID 单例 — 每台机器只运行一个实例

### 记忆浏览
- `wangchuan memory list` — 查看所有智能体记忆概览
- `wangchuan memory show <agent>` — 列出所有文件；支持模糊/子串匹配，不匹配时给出建议
- `wangchuan memory copy openclaw claude` — 在智能体间传输记忆
- `wangchuan memory broadcast claude` — 将记忆广播到所有智能体

### 诊断修复
- 自动发现已安装的智能体
- 检测残留/幻影文件
- `--key-export` / `--key-rotate` 密钥管理
- `--setup` 生成新机器迁移命令

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
2. 同步前自动扫描明文 token（`api_key`、`sk-xxx`、`password` 等）
3. 迁移密钥请用加密方式传输
4. ⚠️ **master.key 丢失将无法解密历史配置，请做好备份！**

---

## 安装

```bash
npm install -g wangchuan
```

从源码安装：

```bash
git clone https://github.com/nicepkg/wangchuan.git
cd wangchuan && npm install && npm run build && npm link
```

需要 Node.js ≥ 18.19.0。

---

## 许可证

MIT
