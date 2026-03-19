# 忘川 · Wangchuan

> 忘川是中国神话中冥界的遗忘之河，亡魂渡河饮水即忘前世一切记忆。
> 而 **Wangchuan** 让你的 AI 配置在环境切换时永不遗失。

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

- **AES-256-GCM** 加密：密钥本地存储，永不提交 Git
- 全局 `--agent` 过滤：只操作指定智能体（`openclaw` / `claude` / `gemini`）
- 推送前自动扫描明文 token/apiKey
- 拉取冲突时交互式选择：覆盖 / 跳过 / 全部覆盖 / 全部跳过
- 失败自动回滚，不污染仓库历史
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

### 3. 在新环境拉取配置

```bash
# 先把 master.key 复制到新环境的 ~/.wangchuan/master.key
wangchuan init --repo git@github.com:yourname/your-brain.git
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

### OpenClaw（默认开启）

| 文件 | 加密 |
|------|------|
| `MEMORY.md`            | ✔ 加密 |
| `AGENTS.md`            | 明文   |
| `SOUL.md`              | 明文   |
| `USER.md`              | ✔ 加密 |
| `TOOLS.md`             | 明文   |
| `config/mcporter.json` | ✔ 加密 |
| `skills/` (目录)       | 明文   |

默认路径：`~/.openclaw/workspace/`

### Claude（可选，在配置中开启）

| 文件 | 加密 |
|------|------|
| `.claude.json` | ✔ 加密 |

默认路径：`~/.claude/`

### Gemini（可选，在配置中开启）

| 文件 | 加密 |
|------|------|
| `settings.internal.json` | ✔ 加密 |
| `projects.json`          | 明文   |
| `trustedFolders.json`    | 明文   |

默认路径：`~/.gemini/`

---

## 配置文件

配置位于 `~/.wangchuan/config.json`，示例见 [.wangchuan/config.example.json](.wangchuan/config.example.json)。

```jsonc
{
  "repo": "git@github.com:yourname/your-brain.git",
  "branch": "main",
  "localRepoPath": "~/.wangchuan/repo",
  "keyPath": "~/.wangchuan/master.key",
  "profiles": {
    "default": {
      "openclaw": { "enabled": true,  "workspacePath": "~/.openclaw/workspace", ... },
      "claude":   { "enabled": false, "workspacePath": "~/.claude", ... },
      "gemini":   { "enabled": false, "workspacePath": "~/.gemini", ... }
    }
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
│   │   ├── sync.ts           同步引擎
│   │   ├── crypto.ts         AES-256-GCM 加解密
│   │   ├── git.ts            simple-git 封装
│   │   └── config.ts         配置管理
│   ├── commands/
│   │   ├── init.ts           init 命令
│   │   ├── pull.ts           pull 命令
│   │   ├── push.ts           push 命令
│   │   ├── status.ts         status 命令
│   │   ├── diff.ts           diff 命令
│   │   └── list.ts           list 命令
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
│   └── crypto.test.ts        加密模块测试
└── .wangchuan/
    └── config.example.json   配置示例
```

---

## License

MIT
