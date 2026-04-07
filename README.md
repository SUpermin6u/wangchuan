# 忘川 · Wangchuan

> 忘川是中国神话中冥界的遗忘之河，亡魂渡河饮水即忘前世一切记忆。
> 而 **Wangchuan** 让你的 agent 记忆在环境切换时永不遗失。
>
> In Chinese mythology, Wangchuan (忘川) is the River of Oblivion in the underworld — souls crossing it forget all memories of past lives.
> **Wangchuan** ensures your AI agent memories are never lost across environments.

AI 记忆同步系统，支持 OpenClaw / Claude / Gemini 多种智能体记忆的加密备份与跨环境迁移。

AI memory sync system — encrypted backup and cross-environment migration for OpenClaw / Claude / Gemini agents.

---

## 功能特性 / Features

| 命令 / Command | 描述 / Description |
|------|------|
| `init`   | 初始化系统、生成 AES-256-GCM 密钥、克隆私有仓库 / Initialize system, generate AES-256-GCM key, clone private repo |
| `pull`   | 从私有仓库拉取并解密配置，还原到本地工作区 / Pull and decrypt configs from repo, restore to local workspace |
| `push`   | 将本地配置加密推送到私有仓库 / Encrypt and push local configs to repo |
| `status` | 查看仓库状态、工作区差异与文件清单 / Show repo status, workspace diff and file inventory |
| `diff`   | 逐文件显示本地与仓库的行级差异（自动解密）/ Show line-level diff per file (auto-decrypt) |
| `list`   | 列出所有托管文件，显示本地/仓库存在状态 / List all managed files with local/repo presence |
| `dump`   | 生成明文快照到临时目录，方便检查同步内容 / Generate plaintext snapshot to temp dir for inspection |
| `lang`   | 切换 CLI 显示语言（zh/en）/ Switch CLI display language (zh/en) |

- **AES-256-GCM** 加密：密钥本地存储，永不提交 Git / Encryption: keys stored locally, never committed to Git
- 全局 `--agent` 过滤：只操作指定智能体 / Global `--agent` filter: operate on a single agent only
- **多语言 / i18n**：`wangchuan lang zh|en` 切换 CLI 显示语言，支持环境变量 `WANGCHUAN_LANG` 覆盖 / `wangchuan lang zh|en` to switch CLI language, `WANGCHUAN_LANG` env override
- **细粒度同步 / Fine-grained sync**：JSON 字段级提取（如 `.claude.json` 只同步 `mcpServers`） / JSON field-level extraction (e.g. only sync `mcpServers` from `.claude.json`)
- **跨 agent 共享 / Cross-agent sharing**：Skills 和 MCP 配置自动在所有 agent 间分发 / Skills and MCP configs auto-distributed across all agents
- **删除传播 / Delete propagation**：所有 agent 都删除的 skill/MCP → 自动从 repo 清理 / Items deleted from all agents are pruned from repo
- **一键还原 / One-click restore**：新服务器 `init + pull` 即可完整恢复所有 agent 配置 / New server `init + pull` fully restores all agent configs
- 推送前自动扫描明文 token/apiKey / Auto-scan for plaintext tokens before push
- 拉取时检测本地独有文件，提示同步到云端 / Detect local-only files on pull, prompt to push
- 拉取冲突时交互式选择：覆盖 / 跳过 / 全部覆盖 / 全部跳过 / Interactive conflict resolution on pull
- 失败自动回滚，不污染仓库历史 / Auto-rollback on failure, no repo pollution
- v1→v2 自动迁移，备份 + 锁文件 + 回滚保护 / Auto v1→v2 migration with backup + lock + rollback
- 支持 OpenClaw Skill 封装，对话直接调用 / OpenClaw Skill wrapper for conversational invocation

---

## 安装 / Installation

```bash
git clone https://github.com/SUpermin6u/wangchuan.git ~/wangchuan
cd ~/wangchuan
npm install
npm run build      # 编译 TypeScript / Compile TypeScript
npm link           # 全局注册 wangchuan 命令（可选）/ Register global command (optional)
```

---

## 快速开始 / Quick Start

### 1. 初始化 / Initialize

```bash
wangchuan init --repo git@github.com:yourname/your-brain.git
```

执行后 / After running:
- 生成 `~/.wangchuan/config.json`（系统配置）/ Creates system config
- 生成 `~/.wangchuan/master.key`（主密钥，**请妥善保管**）/ Creates master key (**keep it safe**)
- 克隆仓库到 `~/.wangchuan/repo` / Clones repo

### 2. 推送本地配置 / Push local configs

```bash
wangchuan push --message "初始化配置"
```

### 3. 在新环境拉取记忆 / Pull memories on a new machine

```bash
# 用 --key 导入已有密钥 / Import existing key with --key
wangchuan init --repo git@github.com:yourname/your-brain.git --key /path/to/master.key
wangchuan pull
```

### 4. 查看同步状态 / Check sync status

```bash
wangchuan status
```

### 5. 切换显示语言 / Switch display language

```bash
wangchuan lang         # 查看当前语言 / Show current language
wangchuan lang en      # 切换到英文 / Switch to English
wangchuan lang zh      # 切换到中文 / Switch to Chinese
```

也可通过环境变量覆盖 / Or override via env var:

```bash
WANGCHUAN_LANG=en wangchuan status
```

### 6. 只操作指定智能体 / Filter by agent

```bash
wangchuan push --agent openclaw -m "更新 OpenClaw 记忆"
wangchuan pull --agent claude
wangchuan diff --agent gemini
```

---

## 支持同步的配置 / Sync Scope

每个智能体的 `workspacePath` 均可在 `~/.wangchuan/config.json` 中自定义。

Each agent's `workspacePath` can be customized in `~/.wangchuan/config.json`.

### Repo 目录结构 / Repo Structure (v2)

```
repo/
├── shared/                        跨 agent 共享 / Cross-agent shared
│   ├── skills/                    所有 agent 的 skills 合并 / Merged skills from all agents
│   ├── mcp/                       各 agent 的 MCP 配置提取 / Extracted MCP configs
│   └── memory/SHARED.md.enc       跨 agent 共享记忆 / Shared memory
├── agents/
│   ├── openclaw/
│   │   ├── MEMORY.md.enc          永久记忆（加密）/ Long-term memory (encrypted)
│   │   ├── AGENTS.md              Agent 行为准则 / Agent behavior rules
│   │   └── SOUL.md                Agent 人格设定 / Agent persona
│   ├── claude/
│   │   ├── CLAUDE.md              全局指令 / Global instructions
│   │   ├── settings.json.enc      权限/插件/模型（加密）/ Permissions/plugins/model (encrypted)
│   │   └── mcpServers.json.enc    从 .claude.json 提取的 mcpServers（加密）/ Extracted from .claude.json (encrypted)
│   └── gemini/
│       └── settings-sync.json     从 settings.internal.json 提取的 security+model / Extracted fields
```

### OpenClaw（默认开启 / enabled by default）

| 文件 / File | 加密 / Enc | 说明 / Description |
|------|------|------|
| `MEMORY.md`  | ✔ | 永久记忆 / Long-term memory |
| `AGENTS.md`  | ✗ | 行为准则 / Behavior rules |
| `SOUL.md`    | ✗ | 人格设定 / Persona |

默认路径 / Default path：`~/.openclaw/workspace/`

### Claude（默认开启 / enabled by default）

| 文件 / File | 加密 / Enc | 说明 / Description |
|------|------|------|
| `CLAUDE.md`      | ✗ | 全局指令 / Global instructions |
| `settings.json`  | ✔ | 权限、插件、模型配置 / Permissions, plugins, model |
| `.claude.json` → `mcpServers` | ✔ | JSON 字段级提取，仅同步 MCP 配置 / Field-level extraction, MCP config only |

默认路径 / Default path：`~/.claude/`

### Gemini（默认开启 / enabled by default）

| 文件 / File | 加密 / Enc | 说明 / Description |
|------|------|------|
| `settings.internal.json` → `security`, `model` | ✔ | JSON 字段级提取 / Field-level extraction |

默认路径 / Default path：`~/.gemini/`

### Shared 共享层 / Shared Tier

| 内容 / Content | 说明 / Description |
|------|------|
| `shared/skills/` | 从 Claude 和 OpenClaw 的 skills 目录汇聚，自动分发 / Merged from all agents, auto-distributed |
| `shared/mcp/`    | 从各 agent 提取 MCP 配置，跨 agent 共享 / Extracted MCP configs, shared across agents |
| `shared/memory/SHARED.md` | 跨 agent 共享记忆（加密）/ Cross-agent shared memory (encrypted) |

---

## 配置文件 / Configuration

配置位于 `~/.wangchuan/config.json`，示例见 [.wangchuan/config.example.json](.wangchuan/config.example.json)。

Config at `~/.wangchuan/config.json`, see [.wangchuan/config.example.json](.wangchuan/config.example.json) for example.

```jsonc
{
  "repo": "git@github.com:yourname/your-brain.git",
  "branch": "main",
  "localRepoPath": "~/.wangchuan/repo",
  "keyPath": "~/.wangchuan/master.key",
  "version": 2,
  "profiles": {
    "default": {
      "openclaw": { "enabled": true,  "workspacePath": "~/.openclaw/workspace", ... },
      "claude":   { "enabled": true,  "workspacePath": "~/.claude", ... },
      "gemini":   { "enabled": true,  "workspacePath": "~/.gemini", ... }
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

## 加密说明 / Encryption

- 算法 / Algorithm：**AES-256-GCM**（认证加密，防篡改 / Authenticated encryption, tamper-proof）
- 密钥 / Key：`~/.wangchuan/master.key`（32 字节，十六进制存储 / 32 bytes, hex-encoded）
- 密文格式 / Ciphertext format：`IV(12B) + AuthTag(16B) + CipherText`，Base64 编码后存储为 `.enc` 文件 / Base64-encoded `.enc` files
- **⚠️ master.key 丢失将无法解密历史配置，请做好备份 / Losing master.key means losing access to all encrypted history — back it up!**

---

## OpenClaw Skill

将 `skill/` 目录注册为 OpenClaw Skill 后，即可在对话中直接说：

Register the `skill/` directory as an OpenClaw Skill, then invoke via conversation:

> "帮我拉取最新的 AI 配置" / "Pull the latest AI configs"
> "把修改推送一下，备注：更新项目记忆" / "Push changes with note: update project memory"
> "查看忘川状态" / "Check Wangchuan status"
> "列出所有托管文件" / "List all managed files"

---

## 安全规范 / Security

1. `master.key` 已加入 `.gitignore`，不会意外提交 / Added to `.gitignore`, never accidentally committed
2. 推送前自动扫描明文 token（`api_key`, `sk-xxx`, `password` 等）/ Auto-scan for plaintext tokens before push
3. 若需迁移密钥，用加密方式传输（不要通过明文邮件/IM）/ Transfer keys via encrypted channels only (never plaintext email/IM)

---

## 目录结构 / Project Structure

```
wangchuan/
├── bin/wangchuan.ts          CLI 入口 / CLI entry
├── src/
│   ├── core/
│   │   ├── sync.ts           同步引擎 / Sync engine (distribute, prune, 3-way ops)
│   │   ├── json-field.ts     JSON 字段级提取与合并 / JSON field extraction & merge
│   │   ├── crypto.ts         AES-256-GCM 加解密 / AES-256-GCM encrypt/decrypt
│   │   ├── git.ts            simple-git 封装 / simple-git wrapper
│   │   ├── config.ts         配置管理 / Config management (v2 profiles + shared)
│   │   └── migrate.ts        v1→v2 迁移 / v1→v2 migration (backup + lock + rollback)
│   ├── commands/
│   │   ├── init.ts           初始化命令 / init command
│   │   ├── pull.ts           拉取命令 / pull command (with localOnly detection)
│   │   ├── push.ts           推送命令 / push command (with stale file cleanup)
│   │   ├── status.ts         状态命令 / status command
│   │   ├── diff.ts           差异命令 / diff command
│   │   ├── list.ts           清单命令 / list command (shared/agents grouping)
│   │   ├── dump.ts           明文快照 / dump command (plaintext snapshot)
│   │   └── lang.ts           语言切换 / lang command (i18n switching)
│   ├── utils/
│   │   ├── logger.ts         日志工具 / Logger
│   │   ├── validator.ts      参数校验 / Validator
│   │   ├── linediff.ts       LCS 行级差异算法 / LCS line diff
│   │   └── prompt.ts         交互式冲突提示 / Interactive conflict prompt
│   ├── i18n.ts               国际化消息字典 / i18n message dictionary & t() helper
│   └── types.ts              全局类型定义 / Global type definitions
├── skill/
│   ├── SKILL.md              OpenClaw Skill 说明 / OpenClaw Skill doc
│   └── wangchuan-skill.sh    Skill 脚本 / Skill script
├── test/
│   ├── crypto.test.ts        加密模块测试 / Crypto tests
│   ├── json-field.test.ts    JSON 字段提取测试 / JSON field tests
│   └── sync.test.ts          同步引擎测试（42 用例）/ Sync engine tests (42 cases)
└── .wangchuan/
    └── config.example.json   配置示例（v2）/ Config example (v2)
```

---

## License

MIT
