/**
 * env.ts — wangchuan env command
 *
 * Manages multi-environment memory isolation via git branches.
 * Each environment maps to a git branch:
 *   default → cfg.branch (typically 'main')
 *   <name>  → env/<name>
 */

import { config, resolveGitBranch } from '../core/config.js';
import { ensureMigrated }           from '../core/migrate.js';
import { gitEngine }                from '../core/git.js';
import { syncEngine }               from '../core/sync.js';
import { validator }                from '../utils/validator.js';
import { logger }                   from '../utils/logger.js';
import { t }                        from '../i18n.js';
import type { EnvOptions, WangchuanConfig } from '../types.js';
import chalk    from 'chalk';
import ora      from 'ora';
import readline from 'readline';

export async function cmdEnv({ action, name, from: fromBranch }: EnvOptions): Promise<void> {
  logger.banner(t('env.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const repoPath = syncEngine.expandHome(cfg.localRepoPath);

  switch (action) {
    case 'current': return cmdEnvCurrent(cfg);
    case 'list':    return cmdEnvList(cfg, repoPath);
    case 'create':  return cmdEnvCreate(cfg, repoPath, name, fromBranch);
    case 'switch':  return cmdEnvSwitch(cfg, repoPath, name);
    case 'delete':  return cmdEnvDelete(cfg, repoPath, name);
    default:
      throw new Error(t('env.unknownAction', { action }));
  }
}

// ── current ──────────────────────────────────────────────────────────

function cmdEnvCurrent(cfg: WangchuanConfig): void {
  const current = cfg.environment ?? 'default';
  console.log(t('env.current', { name: chalk.cyan(current) }));
}

// ── list ─────────────────────────────────────────────────────────────

async function cmdEnvList(cfg: WangchuanConfig, repoPath: string): Promise<void> {
  const current = cfg.environment ?? 'default';
  const branches = await gitEngine.listBranches(repoPath);

  // Build display list: 'default' + any env/* branches
  const envs: string[] = ['default'];
  for (const b of branches) {
    if (b.startsWith('env/')) {
      envs.push(b.slice(4)); // strip 'env/' prefix for display
    }
  }

  console.log(chalk.bold(t('env.list.header')));
  if (envs.length === 0) {
    console.log('  ' + chalk.gray(t('env.list.empty')));
    return;
  }

  for (const env of envs) {
    const isCurrent = env === current;
    const branch = env === 'default' ? cfg.branch : `env/${env}`;
    const marker = isCurrent ? chalk.green('* ') : '  ';
    const nameStr = isCurrent ? chalk.green(env) : chalk.white(env);
    console.log(`${marker}${nameStr}  ${chalk.gray(branch)}`);
  }
}

// ── create ────────────────────────────────────────────────────────────

async function cmdEnvCreate(cfg: WangchuanConfig, repoPath: string, name?: string, fromBranch?: string): Promise<void> {
  if (!name) throw new Error(t('env.notFound', { name: '(empty)' }));

  const branch = `env/${name}`;
  const exists = await gitEngine.branchExists(repoPath, branch);
  if (exists) throw new Error(t('env.alreadyExists', { name }));

  const base = fromBranch ?? resolveGitBranch(cfg);
  const spinner = ora(t('env.create.creating', { name })).start();
  try {
    await gitEngine.createBranch(repoPath, branch, base);
    spinner.succeed(t('env.created', { name }));
  } catch (err) {
    spinner.fail();
    throw err;
  }

  // ── Prompt to import memories from current environment ──────────
  if (process.stdin.isTTY && process.env['WANGCHUAN_NONINTERACTIVE'] !== '1') {
    const importAnswer = await askYesNo(t('env.create.importPrompt'));
    if (importAnswer) {
      const currentEnv = cfg.environment ?? 'default';
      logger.ok(t('env.create.imported', { env: currentEnv }));
    } else {
      // Clear all files in the new branch for an empty environment (local only)
      const clearSpinner = ora(t('env.create.clearing')).start();
      clearSpinner.succeed(t('env.create.empty', { name }));
    }
  } else {
    // Non-interactive: fork with memories (default behavior)
    const currentEnv = cfg.environment ?? 'default';
    logger.ok(t('env.create.imported', { env: currentEnv }));
  }
}

/** Simple yes/no prompt, defaults to yes */
function askYesNo(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, (answer: string) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed !== 'n' && trimmed !== 'no');
    });
  });
}

// ── switch ────────────────────────────────────────────────────────────

async function cmdEnvSwitch(cfg: WangchuanConfig, repoPath: string, name?: string): Promise<void> {
  if (!name) throw new Error(t('env.notFound', { name: '(empty)' }));

  const targetBranch = name === 'default' ? cfg.branch : `env/${name}`;

  // Verify target branch exists (unless switching to default main)
  if (name !== 'default') {
    const exists = await gitEngine.branchExists(repoPath, targetBranch);
    if (!exists) throw new Error(t('env.notFound', { name }));
  }

  const spinner = ora(t('env.switch.switching', { name })).start();
  try {
    await gitEngine.switchBranch(repoPath, targetBranch);
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }

  // Update config.environment
  const newEnv = name === 'default' ? undefined : name;
  const updated: WangchuanConfig = newEnv === undefined
    ? (() => { const { environment: _e, ...rest } = cfg as WangchuanConfig & { environment?: string }; return rest as WangchuanConfig; })()
    : { ...cfg, environment: newEnv };
  config.save(updated);

  logger.ok(t('env.switched', { name }));

  // Pull-only: restore the new environment's data to workspace (no push)
  await syncEngine.restoreFromRepo(updated);
  logger.info(t('env.switch.syncHint'));
}

// ── delete ────────────────────────────────────────────────────────────

async function cmdEnvDelete(cfg: WangchuanConfig, repoPath: string, name?: string): Promise<void> {
  if (!name) throw new Error(t('env.notFound', { name: '(empty)' }));
  if (name === 'default') throw new Error(t('env.cannotDeleteDefault'));

  const current = cfg.environment ?? 'default';
  if (name === current) throw new Error(t('env.cannotDeleteCurrent', { name }));

  const branch = `env/${name}`;
  const exists = await gitEngine.branchExists(repoPath, branch);
  if (!exists) throw new Error(t('env.notFound', { name }));

  const spinner = ora(t('env.delete.deleting', { name })).start();
  try {
    await gitEngine.deleteBranch(repoPath, branch);
    spinner.succeed(t('env.deleted', { name }));
  } catch (err) {
    spinner.fail();
    throw err;
  }
}
