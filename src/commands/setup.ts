/**
 * setup.ts — wangchuan setup command
 *
 * Generates a one-liner setup script for initializing Wangchuan on a new machine.
 * Reads current repo URL and master key, then prints a copy-paste command.
 */

import fs from 'fs';
import { config }     from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { syncEngine } from '../core/sync.js';
import { validator }  from '../utils/validator.js';
import { logger }     from '../utils/logger.js';
import { t }          from '../i18n.js';
import chalk from 'chalk';

export async function cmdSetup(): Promise<void> {
  logger.banner(t('setup.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const keyPath = syncEngine.expandHome(cfg.keyPath);
  if (!fs.existsSync(keyPath)) {
    throw new Error(t('setup.keyNotFound', { path: keyPath }));
  }

  const keyHex = fs.readFileSync(keyPath, 'utf-8').trim();
  const repo = cfg.repo;

  console.log(chalk.bold(`  ${t('setup.repoLabel')}`) + chalk.cyan(repo));
  console.log(chalk.bold(`  ${t('setup.keyLabel')}`) + chalk.gray(keyHex.slice(0, 8) + '…' + keyHex.slice(-8)));
  console.log();

  // Generate the one-liner
  const command = `npx wangchuan init --repo ${repo} --key ${keyHex}`;
  console.log(chalk.bold(`  ${t('setup.commandLabel')}`));
  console.log();
  console.log(`  ${chalk.green(command)}`);
  console.log();

  // Security warning
  logger.warn(t('setup.securityWarning'));
  console.log();

  // Clipboard hint
  logger.info(t('setup.clipboardHint'));
}
