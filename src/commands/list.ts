/**
 * list.ts — wangchuan list 命令
 *
 * 瞬间列出所有受管配置文件，不做任何 git/IO 操作。
 * 支持 --agent 过滤，按智能体和共享层分组展示。
 */

import fs from 'fs';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import type { ListOptions, AgentName, SyncTier } from '../types.js';
import chalk from 'chalk';

const TIER_LABELS: Record<SyncTier, string> = {
  openclaw: 'OpenClaw',
  claude:   'Claude',
  gemini:   'Gemini',
  shared:   'Shared（跨 Agent 共享）',
};

export async function cmdList({ agent }: ListOptions = {}): Promise<void> {
  logger.banner('忘川 · 配置清单');

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const entries  = syncEngine.buildFileEntries(cfg, undefined, agent);

  // 按 agentName 分组
  const groups = new Map<SyncTier, typeof entries>();
  for (const e of entries) {
    const tier = e.agentName;
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier)!.push(e);
  }

  let totalFiles = 0;

  // 先展示 shared，再展示各 agent
  const order: SyncTier[] = ['shared', 'openclaw', 'claude', 'gemini'];
  for (const tier of order) {
    const group = groups.get(tier);
    if (!group || group.length === 0) continue;

    console.log(chalk.bold.cyan(`  ▸ ${TIER_LABELS[tier]}`));

    for (const e of group) {
      const localExists = fs.existsSync(e.srcAbs);
      const repoExists  = fs.existsSync(`${repoPath}/${e.repoRel}`);

      const localMark = localExists ? chalk.green('✔') : chalk.red('✖');
      const repoMark  = repoExists  ? chalk.green('✔') : chalk.gray('·');
      const encLabel  = e.encrypt   ? chalk.magenta('[enc]') : '     ';
      const jsonLabel = e.jsonExtract ? chalk.yellow('[字段]') : '      ';

      console.log(
        `    ${localMark} 本地  ${repoMark} 仓库  ${encLabel} ${jsonLabel}  ${chalk.white(e.repoRel)}`
      );
      console.log(chalk.gray(`              └─ ${e.srcAbs}`));
    }
    console.log();
    totalFiles += group.length;
  }

  console.log(chalk.gray(`  共 ${totalFiles} 个配置文件`));
  console.log(chalk.gray(`  ✔ = 存在  · = 仓库中尚无  [enc] = 加密  [字段] = JSON 字段提取`));
}
