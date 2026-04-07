/**
 * template.ts — wangchuan template command
 *
 * Pre-built sync config templates for common scenarios.
 * `template list` shows available templates.
 * `template apply <name>` merges a template into the current config.
 */

import { config }         from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { t }              from '../i18n.js';
import { AGENT_NAMES }    from '../types.js';
import type { AgentName, WangchuanConfig, AgentProfile } from '../types.js';
import chalk from 'chalk';

// ── Template definition ─────────────────────────────────────────

interface Template {
  readonly name: string;
  readonly descKey: string;
  /** Agents to enable — all others will be disabled */
  readonly agents: readonly AgentName[];
}

const TEMPLATES: readonly Template[] = [
  {
    name:    'minimal',
    descKey: 'template.desc.minimal',
    agents:  ['claude'],
  },
  {
    name:    'full',
    descKey: 'template.desc.full',
    agents:  ['openclaw', 'claude', 'gemini', 'codebuddy', 'workbuddy', 'cursor'],
  },
  {
    name:    'developer',
    descKey: 'template.desc.developer',
    agents:  ['claude', 'cursor', 'codebuddy'],
  },
  {
    name:    'personal',
    descKey: 'template.desc.personal',
    agents:  ['openclaw', 'workbuddy'],
  },
] as const;

// ── Subcommands ─────────────────────────────────────────────────

function listTemplates(): void {
  console.log(chalk.bold(`  ${t('template.list.header')}`));
  console.log();
  for (const tpl of TEMPLATES) {
    const agents = tpl.agents.join(', ');
    console.log(`    ${chalk.bold.cyan(tpl.name.padEnd(12))} ${t(tpl.descKey)}`);
    console.log(`${''.padEnd(16)}${chalk.gray(agents)}`);
  }
}

function applyTemplate(cfg: WangchuanConfig, templateName: string): void {
  const tpl = TEMPLATES.find(t => t.name === templateName);
  if (!tpl) {
    throw new Error(t('template.notFound', { name: templateName }));
  }

  const enabledSet = new Set<string>(tpl.agents);
  const profiles = cfg.profiles.default;
  const updatedProfiles: Record<string, AgentProfile> = {};

  for (const name of AGENT_NAMES) {
    const current = profiles[name];
    updatedProfiles[name] = { ...current, enabled: enabledSet.has(name) };
  }

  const updatedCfg: WangchuanConfig = {
    ...cfg,
    profiles: { default: updatedProfiles as unknown as WangchuanConfig['profiles']['default'] },
  };

  config.save(updatedCfg);

  logger.ok(t('template.applied', { name: templateName }));
  console.log();

  for (const name of AGENT_NAMES) {
    const enabled = enabledSet.has(name);
    const icon = enabled ? chalk.green('✔') : chalk.gray('✖');
    const label = enabled ? t('agent.enabled') : t('agent.disabled');
    console.log(`    ${icon} ${chalk.bold(name.padEnd(12))} ${label}`);
  }
}

// ── Entry point ─────────────────────────────────────────────────

export interface TemplateCommandOptions {
  readonly action: string;
  readonly name?: string | undefined;
}

export async function cmdTemplate({ action, name }: TemplateCommandOptions): Promise<void> {
  logger.banner(t('template.banner'));

  if (action === 'list') {
    listTemplates();
    return;
  }

  if (action === 'apply') {
    let cfg = config.load();
    validator.requireInit(cfg);
    cfg = ensureMigrated(cfg);

    if (!name) {
      throw new Error(t('template.nameRequired'));
    }
    applyTemplate(cfg, name);
    return;
  }

  throw new Error(t('template.unknownAction', { action }));
}
