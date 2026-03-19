/**
 * list.ts — wangchuan list 命令
 *
 * 瞬间列出所有受管配置文件，不做任何 git/IO 操作。
 * 支持 --agent 过滤，按智能体分组展示。
 */

import fs from 'fs';
import { config }     from '../core/config.js';
import { syncEngine } from '../core/sync.js';
import { validator }  from '../utils/validator.js';
import { logger }     from '../utils/logger.js';
import type { ListOptions, AgentName } from '../types.js';
import chalk from 'chalk';

const AGENT_LABELS: Record<AgentName, string> = {
  openclaw: 'OpenClaw',
  claude:   'Claude',
  gemini:   'Gemini',
};

export async function cmdList({ agent }: ListOptions = {}): Promise<void> {
  logger.banner('忘川 · 配置清单');

  const cfg = config.load();
  validator.requireInit(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const allAgents: AgentName[] = agent ? [agent] : ['openclaw', 'claude', 'gemini'];

  let totalFiles = 0;

  for (const ag of allAgents) {
    const entries = syncEngine.buildFileEntries(cfg, undefined, ag);
    if (entries.length === 0) continue;

    console.log(chalk.bold.cyan(`  ▸ ${AGENT_LABELS[ag]}`));

    for (const e of entries) {
      const localExists = fs.existsSync(e.srcAbs);
      const repoExists  = fs.existsSync(`${repoPath}/${e.repoRel}`);

      const localMark = localExists ? chalk.green('✔') : chalk.red('✖');
      const repoMark  = repoExists  ? chalk.green('✔') : chalk.gray('·');
      const encLabel  = e.encrypt   ? chalk.magenta('[enc]') : '     ';

      console.log(
        `    ${localMark} 本地  ${repoMark} 仓库  ${encLabel}  ${chalk.white(e.repoRel)}`
      );
      console.log(chalk.gray(`              └─ ${e.srcAbs}`));
    }
    console.log();
    totalFiles += entries.length;
  }

  console.log(chalk.gray(`  共 ${totalFiles} 个配置文件`));
  console.log(chalk.gray(`  ✔ = 存在  · = 仓库中尚无（未推送）  [enc] = 加密存储`));
}
