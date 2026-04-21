/**
 * webhook.ts — Fire-and-forget webhook notifications after sync events
 *
 * POSTs a JSON payload to each configured webhook URL matching the event.
 * Uses built-in fetch() (Node 18+), 5s timeout, never blocks the sync flow.
 */

import os from 'os';
import { logger } from '../utils/logger.js';
import { t }      from '../i18n.js';
import type { WangchuanConfig } from '../types.js';

type WebhookEvent = 'push' | 'pull' | 'sync';

interface WebhookPayload {
  readonly event: WebhookEvent;
  readonly timestamp: string;
  readonly hostname: string;
  readonly environment: string;
  readonly fileCount: number;
  readonly sha?: string | undefined;
}

/**
 * Fire webhooks matching the given event. Fully fire-and-forget:
 * failures are logged at debug level and never propagate.
 */
export async function fireWebhooks(
  cfg: WangchuanConfig,
  event: WebhookEvent,
  payload: WebhookPayload,
): Promise<void> {
  const hooks = cfg.webhooks;
  if (!hooks || hooks.length === 0) return;

  const matching = hooks.filter(h => h.events.includes(event));
  if (matching.length === 0) return;

  logger.debug(t('webhook.firing', { event, count: matching.length }));

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    matching.map(async (hook) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        logger.debug(t('webhook.success', { url: hook.url, status: res.status }));
      } catch (err) {
        logger.debug(t('webhook.failed', { url: hook.url, error: (err as Error).message }));
      }
    }),
  );
}

/** Build a standard webhook payload from common sync result data */
export function buildWebhookPayload(
  cfg: WangchuanConfig,
  event: WebhookEvent,
  fileCount: number,
  sha?: string,
): WebhookPayload {
  return {
    event,
    timestamp: new Date().toISOString(),
    hostname: cfg.hostname || os.hostname(),
    environment: cfg.environment ?? 'default',
    fileCount,
    sha,
  };
}
