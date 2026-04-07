/**
 * agent.ts — wangchuan agent enable/disable/list/info command
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
import path from 'path';

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileSizeOrNull(absPath: string): number | null {
  try {
    return fs.statSync(absPath).size;
  } catch {
    return null;
  }
}

function agentInfo(cfg: WangchuanConfig, name: AgentName): void {
  const profile = cfg.profiles.default[name];
  const wsPath = syncEngine.expandHome(profile.workspacePath);
  const wsExists = fs.existsSync(wsPath);
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const agentRepoDir = path.join(repoPath, 'agents', name);

  // Header
  console.log(chalk.bold(`  ${t('agentInfo.name')}: ${name}`));
  console.log(`  ${t('agentInfo.enabled')}: ${profile.enabled ? chalk.green(t('agent.enabled')) : chalk.gray(t('agent.disabled'))}`);
  console.log(`  ${t('agentInfo.workspace')}: ${wsPath} ${wsExists ? chalk.green('✔') : chalk.red('✗')}`);
  console.log();

  let totalLocalSize = 0;
  let totalRepoSize = 0;

  // syncFiles
  if (profile.syncFiles.length > 0) {
    console.log(chalk.bold(`  ${t('agentInfo.syncFiles')} (${profile.syncFiles.length}):`));
    for (const sf of profile.syncFiles) {
      const localAbs = path.join(wsPath, sf.src);
      const localSize = fileSizeOrNull(localAbs);
      const repoRel = `agents/${name}/${sf.src}${sf.encrypt ? '.enc' : ''}`;
      const repoAbs = path.join(repoPath, repoRel);
      const repoSize = fileSizeOrNull(repoAbs);
      const localTag = localSize !== null ? chalk.green(formatSize(localSize)) : chalk.red(t('agentInfo.missing'));
      const repoTag = repoSize !== null ? chalk.green(formatSize(repoSize)) : chalk.gray(t('agentInfo.notInRepo'));
      const encTag = sf.encrypt ? chalk.yellow(' [enc]') : '';
      console.log(`    ${sf.src}${encTag}  ${t('agentInfo.local')}: ${localTag}  ${t('agentInfo.repo')}: ${repoTag}`);
      if (localSize !== null) totalLocalSize += localSize;
      if (repoSize !== null) totalRepoSize += repoSize;
    }
    console.log();
  }

  // syncDirs
  if (profile.syncDirs && profile.syncDirs.length > 0) {
    console.log(chalk.bold(`  ${t('agentInfo.syncDirs')} (${profile.syncDirs.length}):`));
    for (const sd of profile.syncDirs) {
      const localAbs = path.join(wsPath, sd.src);
      const exists = fs.existsSync(localAbs);
      const encTag = sd.encrypt ? chalk.yellow(' [enc]') : '';
      console.log(`    ${sd.src}${encTag}  ${exists ? chalk.green('✔') : chalk.red('✗')}`);
    }
    console.log();
  }

  // jsonFields
  if (profile.jsonFields && profile.jsonFields.length > 0) {
    console.log(chalk.bold(`  ${t('agentInfo.jsonFields')} (${profile.jsonFields.length}):`));
    for (const jf of profile.jsonFields) {
      const localAbs = path.join(wsPath, jf.src);
      const localSize = fileSizeOrNull(localAbs);
      const repoRel = `agents/${name}/${jf.repoName}${jf.encrypt ? '.enc' : ''}`;
      const repoAbs = path.join(repoPath, repoRel);
      const repoSize = fileSizeOrNull(repoAbs);
      const localTag = localSize !== null ? chalk.green(formatSize(localSize)) : chalk.red(t('agentInfo.missing'));
      const repoTag = repoSize !== null ? chalk.green(formatSize(repoSize)) : chalk.gray(t('agentInfo.notInRepo'));
      console.log(`    ${jf.src} → ${jf.repoName}  ${t('agentInfo.fields')}: [${jf.fields.join(', ')}]`);
      console.log(`      ${t('agentInfo.local')}: ${localTag}  ${t('agentInfo.repo')}: ${repoTag}`);
      if (localSize !== null) totalLocalSize += localSize;
      if (repoSize !== null) totalRepoSize += repoSize;
    }
    console.log();
  }

  // Last sync
  const meta = syncEngine.readSyncMeta(repoPath);
  if (meta) {
    console.log(`  ${t('agentInfo.lastSync')}: ${meta.lastSyncAt} (${meta.hostname})`);
  } else {
    console.log(`  ${t('agentInfo.lastSync')}: ${chalk.gray(t('agentInfo.never'))}`);
  }

  // Total sizes
  console.log(`  ${t('agentInfo.totalLocal')}: ${formatSize(totalLocalSize)}  ${t('agentInfo.totalRepo')}: ${formatSize(totalRepoSize)}`);
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

  if (action === 'info') {
    if (!name) {
      throw new Error(t('agent.nameRequired'));
    }
    if (!(AGENT_NAMES as readonly string[]).includes(name)) {
      throw new Error(t('cli.invalidAgent', { val: name }));
    }
    agentInfo(cfg, name as AgentName);
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
    throw new Error(t('agent.unknownAction2', { action }));
  }

  if (!name) {
    throw new Error(t('agent.nameRequired'));
  }

  if (!(AGENT_NAMES as readonly string[]).includes(name)) {
    throw new Error(t('cli.invalidAgent', { val: name }));
  }

  setAgentEnabled(cfg, name as AgentName, action === 'enable');
}
