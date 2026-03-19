#!/usr/bin/env node
/**
 * wangchuan.ts — CLI 入口
 *
 * 用法:
 *   wangchuan <command> [--agent openclaw|claude|gemini] [flags]
 */

import { Command } from 'commander';
import { cmdInit }   from '../src/commands/init.js';
import { cmdPull }   from '../src/commands/pull.js';
import { cmdPush }   from '../src/commands/push.js';
import { cmdStatus } from '../src/commands/status.js';
import { cmdDiff }   from '../src/commands/diff.js';
import { cmdList }   from '../src/commands/list.js';
import { logger }    from '../src/utils/logger.js';
import type { AgentName } from '../src/types.js';

const AGENT_CHOICES = ['openclaw', 'claude', 'gemini'];

/** 校验 --agent 值合法性 */
function parseAgent(val: string): AgentName {
  if (!AGENT_CHOICES.includes(val)) {
    throw new Error(`--agent 必须是 openclaw | claude | gemini，收到: ${val}`);
  }
  return val as AgentName;
}

const program = new Command();

program
  .name('wangchuan')
  .description('忘川 · AI 记忆同步系统')
  .version('1.0.0');

// ── init ────────────────────────────────────────────────────────
program
  .command('init')
  .description('初始化忘川，配置仓库并生成密钥')
  .requiredOption('-r, --repo <url>', 'Git 仓库地址 (SSH 或 HTTPS)')
  .option('-k, --key <path>', '导入已有的主密钥文件路径')
  .option('--force', '强制重新初始化（覆盖现有配置）', false)
  .action(async (opts: { repo: string; key?: string; force: boolean }) => {
    await run(() => cmdInit(opts));
  });

// ── pull ────────────────────────────────────────────────────────
program
  .command('pull')
  .description('从远端仓库拉取并还原配置到本地工作区')
  .option('-a, --agent <name>', '只操作指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdPull(opts));
  });

// ── push ────────────────────────────────────────────────────────
program
  .command('push')
  .description('将本地工作区配置加密后推送到远端仓库')
  .option('-m, --message <msg>', '自定义提交信息')
  .option('-a, --agent <name>', '只操作指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { message?: string; agent?: AgentName }) => {
    await run(() => cmdPush(opts));
  });

// ── status ──────────────────────────────────────────────────────
program
  .command('status')
  .description('查看当前同步状态和工作区差异')
  .option('-a, --agent <name>', '只操作指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdStatus(opts));
  });

// ── diff ────────────────────────────────────────────────────────
program
  .command('diff')
  .description('显示本地与仓库的行级文件差异')
  .option('-a, --agent <name>', '只显示指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdDiff(opts));
  });

// ── list ────────────────────────────────────────────────────────
program
  .command('list')
  .description('列出所有受管配置项及其本地/仓库存在状态')
  .option('-a, --agent <name>', '只列出指定智能体 (openclaw|claude|gemini)', parseAgent)
  .action(async (opts: { agent?: AgentName }) => {
    await run(() => cmdList(opts));
  });

// ── 错误兜底 ────────────────────────────────────────────────────
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
