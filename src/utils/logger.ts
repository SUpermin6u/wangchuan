/**
 * logger.ts — 统一日志输出，支持着色与级别过滤
 */

import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const rawLevel = process.env['WANGCHUAN_LOG_LEVEL'] ?? 'info';
const currentLevel: number = LEVELS[rawLevel as LogLevel] ?? LEVELS.info;

const prefix: Record<string, string> = {
  info:  chalk.cyan('ℹ'),
  ok:    chalk.green('✔'),
  warn:  chalk.yellow('⚠'),
  error: chalk.red('✖'),
  debug: chalk.gray('·'),
  step:  chalk.blue('›'),
};

function log(level: LogLevel, symbol: string, ...args: unknown[]): void {
  if (LEVELS[level] < currentLevel) return;
  console.log(symbol, ...args);
}

export const logger = {
  info:  (...a: unknown[]) => log('info',  prefix['info']!,  ...a),
  ok:    (...a: unknown[]) => log('info',  prefix['ok']!,    ...a),
  warn:  (...a: unknown[]) => log('warn',  prefix['warn']!,  chalk.yellow(String(a[0])), ...a.slice(1)),
  error: (...a: unknown[]) => log('error', prefix['error']!, chalk.red(String(a[0])),    ...a.slice(1)),
  debug: (...a: unknown[]) => log('debug', prefix['debug']!, chalk.gray(String(a[0])),   ...a.slice(1)),
  step:  (...a: unknown[]) => log('info',  prefix['step']!,  ...a),

  banner(text: string): void {
    console.log();
    console.log(chalk.bold.cyan(`  ╔══ ${text} ══╗`));
    console.log();
  },
} as const;
