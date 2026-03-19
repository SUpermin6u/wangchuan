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
- `~/.openclaw/workspace/USER.md` - 用户信息（加密）
- `~/.openclaw/workspace/TOOLS.md` - 工具配置
- `~/.openclaw/workspace/skills/` - 自定义技能目录
- `~/.openclaw/workspace/config/mcporter.json` - MCP 配置（加密）

#### Claude 配置（可选）
- `~/.claude/.claude.json` - Claude 全局配置

#### Gemini Internal 配置（可选）
- `~/.gemini/settings.internal.json` - Gemini 设置
- `~/.gemini/projects.json` - 项目映射
- `~/.gemini/trustedFolders.json` - 信任目录

## 技术要求

### 目录结构

```
wangchuan/
├── README.md                    # 项目说明
├── package.json                 # Node.js 项目配置
├── .gitignore                   # Git 忽略规则
├── bin/
│   └── wangchuan.js            # CLI 入口
├── src/
│   ├── core/
│   │   ├── sync.js             # 同步引擎
│   │   ├── crypto.js           # 加密模块
│   │   ├── git.js              # Git 操作
│   │   └── config.js           # 配置管理
│   ├── commands/
│   │   ├── init.js             # 初始化命令
│   │   ├── pull.js             # 拉取命令
│   │   ├── push.js             # 推送命令
│   │   └── status.js           # 状态命令
│   └── utils/
│       ├── logger.js           # 日志工具
│       └── validator.js        # 验证工具
├── skill/
│   ├── SKILL.md                # OpenClaw Skill 文档
│   └── wangchuan-skill.sh      # Skill 脚本
└── .wangchuan/
    └── config.example.json     # 配置示例
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

- 智能冲突解决
- 版本历史管理
- 多环境 Profile 切换
- 定时自动同步
- Web UI 管理界面
