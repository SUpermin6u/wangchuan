/**
 * logger.ts — Structured logging with level filtering, timestamps, and JSON output
 *
 * Supports:
 *   WANGCHUAN_LOG_LEVEL env: silent | error | warn | info | debug (default: info)
 *   WANGCHUAN_LOG_FORMAT env: json — outputs JSON lines for machine parsing
 *   Timestamp prefix in debug mode: [ISO8601] [LEVEL] message
 *   trace() method for very verbose output (only emitted in debug level)
 */

import chalk from 'chalk';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = { silent: -1, error: 3, warn: 2, info: 1, debug: 0 };

const rawLevel = (process.env['WANGCHUAN_LOG_LEVEL'] ?? 'info') as LogLevel;
const currentLevel: number = LEVELS[rawLevel] ?? LEVELS.info;
const isJsonFormat = process.env['WANGCHUAN_LOG_FORMAT'] === 'json';
const isDebugLevel = currentLevel === LEVELS.debug;

const prefix: Record<string, string> = {
  info:  chalk.cyan('\u2139'),
  ok:    chalk.green('\u2714'),
  warn:  chalk.yellow('\u26A0'),
  error: chalk.red('\u2716'),
  debug: chalk.gray('\u00B7'),
  step:  chalk.blue('\u203A'),
  trace: chalk.gray('\u2026'),
};

/** Emit a JSON line to stdout */
function emitJson(level: string, args: unknown[]): void {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString() });
  console.log(line);
}

function log(level: LogLevel, symbol: string, ...args: unknown[]): void {
  if (LEVELS[level]! < currentLevel) return;

  if (isJsonFormat) {
    emitJson(level, args);
    return;
  }

  if (isDebugLevel) {
    const ts = chalk.gray(`[${new Date().toISOString()}]`);
    const tag = chalk.gray(`[${level.toUpperCase()}]`);
    console.log(ts, tag, symbol, ...args);
    return;
  }

  console.log(symbol, ...args);
}

export const logger = {
  info:  (...a: unknown[]) => log('info',  prefix['info']!,  ...a),
  ok:    (...a: unknown[]) => log('info',  prefix['ok']!,    ...a),
  warn:  (...a: unknown[]) => log('warn',  prefix['warn']!,  chalk.yellow(String(a[0])), ...a.slice(1)),
  error: (...a: unknown[]) => log('error', prefix['error']!, chalk.red(String(a[0])),    ...a.slice(1)),
  debug: (...a: unknown[]) => log('debug', prefix['debug']!, chalk.gray(String(a[0])),   ...a.slice(1)),
  step:  (...a: unknown[]) => log('info',  prefix['step']!,  ...a),

  /** Very verbose tracing — only emitted when log level is debug */
  trace: (...a: unknown[]) => log('debug', prefix['trace']!, chalk.gray(String(a[0])), ...a.slice(1)),

  banner(text: string): void {
    if (currentLevel === LEVELS.silent) return;
    if (isJsonFormat) {
      emitJson('info', [`\u2554\u2550\u2550 ${text} \u2550\u2550\u2557`]);
      return;
    }
    console.log();
    console.log(chalk.bold.cyan(`  \u2554\u2550\u2550 ${text} \u2550\u2550\u2557`));
    console.log();
  },
} as const;
