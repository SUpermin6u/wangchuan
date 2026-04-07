/**
 * agent.ts — wangchuan agent enable/disable/list command
 *
 * Allows users to quickly enable or disable agents via CLI
 * instead of manually editing config.json.
 */

import { config }         from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { syncEngine }     from '../core/sync.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { t }              from '../i18n.js';
import { AGENT_NAMES }    from '../types.js';
import type { AgentName, WangchuanConfig, AgentProfile } from '../types.js';
import chalk from 'chalk';
import fs from 'fs';

export interface AgentCommandOptions {
  readonly action: string;
  readonly name?: string | undefined;
  readonly path?: string | undefined;
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
    const ws = chalk.gray(syncEngine.expandHome(p.workspacePath));
    console.log(`    ${chalk.bold(name.padEnd(12))} ${status}  ${ws}`);
  }
}

function setAgentPath(cfg: WangchuanConfig, name: AgentName, newPath: string): void {
  const profiles = cfg.profiles.default;
  const current = profiles[name];

  const expandedPath = syncEngine.expandHome(newPath);
  if (!fs.existsSync(expandedPath)) {
    logger.warn(t('agent.pathNotExist', { path: expandedPath }));
  }

  const updatedProfile: AgentProfile = { ...current, workspacePath: newPath };
  const updatedProfiles = { ...profiles, [name]: updatedProfile };
  const updatedCfg: WangchuanConfig = {
    ...cfg,
    profiles: { default: updatedProfiles },
  };

  config.save(updatedCfg);
  logger.ok(t('agent.pathSet', { name, path: newPath }));
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

export async function cmdAgent({ action, name, path: agentPath }: AgentCommandOptions): Promise<void> {
  logger.banner(t('agent.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  if (action === 'list') {
    listAgents(cfg);
    return;
  }

  if (action === 'set-path') {
    if (!name) {
      throw new Error(t('agent.nameRequired'));
    }
    if (!(AGENT_NAMES as readonly string[]).includes(name)) {
      throw new Error(t('cli.invalidAgent', { val: name }));
    }
    if (!agentPath) {
      throw new Error(t('agent.pathRequired'));
    }
    setAgentPath(cfg, name as AgentName, agentPath);
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
