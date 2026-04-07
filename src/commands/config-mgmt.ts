/**
 * config-mgmt.ts — wangchuan config export/import command
 *
 * Export the full wangchuan config (minus sensitive local-only fields) to a
 * portable JSON file, and import it on another machine.
 */

import fs   from 'fs';
import path from 'path';
import { config }         from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { t }              from '../i18n.js';
import chalk              from 'chalk';
import type { WangchuanConfig } from '../types.js';

export interface ConfigMgmtOptions {
  readonly action: string;
  readonly file?: string | undefined;
}

/** Fields that are local-only and should not be exported */
const LOCAL_ONLY_FIELDS: readonly (keyof WangchuanConfig)[] = [
  'localRepoPath',
  'keyPath',
  'hostname',
];

/**
 * Export config to a portable JSON file.
 * Strips local-only fields (keyPath content, localRepoPath, hostname).
 */
function exportConfig(filePath: string): void {
  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  // Build export object, excluding local-only fields
  const exported: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (!(LOCAL_ONLY_FIELDS as readonly string[]).includes(key)) {
      exported[key] = value;
    }
  }
  exported['_exportedAt'] = new Date().toISOString();

  const absPath = path.resolve(filePath);
  fs.writeFileSync(absPath, JSON.stringify(exported, null, 2), 'utf-8');

  logger.ok(t('configMgmt.exported', { path: absPath }));
  logger.info(t('configMgmt.exportHint'));
}

/**
 * Import config from an exported JSON file.
 * Merges into current config, preserving local-only fields.
 */
function importConfig(filePath: string): void {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(t('configMgmt.fileNotFound', { path: absPath }));
  }

  let imported: Record<string, unknown>;
  try {
    imported = JSON.parse(fs.readFileSync(absPath, 'utf-8')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(t('configMgmt.invalidFile', { error: (err as Error).message }));
  }

  // Load current config (must be initialized so local-only fields exist)
  const current = config.load();
  validator.requireInit(current);

  // Remove metadata from imported data
  delete imported['_exportedAt'];

  // Remove local-only fields from imported data (use current values)
  for (const field of LOCAL_ONLY_FIELDS) {
    delete imported[field];
  }

  // Merge: imported values override current, but local-only fields are preserved
  const merged = { ...current, ...imported } as WangchuanConfig;
  config.save(merged);

  logger.ok(t('configMgmt.imported', { path: absPath }));
}

const DEFAULT_EXPORT_FILE = 'wangchuan-config-export.json';

export async function cmdConfigMgmt({ action, file }: ConfigMgmtOptions): Promise<void> {
  logger.banner(t('configMgmt.banner'));

  switch (action) {
    case 'export':
      exportConfig(file ?? DEFAULT_EXPORT_FILE);
      break;
    case 'import':
      if (!file) {
        throw new Error(t('configMgmt.importFileRequired'));
      }
      importConfig(file);
      break;
    default:
      throw new Error(t('configMgmt.unknownAction', { action }));
  }
}
