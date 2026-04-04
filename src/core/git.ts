/**
 * git.ts — simple-git 封装，提供幂等的 Git 操作
 *
 * simple-git v3 在 ESM 下必须使用具名导入 { simpleGit } 而非默认导入。
 */

import { simpleGit } from 'simple-git';
import type { SimpleGit, DefaultLogFields } from 'simple-git';
import fs   from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import type { CommitResult } from '../types.js';

function createGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath, {
    maxConcurrentProcesses: 1,
    timeout: { block: 30_000 },
  });
}

export const gitEngine = {
  async cloneOrFetch(remoteUrl: string, localPath: string, branch = 'main'): Promise<void> {
    if (fs.existsSync(path.join(localPath, '.git'))) {
      logger.debug(`仓库已存在，执行 fetch: ${localPath}`);
      const git = createGit(localPath);
      await git.fetch('origin', branch);
      await git.reset(['--hard', `origin/${branch}`]);
    } else {
      logger.debug(`克隆仓库: ${remoteUrl} → ${localPath}`);
      fs.mkdirSync(localPath, { recursive: true });
      await simpleGit().clone(remoteUrl, localPath, ['--branch', branch, '--single-branch']);
    }
  },

  async pull(localPath: string, branch = 'main') {
    const git    = createGit(localPath);
    const result = await git.pull('origin', branch, { '--rebase': 'false' });
    logger.debug(`git pull: ${JSON.stringify(result.summary)}`);
    return result;
  },

  async commitAndPush(localPath: string, message: string, branch = 'main'): Promise<CommitResult> {
    const git = createGit(localPath);

    await git.add('.');
    const status = await git.status();

    if (status.isClean()) {
      logger.info('没有新的变更需要提交');
      return { committed: false, pushed: false };
    }

    logger.debug(`暂存文件: ${status.staged.join(', ')}`);
    const commitResult = await git.commit(message);
    logger.debug(`commit: ${commitResult.commit}`);

    await git.push('origin', branch);
    logger.debug(`已推送到 origin/${branch}`);

    return { committed: true, pushed: true, sha: commitResult.commit };
  },

  async status(localPath: string) {
    if (!fs.existsSync(path.join(localPath, '.git'))) return null;
    return createGit(localPath).status();
  },

  async log(localPath: string, n = 5): Promise<readonly DefaultLogFields[]> {
    const result = await createGit(localPath).log({ maxCount: n });
    return result.all;
  },

  async getRemoteUrl(localPath: string): Promise<string | null> {
    const remotes = await createGit(localPath).getRemotes(true);
    return remotes.find(r => r.name === 'origin')?.refs?.fetch ?? null;
  },

  async rollback(localPath: string): Promise<void> {
    logger.warn('正在回滚最近一次 commit …');
    await createGit(localPath).reset(['--soft', 'HEAD~1']);
    logger.warn('回滚完成，本地变更已保留在暂存区');
  },

  /**
   * Fetch from remote and check if remote branch is ahead of local.
   * Returns the number of commits the remote is ahead.
   */
  async fetchAndCheckRemoteAhead(localPath: string, branch = 'main'): Promise<number> {
    const git = createGit(localPath);
    await git.fetch('origin', branch);
    const local  = await git.revparse([branch]);
    const remote = await git.revparse([`origin/${branch}`]);
    if (local.trim() === remote.trim()) return 0;
    // Count commits remote is ahead
    const log = await git.log({ from: branch, to: `origin/${branch}` });
    return log.total;
  },

  async isGitAvailable(): Promise<boolean> {
    try {
      await simpleGit().version();
      return true;
    } catch {
      return false;
    }
  },
} as const;
