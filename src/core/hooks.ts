/**
 * hooks.ts — Post-sync hook execution engine
 *
 * Runs user-defined shell commands after sync operations complete.
 * Each hook runs with a 30s timeout. Failures are warned but do not block.
 */

import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';
import { t }      from '../i18n.js';
import type { WangchuanConfig } from '../types.js';

type HookType = 'postSync' | 'postPush' | 'postPull';

const HOOK_TIMEOUT_MS = 30_000;

/**
 * Run all hooks of the given type from config.
 * Continues on failure — logs a warning for each failed hook.
 */
export function runHooks(hookType: HookType, cfg: WangchuanConfig): void {
  const commands = cfg.hooks?.[hookType];
  if (!commands || commands.length === 0) return;

  logger.info(t('hooks.running', { type: hookType, count: commands.length }));

  for (const cmd of commands) {
    try {
      execSync(cmd, {
        timeout: HOOK_TIMEOUT_MS,
        stdio: 'pipe',
        encoding: 'utf-8' as BufferEncoding,
      });
      logger.ok(t('hooks.success', { cmd }));
    } catch (err) {
      const code = (err as { status?: number }).status ?? 1;
      logger.warn(t('hooks.failed', { cmd, code }));
    }
  }
}
