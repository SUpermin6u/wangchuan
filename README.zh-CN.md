# 忘川 (Wangchuan)

[English](README.md)

> 忘川是中国神话中冥界的遗忘之河，亡魂渡河饮水即忘前世一切记忆。
> 而 **忘川** 让你的 AI 智能体记忆在环境切换时永不遗失。

AI 记忆同步系统 — 加密备份与跨环境迁移。支持 **7 种智能体**：OpenClaw、Claude、Gemini、CodeBuddy、WorkBuddy、Cursor、Codex。

[![npm version](https://img.shields.io/npm/v/wangchuan)](https://www.npmjs.com/package/wangchuan)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.19.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 功能特性

- **AES-256-GCM 加密** — 密钥本地存储，永不提交 Git
- **7 种智能体** — OpenClaw、Claude、Gemini、CodeBuddy、WorkBuddy、Cursor、Codex
- **跨 agent 共享** — Skills 和 MCP 配置自动在所有 agent 间分发
- **JSON 字段级同步** — 提取指定字段（如从 `.claude.json` 只同步 `mcpServers`）
- **删除传播** — 所有 agent 都删除的 skill/MCP 自动从仓库清理
- **一键还原** — 新服务器 `init + pull` 即可完整恢复所有 agent 配置
- **冲突解决** — 拉取时交互式选择覆盖/跳过
- **自动回滚** — 失败自动回滚，不污染仓库历史
- **多语言** — 完整中英文 CLI 支持，通过 `wangchuan lang zh|en` 切换
- **明文扫描** — 推送前自动检测泄露的 token/密钥
- **配置迁移** — 自动 v1→v2 迁移，含备份和回滚保护

---

## 命令列表

| 命令 | 描述 |
|------|------|
| `init` | 初始化系统、生成 AES-256-GCM 密钥、克隆私有仓库 |
| `pull` | 从仓库拉取并解密配置，还原到本地工作区 |
| `push` | 将本地配置加密推送到仓库 |
| `sync` | 双向同步（先拉取再推送） |
| `status` | 查看仓库状态、工作区差异与文件清单 |
| `diff` | 逐文件显示本地与仓库的行级差异（自动解密） |
| `list` | 列出所有托管文件，显示本地/仓库存在状态 |
| `dump` | 生成明文快照到临时目录，方便检查同步内容 |
| `lang` | 切换 CLI 显示语言（zh/en） |
| `watch` | 监听文件变化并自动同步 |
| `env` | 管理同步环境（创建/切换/列出/删除） |
| `agent` | 管理智能体（列出/启用/禁用/设置路径/详情） |
| `key` | 密钥管理（导出/导入/轮换） |
| `report` | 生成同步报告 |
| `doctor` | 诊断并修复常见问题 |
| `history` | 查看同步操作历史 |
| `snapshot` | 创建/恢复/列出时间点快照 |
| `summary` | 显示同步统计摘要 |
| `setup` | 引导式交互初始化向导 |
| `health` | 系统健康检查 |
| `search` | 搜索已同步的文件 |
| `config` | 配置导出/导入管理 |
| `changelog` | 查看同步变更日志 |
| `tag` | 记忆标签系统 |
| `cleanup` | 清理过期记忆条目 |
| `template` | 应用预设同步配置模板 |
| `batch` | 批量执行多个命令 |
| `completions` | 生成 shell 自动补全脚本（bash/zsh） |

所有命令支持 `--agent <name>` 过滤（`lang` 除外）。

---

## 安装

```bash
npm install -g wangchuan
```

或从源码安装：

```bash
git clone https://github.com/nicepkg/wangchuan.git
cd wangchuan
npm install
npm run build
npm link
```

---

## 快速开始

### 1. 初始化

```bash
wangchuan init --repo git@github.com:yourname/your-brain.git
```

执行后创建：
- `~/.wangchuan/config.json` — 系统配置
- `~/.wangchuan/master.key` — 主密钥（**请妥善保管**）
- `~/.wangchuan/repo` — 本地仓库克隆

### 2. 推送本地配置

```bash
wangchuan push -m "初始化配置"
```

### 3. 在新环境拉取记忆

```bash
wangchuan init --repo git@github.com:yourname/your-brain.git --key /path/to/master.key
wangchuan pull
```

### 4. 查看同步状态

```bash
wangchuan status
```

### 5. 切换显示语言

```bash
wangchuan lang en      # 切换到英文
wangchuan lang zh      # 切换到中文
WANGCHUAN_LANG=en wangchuan status   # 环境变量覆盖
```

### 6. 只操作指定智能体

```bash
wangchuan push --agent claude -m "更新 Claude 配置"
wangchuan pull --agent openclaw
wangchuan diff --agent gemini
```

---

## 支持的智能体

| 智能体 | 默认路径 | 同步文件 | JSON 字段 |
|--------|---------|---------|-----------|
| **OpenClaw** | `~/.openclaw/workspace/` | MEMORY.md（加密）、AGENTS.md、SOUL.md | — |
| **Claude** | `~/.claude/` | CLAUDE.md、settings.json（加密） | `.claude.json` → `mcpServers`（加密） |
| **Gemini** | `~/.gemini/` | — | `settings.internal.json` → `security`、`model` |
| **CodeBuddy** | `~/.codebuddy/` | MEMORY.md（加密）、CODEBUDDY.md | `mcp.json` → `mcpServers`（加密） |
| **WorkBuddy** | `~/.workbuddy/` | MEMORY.md（加密）、IDENTITY.md、SOUL.md、USER.md（加密） | `mcp.json` → `mcpServers`（加密） |
| **Cursor** | `~/.cursor/` | rules/（目录） | `mcp.json` → `mcpServers`（加密）、`cli-config.json` → 字段（加密） |
| **Codex** | `~/.codex/` | MEMORY.md（加密）、instructions.md | — |

每个智能体的 `workspacePath` 均可在 `~/.wangchuan/config.json` 中自定义。

---

## 仓库结构 (v2)

```
repo/
├── shared/                        跨 agent 共享层
│   ├── skills/                    所有 agent 的 skills 合并
│   ├── mcp/                       各 agent 的 MCP 配置提取
│   └── memory/SHARED.md.enc       跨 agent 共享记忆（加密）
├── agents/
│   ├── openclaw/
│   │   ├── MEMORY.md.enc          永久记忆（加密）
│   │   ├── AGENTS.md              Agent 行为准则
│   │   └── SOUL.md                Agent 人格设定
│   ├── claude/
│   │   ├── CLAUDE.md              全局指令
│   │   ├── settings.json.enc      权限/插件/模型（加密）
│   │   └── mcpServers.json.enc    从 .claude.json 提取（加密）
│   ├── gemini/
│   │   └── settings-sync.json     提取的 security + model 字段
│   ├── codebuddy/
│   ├── workbuddy/
│   ├── cursor/
│   └── codex/
```

---

## 加密说明

- **算法**：AES-256-GCM（认证加密，防篡改）
- **密钥**：`~/.wangchuan/master.key`（32 字节，十六进制存储）
- **密文格式**：`IV(12B) + AuthTag(16B) + CipherText` → Base64 编码 → `.enc` 文件
- ⚠️ **master.key 丢失将无法解密历史配置，请做好备份！**

---

## 配置文件

配置位于 `~/.wangchuan/config.json`：

```jsonc
{
  "repo": "git@github.com:yourname/your-brain.git",
  "branch": "main",
  "localRepoPath": "~/.wangchuan/repo",
  "keyPath": "~/.wangchuan/master.key",
  "version": 2,
  "profiles": {
    "default": {
      "openclaw": { "enabled": true, "workspacePath": "~/.openclaw/workspace", ... },
      "claude":   { "enabled": true, "workspacePath": "~/.claude", ... },
      "gemini":   { "enabled": true, "workspacePath": "~/.gemini", ... },
      "codex":    { "enabled": true, "workspacePath": "~/.codex", ... }
    }
  },
  "shared": {
    "skills": { "sources": [{ "agent": "claude", "dir": "skills/" }, ...] },
    "mcp":    { "sources": [{ "agent": "claude", "src": ".claude.json", "field": "mcpServers" }, ...] },
    "syncFiles": [...]
  }
}
```

---

## 安全规范

1. `master.key` 已加入 `.gitignore`，不会意外提交
2. 推送前自动扫描明文 token（`api_key`、`sk-xxx`、`password` 等）
3. 迁移密钥请用加密方式传输（不要通过明文邮件/IM）

---

## 项目结构

```
wangchuan/
├── bin/wangchuan.ts          CLI 入口
├── src/
│   ├── core/
│   │   ├── sync.ts           同步引擎（分发、清理、三向操作）
│   │   ├── json-field.ts     JSON 字段级提取与合并
│   │   ├── crypto.ts         AES-256-GCM 加解密
│   │   ├── git.ts            simple-git 封装
│   │   ├── config.ts         配置管理（v2 profiles + shared）
│   │   └── migrate.ts        v1→v2 迁移（备份 + 锁 + 回滚）
│   ├── agents/               智能体定义（每个 agent 一个文件）
│   ├── commands/             28 个 CLI 命令
│   ├── utils/                日志、校验、行级差异、交互提示
│   ├── i18n.ts               国际化消息字典
│   └── types.ts              全局类型定义
├── skill/                    OpenClaw Skill 封装
├── test/                     单元测试（加密、JSON 字段、同步引擎）
└── .wangchuan/
    └── config.example.json   配置示例（v2）
```

---

## 许可证

MIT
