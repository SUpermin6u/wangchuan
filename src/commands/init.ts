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
import { syncEngine }   from '../core/sync.js';
import { validator }    from '../utils/validator.js';
import { logger }       from '../utils/logger.js';
import { t }            from '../i18n.js';
import { AGENT_NAMES }  from '../types.js';
import type { InitOptions, WangchuanConfig } from '../types.js';
import ora from 'ora';
import fs   from 'fs';
import path from 'path';
import readline from 'readline';
import { execSync } from 'child_process';

/** Check if GitHub CLI is installed and authenticated */
function isGhAvailable(): boolean {
  try {
    execSync('which gh', { stdio: 'ignore' });
    execSync('gh auth status', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Create a private repo via GitHub CLI and return the SSH URL */
function createRepoViaGh(): string {
  logger.info(t('init.ghCreating'));
  let stdout: string;
  try {
    stdout = execSync('gh repo create wangchuan-sync --private --clone=false', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const sanitized = msg.replace(/\b(gh[opsu]_[A-Za-z0-9_]+)\b/g, '***');
    throw new Error(t('init.ghCreateFailed', { error: sanitized }));
  }
  // gh repo create prints the URL (e.g. https://github.com/user/wangchuan-sync)
  const match = /https:\/\/github\.com\/[^\s]+/.exec(stdout);
  if (!match) {
    throw new Error(t('init.ghParseFailed', { output: stdout }));
  }
  const httpsUrl = match[0]!;
  // Convert to SSH URL for better auth experience
  const cleanUrl = httpsUrl.replace(/\.git$/, '');
  const sshUrl = cleanUrl.replace('https://github.com/', 'git@github.com:') + '.git';
  logger.ok(t('init.ghCreated', { url: sshUrl }));
  return sshUrl;
}

/**
 * Prompt the user for the git repo URL when --repo is not provided and stdin is a TTY.
 * If gh CLI is available, offers to create a new repo.
 */
async function promptRepoUrl(): Promise<string> {
  const ghAvailable = isGhAvailable();

  console.log();
  console.log(t('init.wizard.title'));
  console.log();

  const options: Array<{ label: string; action: () => Promise<string> | string }> = [];

  if (ghAvailable) {
    options.push({
      label: t('init.wizard.ghAuto'),
      action: () => createRepoViaGh(),
    });
  }
  options.push({
    label: t('init.wizard.github'),
    action: () => promptCustomUrl('git@github.com:user/repo.git'),
  });
  options.push({
    label: t('init.wizard.gitlab'),
    action: () => promptCustomUrl('git@gitlab.com:user/repo.git'),
  });
  options.push({
    label: t('init.wizard.gitee'),
    action: () => promptCustomUrl('git@gitee.com:user/repo.git'),
  });
  options.push({
    label: t('init.wizard.other'),
    action: () => promptCustomUrl(),
  });

  for (let i = 0; i < options.length; i++) {
    console.log(`  [${i + 1}] ${options[i]!.label}`);
  }
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(t('init.wizard.choose', { max: String(options.length) }) + ' ', async (answer: string) => {
      rl.close();
      const idx = parseInt(answer.trim(), 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= options.length) {
        reject(new Error(t('init.wizard.invalidChoice')));
        return;
      }
      try {
        resolve(await options[idx]!.action());
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function promptCustomUrl(example?: string): Promise<string> {
  const hint = example ? ` (${t('init.wizard.example')}: ${example})` : '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(t('init.wizard.enterUrl') + hint + ': ', (answer: string) => {
      rl.close();
      const url = answer.trim();
      if (!url) { reject(new Error(t('init.repoRequired'))); return; }
      resolve(url);
    });
  });
}

export async function cmdInit({ repo: repoArg, force = false }: InitOptions): Promise<WangchuanConfig> {
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
    await ensureKey(existing, undefined);
    await cloneRepo(repo, existing.localRepoPath, existing.branch);
    logger.ok('\n' + t('init.complete'));
    return existing;
  }

  // ── Fresh init or --force ─────────────────────────────────────
  let spinner = ora(t('init.writingConfig')).start();
  const cfg = await config.initialize(repo);
  spinner.succeed(t('init.configSaved', { path: config.paths.config }));

  // Report auto-detected agents
  const detectedAgents = AGENT_NAMES.filter(
    name => cfg.profiles.default[name as keyof typeof cfg.profiles.default].enabled,
  );
  if (detectedAgents.length > 0) {
    logger.ok(t('init.detectedAgents', { agents: detectedAgents.join(', ') }));
  } else {
    logger.warn(t('init.noAgentsDetected'));
  }

  await ensureKey(cfg, undefined);
  await cloneRepo(repo, cfg.localRepoPath, cfg.branch);

  // ── Pull-only: restore cloud data to local (no push) ───────────
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const metaPath = path.join(repoPath, 'sync-meta.json');
  if (fs.existsSync(metaPath)) {
    // Repo has existing data — pull it down
    try {
      await syncEngine.restoreFromRepo(cfg);
    } catch (err) {
      logger.warn(t('init.autoSyncFailed', { error: (err as Error).message }));
    }
  }

  logger.info(t('init.syncHint'));
  logger.ok('\n' + t('init.complete'));
  return cfg;
}

/** Normalize a git URL for comparison (strip trailing .git and slashes) */
function normalizeRepo(url: string): string {
  return url.replace(/\/+$/, '').replace(/\.git$/, '');
}

/** Ensure the master key exists (import, generate, or skip) */
export async function ensureKey(cfg: WangchuanConfig, key: string | undefined): Promise<void> {
  if (key) {
    // Support key-from-file: if value is a file path, read key from it
    let rawKey = key.trim();
    if (fs.existsSync(rawKey)) {
      rawKey = fs.readFileSync(rawKey, 'utf-8').trim();
    }
    const hex = rawKey.startsWith('wangchuan_') ? rawKey.slice('wangchuan_'.length) : rawKey;
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(t('init.invalidKey'));
    }
    fs.mkdirSync(path.dirname(cfg.keyPath), { recursive: true });
    fs.writeFileSync(cfg.keyPath, 'wangchuan_' + hex, { encoding: 'utf-8', mode: 0o600 });
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
export async function cloneRepo(repo: string, localPath: string, branch: string): Promise<void> {
  const spinner = ora(t('init.cloningRepo', { repo })).start();
  try {
    await gitEngine.cloneOrFetch(repo, localPath, branch);
    spinner.succeed(t('init.repoReady', { path: localPath }));
  } catch (err) {
    spinner.fail(t('init.cloneFailed'));
    throw new Error(t('init.gitFailed', { error: (err as Error).message }));
  }
}
