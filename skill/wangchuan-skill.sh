#!/usr/bin/env bash
# wangchuan-skill.sh — OpenClaw Skill script / OpenClaw Skill 脚本
#
# Usage (invoked by OpenClaw / Claude) / 用法（由 OpenClaw / Claude 调用）：
#   wangchuan-skill.sh pull   [--agent openclaw|claude|gemini]
#   wangchuan-skill.sh push   [--agent <name>] [--message "<msg>"]
#   wangchuan-skill.sh status [--agent <name>]
#   wangchuan-skill.sh diff   [--agent <name>]
#   wangchuan-skill.sh list   [--agent <name>]
#   wangchuan-skill.sh dump   [--agent <name>]
#   wangchuan-skill.sh init   --repo <url>
#
# Environment variables / 环境变量：
#   WANGCHUAN_DIR        Override wangchuan install path (default ~/wangchuan) / 可覆盖安装路径（默认 ~/wangchuan）
#   WANGCHUAN_LOG_LEVEL  Log level: debug|info|warn|error / 日志级别

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WC_DIR="${WANGCHUAN_DIR:-"$(dirname "$SCRIPT_DIR")"}"
BIN="$WC_DIR/dist/bin/wangchuan.js"

if [[ ! -f "$BIN" ]]; then
  echo "✖ Cannot find wangchuan binary / 找不到编译产物: $BIN" >&2
  echo "  Run 'npm run build' in $WC_DIR first / 请先执行 npm run build" >&2
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "✖ Node.js not found, please install (https://nodejs.org) / 未找到 Node.js" >&2
  exit 1
fi

NODE_MAJOR="$(node --version | sed 's/v//' | cut -d. -f1)"
if (( NODE_MAJOR < 18 )); then
  echo "✖ Node.js version too low, requires >= 18 (current: $(node --version)) / 版本过低" >&2
  exit 1
fi

CMD="${1:-status}"
shift || true   # Remove first arg, pass remaining / 移除第一个参数，剩余透传

case "$CMD" in
  pull|push|status|diff|list|dump|lang|sync|watch)
    node "$BIN" "$CMD" "$@"
    ;;
  init)
    node "$BIN" init "$@"
    ;;
  *)
    echo "✖ Unknown command / 未知命令: $CMD" >&2
    echo "  Available / 可用: pull | push | status | diff | list | dump | lang | sync | watch | init" >&2
    exit 1
    ;;
esac
