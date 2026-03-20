# wangchuan — 智能体记忆同步技能

## 技能简介

忘川（Wangchuan）AI 记忆同步系统的 OpenClaw Skill 封装。
在对话中直接调用以同步 AI 智能体的配置文件，跨环境永不遗失记忆。

## 命令速查

```
wangchuan list   [--agent openclaw|claude|gemini]     列出所有受管配置项
wangchuan status [--agent openclaw|claude|gemini]     查看同步状态和差异摘要
wangchuan diff   [--agent openclaw|claude|gemini]     显示行级文件差异
wangchuan pull   [--agent openclaw|claude|gemini]     拉取远端配置，还原到本地
wangchuan push   [--agent <name>] [-m "<描述>"]       加密推送本地配置到远端
wangchuan dump   [--agent openclaw|claude|gemini]     生成明文快照到临时目录
wangchuan init   --repo <git地址>                     首次初始化
```

## 调用示例

> 帮我列出忘川管理的所有配置文件

> 查看一下忘川的同步状态

> 只看 openclaw 的配置差异

> 帮我把最新的 AI 记忆同步到本地

> 只拉取 openclaw 的配置

> 我修改了 MEMORY.md，帮我推送一下，描述是"更新项目记忆"

> 只推送 claude 的配置

## 输出说明

### list
- `✔ 本地  ✔ 仓库` — 两侧均存在，已同步
- `✔ 本地  · 仓库` — 本地有但未推送
- `✖ 本地  ✔ 仓库` — 仓库有但本地缺失，执行 pull 还原
- `[enc]` — 该文件加密存储（AES-256-GCM）
- `[字段]` — JSON 字段级提取（只同步指定字段，不影响其他内容）

### diff
- `+` 绿色行 — 本地新增内容
- `-` 红色行 — 仓库有但本地已删除
- 灰色行 — 上下文（未变化）
- `[enc]` — 加密文件已自动解密后再对比

### push / pull
- `[已加密]` / `[已解密]` — 经过 AES-256-GCM 处理
- `[已清理]` — 所有 agent 都已删除的文件从 repo 移除（删除传播）
- `⚠ 本地独有` — pull 时检测到本地有但 repo 无的文件，建议 push 同步

## --agent 说明

所有命令均支持 `--agent` 过滤，只操作指定智能体的配置：

| 值 | 说明 |
|----|------|
| `openclaw` | MEMORY.md(加密)、AGENTS.md、SOUL.md — 默认 ~/.openclaw/workspace/ |
| `claude`   | CLAUDE.md、settings.json(加密)、.claude.json→mcpServers 字段级提取(加密) — 默认 ~/.claude-internal/ |
| `gemini`   | settings.internal.json→security+model 字段级提取(加密) — 默认 ~/.gemini/ |

不指定 `--agent` 时，同时操作所有已启用的 agent 及 shared 共享层（skills/MCP/共享记忆）。

## 前置条件

1. Node.js ≥ 18
2. 已执行过 `wangchuan init`（~/.wangchuan/config.json 存在）
3. 本地 SSH 密钥可访问目标 git 仓库
4. 跨机器迁移时需手动复制 `~/.wangchuan/master.key`
