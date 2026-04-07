/**
 * init.ts — wangchuan init command
 *
 * Idempotent initialization:
 * - Config exists + same repo → "already initialized", exit 0
 * - Config exists + different repo → suggest --force
 * - Config exists + repo dir missing → re-clone without --force
 * - Key exists → skip key generation
 * - --force → full overwrite
 */

import { config }       from '../core/config.js';
import { cryptoEngine } from '../core/crypto.js';
import { gitEngine }    from '../core/git.js';
import { validator }    from '../utils/validator.js';
import { logger }       from '../utils/logger.js';
import { t }            from '../i18n.js';
import type { InitOptions, WangchuanConfig } from '../types.js';
import ora from 'ora';
import fs   from 'fs';
import path from 'path';
import readline from 'readline';

/**
 * Prompt the user for the git repo URL when --repo is not provided and stdin is a TTY.
 */
async function promptRepoUrl(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(t('init.promptRepo') + ' ', (answer: string) => {
      rl.close();
      const url = answer.trim();
      if (!url) {
        reject(new Error(t('init.repoRequired')));
        return;
      }
      resolve(url);
    });
  });
}

export async function cmdInit({ repo: repoArg, force = false, key }: InitOptions): Promise<WangchuanConfig> {
  // If repo is not provided, prompt interactively (TTY only)
  let repo: string;
  if (repoArg) {
    repo = repoArg;
  } else if (process.stdin.isTTY) {
    repo = await promptRepoUrl();
  } else {
    throw new Error(t('init.repoRequired'));
  }

  logger.banner(t('init.banner'));

  if (!validator.isGitUrl(repo)) {
    throw new Error(t('init.invalidGitUrl', { repo }));
  }

  const existing = config.load();

  if (existing !== null && !force) {
    const sameRepo = normalizeRepo(existing.repo) === normalizeRepo(repo);
    const repoDir  = existing.localRepoPath;
    const repoDirExists = fs.existsSync(path.join(repoDir, '.git'));

    if (sameRepo && repoDirExists) {
      // Fully initialized with the same repo — nothing to do
      logger.ok(t('init.alreadySame'));
      return existing;
    }

    if (!sameRepo) {
      // Different repo — require --force
      logger.warn(t('init.differentRepo', { existing: existing.repo }));
      logger.info(t('init.useForceSwitch'));
      return existing;
    }

    // Same repo but repo dir is missing — re-clone
    logger.info(t('init.repoMissing'));
    await ensureKey(existing, key);
    await cloneRepo(repo, existing.localRepoPath, existing.branch);
    logger.ok('\n' + t('init.complete'));
    return existing;
  }

  // ── Fresh init or --force ─────────────────────────────────────
  let spinner = ora(t('init.writingConfig')).start();
  const cfg = await config.initialize(repo);
  spinner.succeed(t('init.configSaved', { path: config.paths.config }));

  await ensureKey(cfg, key);
  await cloneRepo(repo, cfg.localRepoPath, cfg.branch);

  logger.ok('\n' + t('init.complete'));
  logger.step(t('init.nextPull'));
  logger.step(t('init.nextPush'));

  return cfg;
}

/** Normalize a git URL for comparison (strip trailing .git and slashes) */
function normalizeRepo(url: string): string {
  return url.replace(/\/+$/, '').replace(/\.git$/, '');
}

/** Ensure the master key exists (import, generate, or skip) */
async function ensureKey(cfg: WangchuanConfig, key: string | undefined): Promise<void> {
  if (key) {
    const hex = key.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(t('init.invalidKey'));
    }
    fs.mkdirSync(path.dirname(cfg.keyPath), { recursive: true });
    fs.writeFileSync(cfg.keyPath, hex, 'utf-8');
    logger.ok(t('init.keyImported', { path: cfg.keyPath }));
  } else if (!cryptoEngine.hasKey(cfg.keyPath)) {
    const spinner = ora(t('init.generatingKey')).start();
    cryptoEngine.generateKey(cfg.keyPath);
    spinner.succeed(t('init.keyGenerated', { path: cfg.keyPath }));
  } else {
    logger.info(t('init.keyExists', { path: cfg.keyPath }));
  }
}

/** Clone or fetch the repo */
async function cloneRepo(repo: string, localPath: string, branch: string): Promise<void> {
  const spinner = ora(t('init.cloningRepo', { repo })).start();
  try {
    await gitEngine.cloneOrFetch(repo, localPath, branch);
    spinner.succeed(t('init.repoReady', { path: localPath }));
  } catch (err) {
    spinner.fail(t('init.cloneFailed'));
    throw new Error(t('init.gitFailed', { error: (err as Error).message }));
  }
}
