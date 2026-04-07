/**
 * git.ts — simple-git wrapper providing idempotent Git operations
 *
 * simple-git v3 requires named import { simpleGit } under ESM (not default import).
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
      logger.debug(`Repo exists, running fetch: ${localPath}`);
      const git = createGit(localPath);
      await git.fetch('origin', branch);
      await git.reset(['--hard', `origin/${branch}`]);
    } else {
      logger.debug(`Cloning repo: ${remoteUrl} → ${localPath}`);
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
      logger.info('No new changes to commit');
      return { committed: false, pushed: false };
    }

    logger.debug(`Staged files: ${status.staged.join(', ')}`);
    const commitResult = await git.commit(message);
    logger.debug(`commit: ${commitResult.commit}`);

    await git.push('origin', branch);
    logger.debug(`Pushed to origin/${branch}`);

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
    logger.warn('Rolling back the last commit...');
    await createGit(localPath).reset(['--soft', 'HEAD~1']);
    logger.warn('Rollback complete, local changes preserved in staging area');
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

  async currentBranch(localPath: string): Promise<string> {
    const git = createGit(localPath);
    const result = await git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  },

  async listBranches(localPath: string): Promise<readonly string[]> {
    const git = createGit(localPath);
    // Fetch remote to get up-to-date remote branches
    try { await git.fetch('origin'); } catch { /* ignore fetch errors */ }
    const result = await git.branch(['-a']);
    const branches = new Set<string>();
    for (const b of result.all) {
      // Normalize: strip "remotes/origin/" prefix
      const name = b.replace(/^remotes\/origin\//, '').trim();
      if (name === 'main' || name === 'master' || name.startsWith('env/')) {
        branches.add(name);
      }
    }
    return [...branches].sort();
  },

  async branchExists(localPath: string, branch: string): Promise<boolean> {
    const git = createGit(localPath);
    try {
      const result = await git.branch(['-a']);
      return result.all.some(b => {
        const name = b.replace(/^remotes\/origin\//, '').trim();
        return name === branch;
      });
    } catch {
      return false;
    }
  },

  async createBranch(localPath: string, branch: string, baseBranch?: string): Promise<void> {
    const git = createGit(localPath);
    const base = baseBranch ?? await this.currentBranch(localPath);
    logger.debug(`Creating branch ${branch} from ${base}`);
    await git.checkoutBranch(branch, base);
    await git.push(['--set-upstream', 'origin', branch]);
    logger.debug(`Branch ${branch} pushed to remote`);
  },

  async switchBranch(localPath: string, branch: string): Promise<void> {
    const git = createGit(localPath);
    // If remote branch exists but not local, track it
    const result = await git.branch(['-a']);
    const localExists = result.branches[branch] !== undefined;
    if (localExists) {
      await git.checkout(branch);
    } else {
      // Create local tracking branch from remote
      await git.checkout(['-b', branch, `origin/${branch}`]);
    }
    logger.debug(`Switched to branch ${branch}`);
  },

  /**
   * Read a file's content from a specific git ref (e.g. 'HEAD~1').
   * Returns null if the file or ref doesn't exist.
   */
  async showFile(localPath: string, ref: string, filePath: string): Promise<string | null> {
    try {
      const git = createGit(localPath);
      return await git.show([`${ref}:${filePath}`]);
    } catch {
      return null;
    }
  },

  async deleteBranch(localPath: string, branch: string): Promise<void> {
    if (branch === 'main' || branch === 'master') {
      throw new Error(`Cannot delete protected branch: ${branch}`);
    }
    const git = createGit(localPath);
    await git.branch(['-D', branch]);
    try {
      await git.push(['origin', '--delete', branch]);
    } catch {
      // Remote branch may not exist — ignore
      logger.debug(`Remote branch ${branch} not found, skipping remote delete`);
    }
    logger.debug(`Deleted branch ${branch}`);
  },
} as const;
