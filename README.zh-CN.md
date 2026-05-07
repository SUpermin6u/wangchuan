# 忘川 (Wangchuan)

[English](README.md)

> 忘川是中国神话中冥界的遗忘之河，亡魂渡河即忘前世记忆。而忘川让你的 AI 智能体记忆永不遗失。

一个纯技能，通过加密 Git 仓库跨机器同步 AI 智能体的记忆、技能和子 Agent 定义。不需要 CLI、npm 或编译代码——你的 AI 智能体直接读取技能文件并原生执行。

## 支持的智能体

| 智能体 | 技能目录 | 子 Agent 定义 | 记忆 |
|--------|---------|--------------|------|
| Claude | `~/.claude/skills/` | `~/.claude/agents/*.md` | `~/.claude/CLAUDE.md`（单文件） |
| Cursor | `~/.cursor/skills/` | `~/.cursor/agents/*.md` | `~/.cursor/rules/*.mdc`（规则文件目录） |
| OpenClaw | `~/.openclaw/workspace/skills/` | `~/.openclaw/workspace-<name>/` | `~/.openclaw/workspace/MEMORY.md`、`USER.md`、`IDENTITY.md` |

## 安装

克隆或复制本项目到你的智能体技能目录：

```bash
# Claude
cp -r wangchuan/ ~/.claude/skills/wangchuan/

# Cursor
cp -r wangchuan/ ~/.cursor/skills/wangchuan/

# OpenClaw
cp -r wangchuan/ ~/.openclaw/workspace/skills/wangchuan/
```

然后对你的智能体说"初始化忘川"。

## 指令

| 说这个 | 会发生什么 |
|--------|-----------|
| 初始化忘川 | 生成密钥、创建仓库、探测智能体、首次同步 |
| 恢复忘川 | 在新机器上从云端恢复 |
| 新增 xxx 技能 | 创建技能，选择同步到哪些智能体 |
| 修改 xxx 技能 | 更新技能，共享技能自动同步 |
| 删除 xxx 技能 | 从选中的智能体移除 |
| 查看 xxx 技能 | 显示状态：共享/专属、哪些智能体在用、同步状态 |
| 新增 xxx 子 Agent | 创建子 Agent 定义，选择同步到哪些智能体 |
| 修改 xxx 子 Agent | 更新子 Agent 定义，共享的自动同步 |
| 删除 xxx 子 Agent | 从选中的智能体移除子 Agent 定义 |
| 查看 xxx 子 Agent / 列出所有子 Agent | 显示状态或列出所有子 Agent 定义 |
| 推送记忆 | 加密并推送记忆到云端 |
| 拉取记忆 | 从云端拉取并解密记忆 |
| 推送 MCP | 加密并推送 MCP 服务配置到云端 |
| 拉取 MCP | 从云端拉取并解密 MCP 配置，同步到所有智能体 |
| 查看 MCP | 对比各智能体和云端的 MCP 配置 |

## 工作原理

```
本地 agent 文件 → 加密(仅记忆) → ~/.wangchuan/repo/ → git push → 远端仓库
远端仓库 → git pull → ~/.wangchuan/repo/ → 解密(仅记忆) → 本地 agent 文件
```

子 Agent 定义和技能以明文存储（不加密）。

## 仓库结构

```
远端 git 仓库/
├── shared/
│   ├── skills/              # 所有智能体共享的技能（明文）
│   ├── agents/<name>/      # 所有智能体共享的子 Agent 定义
│   │   ├── <name>.md       #   Claude/Cursor 格式
│   │   ├── SOUL.md         #   OpenClaw 格式
│   │   └── IDENTITY.md     #   OpenClaw 格式
│   └── mcp/                 # 加密的 MCP 服务配置
│       └── mcpServers.json.enc
└── agents/<agent>/
    ├── memory/              # 加密的 .enc 文件
    ├── skills/              # 智能体专属技能（明文）
    └── agents/<name>/       # 智能体专属子 Agent 定义
```

## 子 Agent 定义格式

| 平台 | 格式 | 本地路径 |
|------|------|---------|
| Claude | `.md` 文件，含 YAML frontmatter（`name`、`description`、`tools`、`model`） | `~/.claude/agents/` |
| Cursor | `.md` 文件，含 YAML frontmatter（同 Claude） | `~/.cursor/agents/` |
| OpenClaw | Workspace 目录，含 `SOUL.md` + `IDENTITY.md` | `~/.openclaw/workspace-<name>/` |

跨平台同步时自动进行格式转换。

## 依赖

- `git`
- `openssl`
- `gh`（可选，自动创建仓库）

## 支持的 Git 托管

支持**任意 Git 托管**，只要支持 SSH 或 HTTPS：

| 平台 | 仓库地址示例 |
|------|------------|
| GitHub | `git@github.com:you/brain.git` |
| GitLab | `git@gitlab.com:you/brain.git` |
| Gitee | `git@gitee.com:you/brain.git` |
| Bitbucket | `git@bitbucket.org:you/brain.git` |
| Gitea | `git@gitea.example.com:you/brain.git` |
| 自建服务 | 任意 SSH/HTTPS Git 地址 |

## 安全

- 记忆文件在离开本机前始终加密（AES-256-CBC）
- MCP 配置始终加密（包含敏感 token）
- 技能和子 Agent 定义以明文存储（不含敏感信息）
- 密钥位于 `~/.wangchuan/master.key`（权限 600，永不提交）
- **master.key 丢失 = 无法解密历史记忆，请做好备份！**

## 许可证

MIT
