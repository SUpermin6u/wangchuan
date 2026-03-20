#!/usr/bin/env node
/**
 * wangchuan.ts — CLI entry / CLI 入口
 *
 * Usage / 用法:
 *   wangchuan <command> [--agent openclaw|claude|gemini] [flags]
 */

import { Command } from 'commander';
import { cmdInit }   from '../src/commands/init.js';
import { cmdPull }   from '../src/commands/pull.js';
import { cmdPush }   from '../src/commands/push.js';
import { cmdStatus } from '../src/commands/status.js';
import { cmdDiff }   from '../src/commands/diff.js';
import { cmdList }   from '../src/commands/list.js';
import { cmdDump }   from '../src/commands/dump.js';
import { logger }    from '../src/utils/logger.js';
import type { AgentName } from '../src/types.js';

const AGENT_CHOICES = ['openclaw', 'claude', 'gemini'];

/** Validate --agent value / 校验 --agent 值合法性 */
function parseAgent(val: string): AgentName {
  if (!AGENT_CHOICES.includes(val)) {
    throw new Error(`--agent must be openclaw | claude | gemini, got: ${val} / --agent 必须是 openclaw | claude | gemini，收到: ${val}`);
  }
  return val as AgentName;
}

const program = new Command();

program
  .name('wangchuan')
  .description('Wangchuan · AI Memory Sync System / 忘川 · AI 记忆同步系统')
  .version('2.3.1');

// ── init ────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize Wangchuan, configure repo and generate key / 初始化忘川，配置仓库并生成密钥')
  .requiredOption('-r, --repo <url>', 'Git repo URL (SSH or HTTPS) / Git 仓库地址')
  .option('-k, --key <master-key>', 'Import existing master key (hex string) / 导入已有的主密钥（十六进制字符串）')
  .option('--force', 'Force re-init (overwrite existing config) / 强制重新初始化', false)
  .action(async (opts: { repo: string; key?: string; force: boolean }) => {
    await run(() => cmdInit(opts));
  });

// ── pull ────────────────────────────────────────────────────────
program
  .command('pull')
  .description('Pull and restore configs from remote repo / 从远端仓库拉取并还原配置到本地')
  .option('-a, --agent <name>', 'Filter by agent / 只操作指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdPull(opts));
  });

// ── push ────────────────────────────────────────────────────────
program
  .command('push')
  .description('Encrypt and push local configs to remote repo / 将本地配置加密后推送到远端仓库')
  .option('-m, --message <msg>', 'Custom commit message / 自定义提交信息')
  .option('-a, --agent <name>', 'Filter by agent / 只操作指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { message?: string; agent?: AgentName }) => {
    await run(() => cmdPush(opts));
  });

// ── status ──────────────────────────────────────────────────────
program
  .command('status')
  .description('Show sync status and workspace diff / 查看同步状态和工作区差异')
  .option('-a, --agent <name>', 'Filter by agent / 只操作指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdStatus(opts));
  });

// ── diff ────────────────────────────────────────────────────────
program
  .command('diff')
  .description('Show line-level diff between local and repo / 显示本地与仓库的行级文件差异')
  .option('-a, --agent <name>', 'Filter by agent / 只显示指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdDiff(opts));
  });

// ── list ────────────────────────────────────────────────────────
program
  .command('list')
  .description('List all managed configs with local/repo status / 列出所有受管配置项及其状态')
  .option('-a, --agent <name>', 'Filter by agent / 只列出指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdList(opts));
  });

// ── dump ────────────────────────────────────────────────────────
program
  .command('dump')
  .description('Generate plaintext snapshot to temp dir / 生成明文快照到临时目录')
  .option('-a, --agent <name>', 'Filter by agent / 只导出指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdDump(opts));
  });

// ── Error handler / 错误兜底 ─────────────────────────────────────
async function run(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error((err as Error).message);
    if (process.env['WANGCHUAN_LOG_LEVEL'] === 'debug') {
      console.error((err as Error).stack);
    }
    process.exit(1);
  }
}

program.parse(process.argv);
