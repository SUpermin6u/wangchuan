/**
 * agent.ts — wangchuan agent enable/disable/list command
 *
 * Allows users to quickly enable or disable agents via CLI
 * instead of manually editing config.json.
 */

import { config }         from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { t }              from '../i18n.js';
import { AGENT_NAMES }    from '../types.js';
import type { AgentName, WangchuanConfig, AgentProfile } from '../types.js';
import chalk from 'chalk';

export interface AgentCommandOptions {
  readonly action: string;
  readonly name?: string | undefined;
}

function listAgents(cfg: WangchuanConfig): void {
  console.log(chalk.bold(`  ${t('agent.list.header')}`));
  console.log();
  const profiles = cfg.profiles.default;
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    const status = p.enabled
      ? chalk.green(`✔ ${t('agent.enabled')}`)
      : chalk.gray(`✖ ${t('agent.disabled')}`);
    const ws = chalk.gray(p.workspacePath);
    console.log(`    ${chalk.bold(name.padEnd(12))} ${status}  ${ws}`);
  }
}

function setAgentEnabled(cfg: WangchuanConfig, name: AgentName, enabled: boolean): void {
  const profiles = cfg.profiles.default;
  const current = profiles[name];

  if (current.enabled === enabled) {
    logger.info(t(enabled ? 'agent.alreadyEnabled' : 'agent.alreadyDisabled', { name }));
    return;
  }

  // Rebuild profiles with the updated agent — cast away readonly for save
  const updatedProfile: AgentProfile = { ...current, enabled };
  const updatedProfiles = { ...profiles, [name]: updatedProfile };
  const updatedCfg: WangchuanConfig = {
    ...cfg,
    profiles: { default: updatedProfiles },
  };

  config.save(updatedCfg);
  logger.ok(t(enabled ? 'agent.nowEnabled' : 'agent.nowDisabled', { name }));
}

export async function cmdAgent({ action, name }: AgentCommandOptions): Promise<void> {
  logger.banner(t('agent.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  if (action === 'list') {
    listAgents(cfg);
    return;
  }

  if (action !== 'enable' && action !== 'disable') {
    throw new Error(t('agent.unknownAction', { action }));
  }

  if (!name) {
    throw new Error(t('agent.nameRequired'));
  }

  if (!(AGENT_NAMES as readonly string[]).includes(name)) {
    throw new Error(t('cli.invalidAgent', { val: name }));
  }

  setAgentEnabled(cfg, name as AgentName, action === 'enable');
}
