/**
 * config-mgmt.ts — wangchuan config export/import/validate command
 *
 * Export the full wangchuan config (minus sensitive local-only fields) to a
 * portable JSON file, import it on another machine, or deep-validate structure.
 */

import fs   from 'fs';
import path from 'path';
import { config }         from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { t }              from '../i18n.js';
import chalk              from 'chalk';
import { AGENT_NAMES }    from '../types.js';
import type { WangchuanConfig, AgentProfile, AgentName } from '../types.js';

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

// ── Deep structural validation ─────────────────────────────────────

interface ValidationResult {
  readonly label: string;
  readonly pass: boolean;
  readonly detail?: string | undefined;
}

function checkAgentProfile(name: string, p: unknown): ValidationResult[] {
  const results: ValidationResult[] = [];
  const profile = p as Record<string, unknown>;

  // enabled: boolean
  if (typeof profile['enabled'] !== 'boolean') {
    results.push({ label: t('configValidate.agentField', { agent: name, field: 'enabled' }), pass: false, detail: t('configValidate.expectedBoolean') });
  } else {
    results.push({ label: t('configValidate.agentField', { agent: name, field: 'enabled' }), pass: true });
  }

  // workspacePath: string
  if (typeof profile['workspacePath'] !== 'string' || profile['workspacePath'] === '') {
    results.push({ label: t('configValidate.agentField', { agent: name, field: 'workspacePath' }), pass: false, detail: t('configValidate.expectedNonEmptyString') });
  } else {
    results.push({ label: t('configValidate.agentField', { agent: name, field: 'workspacePath' }), pass: true });
  }

  // syncFiles: array with valid entries
  const syncFiles = profile['syncFiles'];
  if (!Array.isArray(syncFiles)) {
    results.push({ label: t('configValidate.agentField', { agent: name, field: 'syncFiles' }), pass: false, detail: t('configValidate.expectedArray') });
  } else {
    let allValid = true;
    for (let i = 0; i < syncFiles.length; i++) {
      const sf = syncFiles[i] as Record<string, unknown>;
      if (typeof sf['src'] !== 'string' || typeof sf['encrypt'] !== 'boolean') {
        results.push({ label: t('configValidate.syncFileEntry', { agent: name, index: i }), pass: false, detail: t('configValidate.syncFileFormat') });
        allValid = false;
      }
    }
    if (allValid) {
      results.push({ label: t('configValidate.agentField', { agent: name, field: `syncFiles (${syncFiles.length})` }), pass: true });
    }
  }

  // jsonFields: optional array with valid entries
  const jsonFields = profile['jsonFields'];
  if (jsonFields !== undefined) {
    if (!Array.isArray(jsonFields)) {
      results.push({ label: t('configValidate.agentField', { agent: name, field: 'jsonFields' }), pass: false, detail: t('configValidate.expectedArray') });
    } else {
      let allValid = true;
      for (let i = 0; i < jsonFields.length; i++) {
        const jf = jsonFields[i] as Record<string, unknown>;
        if (typeof jf['src'] !== 'string' || !Array.isArray(jf['fields']) || typeof jf['repoName'] !== 'string' || typeof jf['encrypt'] !== 'boolean') {
          results.push({ label: t('configValidate.jsonFieldEntry', { agent: name, index: i }), pass: false, detail: t('configValidate.jsonFieldFormat') });
          allValid = false;
        }
      }
      if (allValid) {
        results.push({ label: t('configValidate.agentField', { agent: name, field: `jsonFields (${jsonFields.length})` }), pass: true });
      }
    }
  }

  return results;
}

function validateConfig(): void {
  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const results: ValidationResult[] = [];
  const profiles = cfg.profiles.default;

  // 1. Validate each agent profile structure
  for (const name of AGENT_NAMES) {
    results.push(...checkAgentProfile(name, profiles[name]));
  }

  // 2. Validate shared config references
  const shared = cfg.shared;
  if (shared) {
    // Check skills sources reference valid agents
    for (const source of shared.skills.sources) {
      const valid = (AGENT_NAMES as readonly string[]).includes(source.agent);
      results.push({
        label: t('configValidate.sharedSkillRef', { agent: source.agent }),
        pass: valid,
        detail: valid ? undefined : t('configValidate.unknownAgent', { agent: source.agent }),
      });
    }
    // Check MCP sources reference valid agents
    for (const source of shared.mcp.sources) {
      const valid = (AGENT_NAMES as readonly string[]).includes(source.agent);
      results.push({
        label: t('configValidate.sharedMcpRef', { agent: source.agent }),
        pass: valid,
        detail: valid ? undefined : t('configValidate.unknownAgent', { agent: source.agent }),
      });
    }
    // Check agents sources reference valid agents
    if (shared.agents) {
      for (const source of shared.agents.sources) {
        const valid = (AGENT_NAMES as readonly string[]).includes(source.agent);
        results.push({
          label: t('configValidate.sharedAgentRef', { agent: source.agent }),
          pass: valid,
          detail: valid ? undefined : t('configValidate.unknownAgent', { agent: source.agent }),
        });
      }
    }
  }

  // 3. Check duplicate repoNames across agents (would cause file overwrites)
  const repoNameMap = new Map<string, string>(); // repoName → agent
  let dupeFound = false;
  for (const name of AGENT_NAMES) {
    const p = profiles[name] as unknown as Record<string, unknown>;
    const jsonFields = p['jsonFields'] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(jsonFields)) continue;
    for (const jf of jsonFields) {
      const rn = jf['repoName'] as string;
      if (!rn) continue;
      const existing = repoNameMap.get(rn);
      if (existing && existing !== name) {
        results.push({
          label: t('configValidate.duplicateRepoName', { repoName: rn }),
          pass: false,
          detail: t('configValidate.duplicateDetail', { agent1: existing, agent2: name }),
        });
        dupeFound = true;
      } else {
        repoNameMap.set(rn, name);
      }
    }
  }
  if (!dupeFound) {
    results.push({ label: t('configValidate.noDuplicateRepoNames'), pass: true });
  }

  // Output results
  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    if (r.pass) {
      passCount++;
      console.log(`  ${chalk.green('✓')} ${r.label}`);
    } else {
      failCount++;
      console.log(`  ${chalk.red('✗')} ${r.label}${r.detail ? chalk.gray(` — ${r.detail}`) : ''}`);
    }
  }
  console.log();
  logger.info(t('configValidate.summary', { pass: passCount, fail: failCount }));
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
    case 'validate':
      validateConfig();
      break;
    default:
      throw new Error(t('configMgmt.unknownAction', { action }));
  }
}
