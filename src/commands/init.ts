/**
 * init.ts — wangchuan init command
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

export async function cmdInit({ repo, force = false, key }: InitOptions): Promise<WangchuanConfig> {
  logger.banner(t('init.banner'));

  if (!validator.isGitUrl(repo)) {
    throw new Error(t('init.invalidGitUrl', { repo }));
  }

  const existing = config.load();
  if (existing !== null && !force) {
    logger.warn(t('init.alreadyInit', { repo: existing.repo }));
    logger.info(t('init.useForce'));
    return existing;
  }

  // ── Write config ────────────────────────────────────────────────
  let spinner = ora(t('init.writingConfig')).start();
  const cfg = await config.initialize(repo);
  spinner.succeed(t('init.configSaved', { path: config.paths.config }));

  // ── Key ─────────────────────────────────────────────────────────
  if (key) {
    const hex = key.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(t('init.invalidKey'));
    }
    fs.mkdirSync(path.dirname(cfg.keyPath), { recursive: true });
    fs.writeFileSync(cfg.keyPath, hex, 'utf-8');
    logger.ok(t('init.keyImported', { path: cfg.keyPath }));
  } else if (!cryptoEngine.hasKey(cfg.keyPath)) {
    spinner = ora(t('init.generatingKey')).start();
    cryptoEngine.generateKey(cfg.keyPath);
    spinner.succeed(t('init.keyGenerated', { path: cfg.keyPath }));
  } else {
    logger.info(t('init.keyExists', { path: cfg.keyPath }));
  }

  // ── Clone/fetch repo ────────────────────────────────────────────
  spinner = ora(t('init.cloningRepo', { repo })).start();
  try {
    await gitEngine.cloneOrFetch(repo, cfg.localRepoPath, cfg.branch);
    spinner.succeed(t('init.repoReady', { path: cfg.localRepoPath }));
  } catch (err) {
    spinner.fail(t('init.cloneFailed'));
    throw new Error(t('init.gitFailed', { error: (err as Error).message }));
  }

  logger.ok('\n' + t('init.complete'));
  logger.step(t('init.nextPull'));
  logger.step(t('init.nextPush'));

  return cfg;
}
