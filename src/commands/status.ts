/**
 * status.ts — wangchuan status command / status 命令
 */

import fs from 'fs';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import type { StatusOptions } from '../types.js';
import chalk from 'chalk';

export async function cmdStatus({ agent }: StatusOptions = {}): Promise<void> {
  logger.banner('Wangchuan · Status / 忘川 · 同步状态');

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);

  console.log(chalk.bold('  Repo / 仓库地址：') + chalk.cyan(cfg.repo));
  console.log(chalk.bold('  Local / 本地路径：') + repoPath);
  console.log(chalk.bold('  Branch / 分支：  ') + chalk.yellow(cfg.branch));
  if (agent) console.log(chalk.bold('  Agent / 过滤智能体：') + chalk.cyan(agent));
  console.log();

  // ── Recent commits / 最近提交 ──────────────────────────────────
  try {
    const logs = await gitEngine.log(repoPath, 3);
    if (logs.length > 0) {
      console.log(chalk.bold('  Recent commits / 最近提交：'));
      for (const c of logs) {
        const date = new Date(c.date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(
          `    ${chalk.gray(c.hash.slice(0, 7))}  ${chalk.white(c.message.slice(0, 60))}  ${chalk.gray(date)}`
        );
      }
      console.log();
    }
  } catch {
    logger.warn('Cannot read git log (repo may not be cloned) / 无法读取 git 日志');
  }

  // ── Git worktree status / Git 工作树状态 ───────────────────────
  const gitStatus = await gitEngine.status(repoPath);
  if (gitStatus !== null) {
    const { modified, created, deleted, not_added } = gitStatus;
    const hasPending = modified.length + created.length + deleted.length + not_added.length > 0;

    if (hasPending) {
      console.log(chalk.bold('  Uncommitted changes / 本地仓库（未提交变更）：'));
      modified.forEach(f  => console.log(`    ${chalk.yellow('M')} ${f}`));
      created.forEach(f   => console.log(`    ${chalk.green('A')} ${f}`));
      deleted.forEach(f   => console.log(`    ${chalk.red('D')} ${f}`));
      not_added.forEach(f => console.log(`    ${chalk.gray('?')} ${f}`));
      console.log();
    } else {
      logger.ok('  Local repo in sync with remote / 本地仓库与远端保持一致');
      console.log();
    }
  }

  // ── Workspace diff / 工作区差异 ────────────────────────────────
  try {
    const diff = await syncEngine.diff(cfg, agent);
    const total = diff.added.length + diff.modified.length + diff.missing.length;

    if (total === 0) {
      logger.ok('  Workspace matches repo, no sync needed / 工作区与仓库一致，无需同步');
    } else {
      console.log(chalk.bold('  Workspace diff / 工作区差异：'));
      diff.added.forEach(f    => console.log(`    ${chalk.green('+')} ${f}  ${chalk.gray('(new, will sync on push / 本地新增)')}`));
      diff.modified.forEach(f => console.log(`    ${chalk.yellow('~')} ${f}  ${chalk.gray('(modified / 已修改)')}`));
      diff.missing.forEach(f  => console.log(`    ${chalk.red('-')} ${f}  ${chalk.gray('(missing, will restore on pull / 本地缺失)')}`));
      console.log();
      console.log(
        `  ${chalk.yellow('+')} ${diff.added.length} added/新增  ` +
        `${chalk.yellow('~')} ${diff.modified.length} modified/修改  ` +
        `${chalk.red('-')} ${diff.missing.length} missing/缺失`
      );
    }
  } catch (err) {
    logger.warn(`Diff analysis failed / 差异分析失败: ${(err as Error).message}`);
  }

  // ── File inventory / 文件清单 ──────────────────────────────────
  console.log();
  const entries = syncEngine.buildFileEntries(cfg, undefined, agent);
  console.log(chalk.bold(`  Config inventory (${entries.length} items) / 配置文件清单：`));
  for (const e of entries) {
    const mark     = fs.existsSync(e.srcAbs) ? chalk.green('✔') : chalk.red('✖');
    const encLabel = e.encrypt ? chalk.gray('[enc]') : '';
    const jfLabel  = e.jsonExtract ? chalk.blue('[field/字段]') : '';
    console.log(`    ${mark} ${e.repoRel} ${encLabel}${jfLabel}`);
  }
}
