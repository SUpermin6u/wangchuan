#!/usr/bin/env bash
# wangchuan-skill.sh — OpenClaw Skill 脚本
#
# 用法（由 OpenClaw / Claude 调用）：
#   wangchuan-skill.sh pull   [--agent openclaw|claude|gemini]
#   wangchuan-skill.sh push   [--agent <name>] [--message "<msg>"]
#   wangchuan-skill.sh status [--agent <name>]
#   wangchuan-skill.sh diff   [--agent <name>]
#   wangchuan-skill.sh list   [--agent <name>]
#   wangchuan-skill.sh init   --repo <url>
#
# 环境变量：
#   WANGCHUAN_DIR        可覆盖 wangchuan 安装路径（默认 ~/wangchuan）
#   WANGCHUAN_LOG_LEVEL  日志级别 debug|info|warn|error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WC_DIR="${WANGCHUAN_DIR:-"$(dirname "$SCRIPT_DIR")"}"
BIN="$WC_DIR/dist/bin/wangchuan.js"

if [[ ! -f "$BIN" ]]; then
  echo "✖ 找不到 wangchuan 编译产物: $BIN" >&2
  echo "  请先在 $WC_DIR 目录执行: npm run build" >&2
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "✖ 未找到 Node.js，请先安装 (https://nodejs.org)" >&2
  exit 1
fi

NODE_MAJOR="$(node --version | sed 's/v//' | cut -d. -f1)"
if (( NODE_MAJOR < 18 )); then
  echo "✖ Node.js 版本过低，需要 >= 18（当前: $(node --version)）" >&2
  exit 1
fi

CMD="${1:-status}"
shift || true   # 移除第一个参数，剩余参数透传

case "$CMD" in
  pull|push|status|diff|list)
    node "$BIN" "$CMD" "$@"
    ;;
  init)
    node "$BIN" init "$@"
    ;;
  *)
    echo "✖ 未知命令: $CMD" >&2
    echo "  可用命令: pull | push | status | diff | list | init" >&2
    exit 1
    ;;
esac
