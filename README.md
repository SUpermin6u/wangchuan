# 忘川 · Wangchuan

> 忘川是中国神话中冥界的遗忘之河，亡魂渡河饮水即忘前世一切记忆。
> 而 **Wangchuan** 让你的 agent 记忆在环境切换时永不遗失。

AI 记忆同步系统，支持 OpenClaw / Claude / Gemini 多种智能体记忆的加密备份与跨环境迁移。

---

## 功能特性

| 命令 | 描述 |
|------|------|
| `init`   | 初始化系统、生成 AES-256-GCM 密钥、克隆私有仓库 |
| `pull`   | 从私有仓库拉取并解密配置，还原到本地工作区（支持冲突交互） |
| `push`   | 将本地配置加密推送到私有仓库 |
| `status` | 查看仓库状态、工作区差异与文件清单 |
| `diff`   | 逐文件显示本地与仓库的行级差异（自动解密） |
| `list`   | 列出所有托管文件，显示本地/仓库存在状态 |
| `dump`   | 生成明文快照到临时目录，方便检查同步内容（支持 `--agent` 过滤） |

- **AES-256-GCM** 加密：密钥本地存储，永不提交 Git
- 全局 `--agent` 过滤：只操作指定智能体（`openclaw` / `claude` / `gemini`）
- **细粒度同步**：JSON 字段级提取（如 `.claude.json` 只同步 `mcpServers`，不同步 tipsHistory 等无用字段）
- **跨 agent 共享**：Skills 和 MCP 配置自动在所有 agent 间分发
- **删除传播**：所有 agent 都删除的 skill/MCP → 自动从 repo 清理，其他环境 pull 时消失
- **一键还原**：新服务器 `init + pull` 即可完整恢复所有 agent 配置
- 推送前自动扫描明文 token/apiKey
- 拉取时检测本地独有文件，提示同步到云端
- 拉取冲突时交互式选择：覆盖 / 跳过 / 全部覆盖 / 全部跳过
- 失败自动回滚，不污染仓库历史
- v1→v2 自动迁移，备份 + 锁文件 + 回滚保护
- 支持 OpenClaw Skill 封装，对话直接调用

---

## 安装

```bash
git clone https://github.com/SUpermin6u/wangchuan.git ~/wangchuan
cd ~/wangchuan
npm install
npm run build      # 编译 TypeScript
npm link           # 全局注册 wangchuan 命令（可选）
```

---

## 快速开始

### 1. 初始化

```bash
wangchuan init --repo git@github.com:yourname/your-brain.git
```

执行后：
- 生成 `~/.wangchuan/config.json`（系统配置）
- 生成 `~/.wangchuan/master.key`（主密钥，**请妥善保管**）
- 克隆仓库到 `~/.wangchuan/repo`

### 2. 推送本地配置

```bash
wangchuan push --message "初始化配置"
```

### 3. 在新环境拉取记忆

```bash
# 用 --key 导入已有密钥，一步完成初始化
wangchuan init --repo git@github.com:yourname/your-brain.git --key /path/to/master.key
wangchuan pull
```

### 4. 查看同步状态

```bash
wangchuan status
```

### 5. 只操作指定智能体

```bash
wangchuan push --agent openclaw -m "更新 OpenClaw 记忆"
wangchuan pull --agent claude
wangchuan diff --agent gemini
```

---

## 支持同步的配置

每个智能体的 `workspacePath` 均可在 `~/.wangchuan/config.json` 中自定义。

### Repo 目录结构（v2）

```
repo/
├── shared/                        跨 agent 共享
│   ├── skills/                    所有 agent 的 skills 合并
│   ├── mcp/                       各 agent 的 MCP 配置提取
│   └── memory/SHARED.md.enc       跨 agent 共享记忆
├── agents/
│   ├── openclaw/
│   │   ├── MEMORY.md.enc          永久记忆（加密）
│   │   ├── AGENTS.md              Agent 行为准则
│   │   └── SOUL.md                Agent 人格设定
│   ├── claude/
│   │   ├── CLAUDE.md              全局指令
│   │   ├── settings.json.enc      权限/插件/模型（加密）
│   │   └── mcpServers.json.enc    从 .claude.json 提取的 mcpServers（加密）
│   └── gemini/
│       └── settings-sync.json     从 settings.internal.json 提取的 security+model
```

### OpenClaw（默认开启）

| 文件 | 加密 | 说明 |
|------|------|------|
| `MEMORY.md`  | ✔ | 永久记忆 |
| `AGENTS.md`  | ✗ | 行为准则 |
| `SOUL.md`    | ✗ | 人格设定 |

默认路径：`~/.openclaw/workspace/`

### Claude（默认开启）

| 文件 | 加密 | 说明 |
|------|------|------|
| `CLAUDE.md`      | ✗ | 全局指令 |
| `settings.json`  | ✔ | 权限、插件、模型配置 |
| `.claude.json` → `mcpServers` | ✔ | JSON 字段级提取，仅同步 MCP 服务器配置 |

默认路径：`~/.claude-internal/`

### Gemini（默认开启）

| 文件 | 加密 | 说明 |
|------|------|------|
| `settings.internal.json` → `security`, `model` | ✔ | JSON 字段级提取 |

默认路径：`~/.gemini/`

### Shared 共享层

| 内容 | 说明 |
|------|------|
| `shared/skills/` | 从 Claude 和 OpenClaw 的 skills 目录汇聚，自动分发到所有 agent |
| `shared/mcp/`    | 从各 agent 提取 MCP 配置，跨 agent 共享（凭据加密保留） |
| `shared/memory/SHARED.md` | 跨 agent 共享记忆（加密） |

---

## 配置文件

配置位于 `~/.wangchuan/config.json`，示例见 [.wangchuan/config.example.json](.wangchuan/config.example.json)。

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
      "claude":   { "enabled": true,  "workspacePath": "~/.claude-internal", ... },
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

## 加密说明

- 算法：**AES-256-GCM**（认证加密，防篡改）
- 密钥：`~/.wangchuan/master.key`（32 字节，十六进制存储）
- 密文格式：`IV(12B) + AuthTag(16B) + CipherText`，Base64 编码后存储为 `.enc` 文件
- **⚠️ master.key 丢失将无法解密历史配置，请做好备份**

---

## OpenClaw Skill

将 `skill/` 目录注册为 OpenClaw Skill 后，即可在对话中直接说：

> "帮我拉取最新的 AI 配置"
> "把修改推送一下，备注：更新项目记忆"
> "查看忘川状态"
> "列出所有托管文件"

---

## 安全规范

1. `master.key` 已加入 `.gitignore`，不会意外提交
2. 推送前自动扫描明文 token（`api_key`, `sk-xxx`, `password` 等）
3. 若需迁移密钥，用加密方式传输（不要通过明文邮件/IM）

---

## 目录结构

```
wangchuan/
├── bin/wangchuan.ts          CLI 入口
├── src/
│   ├── core/
│   │   ├── sync.ts           同步引擎（分发、清理、三向操作）
│   │   ├── json-field.ts     JSON 字段级提取与合并
│   │   ├── crypto.ts         AES-256-GCM 加解密
│   │   ├── git.ts            simple-git 封装
│   │   ├── config.ts         配置管理（v2 默认 profiles + shared）
│   │   └── migrate.ts        v1→v2 迁移（备份+锁+回滚）
│   ├── commands/
│   │   ├── init.ts           init 命令
│   │   ├── pull.ts           pull 命令（含 localOnly 检测）
│   │   ├── push.ts           push 命令（含过期清理输出）
│   │   ├── status.ts         status 命令
│   │   ├── diff.ts           diff 命令
│   │   ├── list.ts           list 命令（shared/agents 分组）
│   │   └── dump.ts           dump 命令（明文快照）
│   ├── utils/
│   │   ├── logger.ts         日志工具
│   │   ├── validator.ts      参数校验
│   │   ├── linediff.ts       LCS 行级差异算法
│   │   └── prompt.ts         交互式冲突提示
│   └── types.ts              全局类型定义
├── skill/
│   ├── SKILL.md              OpenClaw Skill 说明
│   └── wangchuan-skill.sh    Skill 脚本
├── test/
│   ├── crypto.test.ts        加密模块测试
│   ├── json-field.test.ts    JSON 字段提取测试
│   └── sync.test.ts          同步引擎测试（42 用例）
└── .wangchuan/
    └── config.example.json   配置示例（v2）
```

---

## License

MIT
