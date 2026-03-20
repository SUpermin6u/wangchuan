/**
 * diff.ts — wangchuan diff command / diff 命令
 *
 * Shows line-level unified diff for each changed file.
 * Encrypted files are decrypted before comparison.
 */

import fs from 'fs';
import path from 'path';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine }      from '../core/sync.js';
import { cryptoEngine }    from '../core/crypto.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { diffText }     from '../utils/linediff.js';
import type { DiffCommandOptions } from '../types.js';
import chalk from 'chalk';

export async function cmdDiff({ agent }: DiffCommandOptions = {}): Promise<void> {
  logger.banner('Wangchuan · Diff / 忘川 · 文件差异');

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const keyPath  = syncEngine.expandHome(cfg.keyPath);
  const entries  = syncEngine.buildFileEntries(cfg, undefined, agent);

  if (agent) logger.info(`Filter agent / 过滤智能体: ${chalk.cyan(agent)}\n`);

  let totalChanged = 0;

  for (const entry of entries) {
    const srcExists  = fs.existsSync(entry.srcAbs);
    const repoAbs    = path.join(repoPath, entry.repoRel);
    const repoExists = fs.existsSync(repoAbs);

    // ── Only one side exists / 仅一侧存在 ────────────────────────
    if (srcExists && !repoExists) {
      console.log(chalk.bold.green(`+++ ${entry.repoRel}`) + chalk.gray('  (new, not in repo / 新增，仓库中不存在)'));
      const lines = fs.readFileSync(entry.srcAbs, 'utf-8').split('\n');
      lines.forEach(l => console.log(chalk.green(`+ ${l}`)));
      console.log();
      totalChanged++;
      continue;
    }
    if (!srcExists && repoExists) {
      console.log(chalk.bold.red(`--- ${entry.repoRel}`) + chalk.gray('  (missing locally / 本地缺失)'));
      console.log();
      totalChanged++;
      continue;
    }
    if (!srcExists && !repoExists) continue;

    // ── Both sides exist, read content / 两侧均存在 ──────────────
    const localText = fs.readFileSync(entry.srcAbs, 'utf-8');
    let   repoText: string;

    if (entry.encrypt) {
      try {
        repoText = cryptoEngine.decryptString(
          fs.readFileSync(repoAbs, 'utf-8').trim(),
          keyPath,
        );
      } catch {
        console.log(chalk.yellow(`~ ${entry.repoRel}`) + chalk.gray('  [encrypted, cannot decrypt / 加密文件，无法解密比较]'));
        console.log();
        totalChanged++;
        continue;
      }
    } else {
      repoText = fs.readFileSync(repoAbs, 'utf-8');
    }

    const diffLines = diffText(repoText, localText);
    if (diffLines.length === 0) continue;

    const encLabel = entry.encrypt ? chalk.gray(' [enc]') : '';
    console.log(chalk.bold(`~~~ ${entry.repoRel}`) + encLabel);
    console.log(chalk.gray('    --- repo version / 仓库版本'));
    console.log(chalk.gray('    +++ local version / 本地版本'));
    console.log();

    for (const line of diffLines) {
      if (line.content === '...') {
        console.log(chalk.gray('    ...'));
      } else if (line.type === 'added') {
        console.log(chalk.green(`+   ${line.content}`));
      } else if (line.type === 'removed') {
        console.log(chalk.red(`-   ${line.content}`));
      } else {
        console.log(chalk.gray(`    ${line.content}`));
      }
    }
    console.log();
    totalChanged++;
  }

  if (totalChanged === 0) {
    logger.ok('All files match repo, no diff / 所有文件与仓库一致，无差异');
  } else {
    logger.info(`${totalChanged} files differ / ${totalChanged} 个文件有差异`);
  }
}
