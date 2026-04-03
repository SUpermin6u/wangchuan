/**
 * list.ts — wangchuan list command
 *
 * Lists all managed config files with local/repo presence.
 * Grouped by agent and shared tier.
 */

import fs from 'fs';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { ListOptions, AgentName, SyncTier } from '../types.js';
import { AGENT_NAMES } from '../types.js';
import chalk from 'chalk';

const TIER_LABELS: Record<SyncTier, string> = {
  openclaw:  'OpenClaw',
  claude:    'Claude',
  gemini:    'Gemini',
  codebuddy: 'CodeBuddy',
  workbuddy: 'WorkBuddy',
  cursor:    'Cursor',
  shared:    '', // filled dynamically via t()
};

export async function cmdList({ agent }: ListOptions = {}): Promise<void> {
  logger.banner(t('list.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const entries  = syncEngine.buildFileEntries(cfg, undefined, agent);

  // Group by agentName
  const groups = new Map<SyncTier, typeof entries>();
  for (const e of entries) {
    const tier = e.agentName;
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier)!.push(e);
  }

  let totalFiles = 0;

  const order: SyncTier[] = ['shared', ...AGENT_NAMES];
  for (const tier of order) {
    const group = groups.get(tier);
    if (!group || group.length === 0) continue;

    const label = tier === 'shared' ? t('list.tierShared') : TIER_LABELS[tier];
    console.log(chalk.bold.cyan(`  ▸ ${label}`));

    for (const e of group) {
      const localExists = fs.existsSync(e.srcAbs);
      const repoExists  = fs.existsSync(`${repoPath}/${e.repoRel}`);

      const localMark = localExists ? chalk.green('✔') : chalk.red('✖');
      const repoMark  = repoExists  ? chalk.green('✔') : chalk.gray('·');
      const encLabel  = e.encrypt   ? chalk.magenta('[enc]') : '     ';
      const jsonLabel = e.jsonExtract ? chalk.yellow(t('list.fieldLabel')) : '            ';

      console.log(
        `    ${localMark} ${t('list.localLabel')}  ${repoMark} ${t('list.repoLabel')}  ${encLabel} ${jsonLabel}  ${chalk.white(e.repoRel)}`
      );
      console.log(chalk.gray(`              └─ ${e.srcAbs}`));
    }
    console.log();
    totalFiles += group.length;
  }

  console.log(chalk.gray(`  ${t('list.totalFiles', { count: totalFiles })}`));
  console.log(chalk.gray(`  ${t('list.legend')}`));
}
