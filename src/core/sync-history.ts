/**
 * sync-history.ts — Append-only sync event log
 *
 * Stores sync events in ~/.wangchuan/sync-history.json (max 100 entries, FIFO).
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';

const HISTORY_PATH = path.join(os.homedir(), '.wangchuan', 'sync-history.json');
const MAX_ENTRIES  = 100;

export interface SyncEvent {
  readonly timestamp: string;
  readonly action: 'push' | 'pull' | 'sync';
  readonly environment: string;
  readonly agent?: string | undefined;
  readonly fileCount: number;
  readonly encrypted: number;
  readonly sha?: string | undefined;
  readonly hostname: string;
}

/** Read all sync events from history file */
export function readSyncHistory(historyPath?: string): SyncEvent[] {
  const p = historyPath ?? HISTORY_PATH;
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SyncEvent[];
  } catch {
    return [];
  }
}

/** Append a sync event, keeping at most MAX_ENTRIES (FIFO) */
export function appendSyncEvent(event: SyncEvent, historyPath?: string): void {
  const p = historyPath ?? HISTORY_PATH;
  const events = readSyncHistory(p);
  events.push(event);

  // FIFO: keep only the last MAX_ENTRIES
  const trimmed = events.length > MAX_ENTRIES
    ? events.slice(events.length - MAX_ENTRIES)
    : events;

  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(trimmed, null, 2), 'utf-8');
}
