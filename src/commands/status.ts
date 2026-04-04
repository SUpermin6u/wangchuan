/**
 * status.ts — wangchuan status command
 */

import fs from 'fs';
import { config }           from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { ensureMigrated }   from '../core/migrate.js';
import { gitEngine }       from '../core/git.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import type { StatusOptions } from '../types.js';
import chalk from 'chalk';

export async function cmdStatus({ agent }: StatusOptions = {}): Promise<void> {
  logger.banner(t('status.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);

  console.log(chalk.bold('  ' + t('status.repo')) + chalk.cyan(cfg.repo));
  console.log(chalk.bold('  ' + t('status.local')) + repoPath);
  console.log(chalk.bold('  ' + t('status.branch')) + chalk.yellow(resolveGitBranch(cfg)));
  console.log(chalk.bold('  ' + t('status.env')) + chalk.magenta(cfg.environment ?? 'default'));
  if (agent) console.log(chalk.bold('  ' + t('status.agent')) + chalk.cyan(agent));
  console.log();

  // ── Recent commits ──────────────────────────────────────────────
  try {
    const logs = await gitEngine.log(repoPath, 3);
    if (logs.length > 0) {
      console.log(chalk.bold('  ' + t('status.recentCommits')));
      for (const c of logs) {
        const date = new Date(c.date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(
          `    ${chalk.gray(c.hash.slice(0, 7))}  ${chalk.white(c.message.slice(0, 60))}  ${chalk.gray(date)}`
        );
      }
      console.log();
    }
  } catch {
    logger.warn(t('status.cannotReadLog'));
  }

  // ── Git worktree status ─────────────────────────────────────────
  const gitStatus = await gitEngine.status(repoPath);
  if (gitStatus !== null) {
    const { modified, created, deleted, not_added } = gitStatus;
    const hasPending = modified.length + created.length + deleted.length + not_added.length > 0;

    if (hasPending) {
      console.log(chalk.bold('  ' + t('status.uncommitted')));
      modified.forEach(f  => console.log(`    ${chalk.yellow('M')} ${f}`));
      created.forEach(f   => console.log(`    ${chalk.green('A')} ${f}`));
      deleted.forEach(f   => console.log(`    ${chalk.red('D')} ${f}`));
      not_added.forEach(f => console.log(`    ${chalk.gray('?')} ${f}`));
      console.log();
    } else {
      logger.ok('  ' + t('status.inSync'));
      console.log();
    }
  }

  // ── Workspace diff ──────────────────────────────────────────────
  try {
    const diff = await syncEngine.diff(cfg, agent);
    const total = diff.added.length + diff.modified.length + diff.missing.length;

    if (total === 0) {
      logger.ok('  ' + t('status.noSync'));
    } else {
      console.log(chalk.bold('  ' + t('status.workspaceDiff')));
      diff.added.forEach(f    => console.log(`    ${chalk.green('+')} ${f}  ${chalk.gray(t('status.newTag'))}`));
      diff.modified.forEach(f => console.log(`    ${chalk.yellow('~')} ${f}  ${chalk.gray(t('status.modifiedTag'))}`));
      diff.missing.forEach(f  => console.log(`    ${chalk.red('-')} ${f}  ${chalk.gray(t('status.missingTag'))}`));
      console.log();
      console.log(
        `  ${chalk.yellow('+')} ${diff.added.length} ${t('status.addedLabel')}  ` +
        `${chalk.yellow('~')} ${diff.modified.length} ${t('status.modifiedLabel')}  ` +
        `${chalk.red('-')} ${diff.missing.length} ${t('status.missingLabel')}`
      );
    }

    // ── Conflict detection ──────────────────────────────────────
    if (diff.modified.length > 0) {
      const meta = syncEngine.readSyncMeta(repoPath);
      if (meta) {
        const lastSyncTs = new Date(meta.lastSyncAt).getTime();
        const conflictFiles: string[] = [];
        const entries = syncEngine.buildFileEntries(cfg, undefined, agent);

        for (const repoRel of diff.modified) {
          const entry = entries.find(e => e.repoRel === repoRel);
          if (!entry || !fs.existsSync(entry.srcAbs)) continue;
          const stat = fs.statSync(entry.srcAbs);
          if (stat.mtimeMs > lastSyncTs) {
            conflictFiles.push(repoRel);
          }
        }

        if (conflictFiles.length > 0) {
          // Check if remote also has newer commits
          try {
            const branch = resolveGitBranch(cfg);
            const ahead = await gitEngine.fetchAndCheckRemoteAhead(repoPath, branch);
            if (ahead > 0) {
              console.log();
              console.log(chalk.bold.yellow(`  ${t('status.conflictWarning')}`));
              for (const f of conflictFiles) {
                console.log(`    ${chalk.yellow(t('status.conflictFile', { file: f }))}`);
              }
              console.log();
              logger.info(`  ${t('status.conflictHint')}`);
            }
          } catch {
            // Fetch failed — skip conflict check silently
          }
        }
      }
    }
  } catch (err) {
    logger.warn(t('status.diffFailed', { error: (err as Error).message }));
  }

  // ── File inventory ──────────────────────────────────────────────
  console.log();
  const entries = syncEngine.buildFileEntries(cfg, undefined, agent);
  console.log(chalk.bold(`  ${t('status.inventory', { count: entries.length })}`));
  for (const e of entries) {
    const mark     = fs.existsSync(e.srcAbs) ? chalk.green('✔') : chalk.red('✖');
    const encLabel = e.encrypt ? chalk.gray('[enc]') : '';
    const jfLabel  = e.jsonExtract ? chalk.blue(t('status.fieldLabel')) : '';
    console.log(`    ${mark} ${e.repoRel} ${encLabel}${jfLabel}`);
  }
}
