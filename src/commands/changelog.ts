/**
 * changelog.ts — wangchuan changelog command
 *
 * Show what changed in each sync — parse git log + diffstat from the sync repo.
 */

import fs   from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { config }           from '../core/config.js';
import { ensureMigrated }   from '../core/migrate.js';
import { syncEngine }       from '../core/sync.js';
import { validator }        from '../utils/validator.js';
import { logger }           from '../utils/logger.js';
import { t }                from '../i18n.js';
import chalk                from 'chalk';

export interface ChangelogOptions {
  readonly limit?: number | undefined;
}

interface FileChange {
  readonly file: string;
  readonly type: 'added' | 'modified' | 'deleted';
  readonly insertions: number;
  readonly deletions: number;
}

export async function cmdChangelog({ limit = 5 }: ChangelogOptions = {}): Promise<void> {
  logger.banner(t('changelog.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    logger.info(t('changelog.noRepo'));
    return;
  }

  const git = simpleGit(repoPath, {
    maxConcurrentProcesses: 1,
    timeout: { block: 30_000 },
  });

  // Get recent commits
  const logResult = await git.log({ maxCount: limit });

  if (logResult.all.length === 0) {
    logger.info(t('changelog.empty'));
    return;
  }

  for (const commit of logResult.all) {
    const date = new Date(commit.date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const shortHash = commit.hash.slice(0, 7);

    // Header: hash + message + date
    console.log(
      `  ${chalk.yellow(shortHash)}  ${chalk.bold.white(commit.message)}  ${chalk.gray(date)}`
    );

    // Get diffstat for this commit
    try {
      const diffRaw = await git.diff([
        `${commit.hash}~1..${commit.hash}`,
        '--stat',
        '--stat-width=80',
      ]);

      // Parse diffstat output
      const changes = parseDiffStat(diffRaw);
      for (const change of changes) {
        const icon = change.type === 'added'   ? chalk.green('+')
                   : change.type === 'deleted' ? chalk.red('-')
                   :                             chalk.yellow('~');
        const coloredFile = change.type === 'added'   ? chalk.green(change.file)
                          : change.type === 'deleted' ? chalk.red(change.file)
                          :                             chalk.yellow(change.file);
        const stats = change.insertions + change.deletions > 0
          ? chalk.gray(` (+${change.insertions} -${change.deletions})`)
          : '';
        console.log(`    ${icon} ${coloredFile}${stats}`);
      }
    } catch {
      // First commit or other git error — just show the commit header
      console.log(chalk.gray(`    ${t('changelog.firstCommit')}`));
    }
    console.log();
  }

  logger.info(t('changelog.shown', { count: logResult.all.length }));
}

/**
 * Parse git diff --stat output into structured file changes.
 * Lines look like: " agents/claude/MEMORY.md | 10 +++---"
 * The summary line looks like: " 3 files changed, 15 insertions(+), 5 deletions(-)"
 */
function parseDiffStat(raw: string): FileChange[] {
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  const changes: FileChange[] = [];

  for (const line of lines) {
    // Skip the summary line
    if (line.includes('files changed') || line.includes('file changed')) continue;
    if (line.includes('insertion') || line.includes('deletion')) continue;

    // Match: " path/to/file | N ++--" or " path/to/file (new) | N +++"
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)\s*$/);
    if (!match) continue;

    const file = match[1]!.trim();
    const totalChanges = parseInt(match[2]!, 10);
    const changeSummary = match[3] ?? '';

    const insertions = (changeSummary.match(/\+/g) ?? []).length;
    const deletions  = (changeSummary.match(/-/g) ?? []).length;

    // Scale to actual counts
    const totalMarks = insertions + deletions;
    const scaledIns = totalMarks > 0 ? Math.round((insertions / totalMarks) * totalChanges) : 0;
    const scaledDel = totalMarks > 0 ? totalChanges - scaledIns : 0;

    let type: 'added' | 'modified' | 'deleted';
    if (deletions === 0 && insertions > 0) {
      type = 'added';
    } else if (insertions === 0 && deletions > 0) {
      type = 'deleted';
    } else {
      type = 'modified';
    }

    changes.push({ file, type, insertions: scaledIns, deletions: scaledDel });
  }

  return changes;
}
