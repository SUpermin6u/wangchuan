/**
 * key.ts — wangchuan key rotate|export|import command
 *
 * Key lifecycle management: rotation, export, and import of master encryption key.
 */

import fs   from 'fs';
import path from 'path';
import { config }          from '../core/config.js';
import { cryptoEngine }    from '../core/crypto.js';
import { gitEngine }       from '../core/git.js';
import { resolveGitBranch } from '../core/config.js';
import { syncEngine }      from '../core/sync.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { walkDir }         from '../utils/fs.js';
import { t }               from '../i18n.js';
import { ensureMigrated }  from '../core/migrate.js';
import ora from 'ora';

export interface KeyOptions {
  readonly action: string;
  readonly hex?: string | undefined;
}

/** Find all .enc files in the repo (agents/ and shared/ directories) */
function findEncFiles(repoPath: string): string[] {
  const encFiles: string[] = [];
  for (const topDir of ['agents', 'shared']) {
    const scanRoot = path.join(repoPath, topDir);
    if (!fs.existsSync(scanRoot)) continue;
    for (const relFile of walkDir(scanRoot)) {
      if (relFile.endsWith('.enc')) {
        encFiles.push(path.join(topDir, relFile));
      }
    }
  }
  return encFiles;
}

async function rotateKey(cfg: import('../types.js').WangchuanConfig): Promise<void> {
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const keyPath  = syncEngine.expandHome(cfg.keyPath);

  // 1. Find all .enc files in repo
  const encFiles = findEncFiles(repoPath);
  if (encFiles.length === 0) {
    logger.info(t('key.rotate.noFiles'));
    return;
  }

  const spinner = ora(t('key.rotate.start')).start();

  // 2. Read old key
  const oldKeyHex = fs.readFileSync(keyPath, 'utf-8').trim();

  // 3. Decrypt all files with old key into memory
  spinner.text = t('key.rotate.decrypting', { count: encFiles.length });
  const decryptedContents = new Map<string, string>();
  for (const relFile of encFiles) {
    const absPath = path.join(repoPath, relFile);
    const encrypted = fs.readFileSync(absPath, 'utf-8').trim();
    // Decrypt using the old key (key is already at keyPath)
    const decrypted = cryptoEngine.decryptString(encrypted, keyPath);
    decryptedContents.set(relFile, decrypted);
  }

  // 4. Generate new key (overwrites old key file)
  const newKey = cryptoEngine.generateKey(keyPath);

  // 5. Re-encrypt all files with new key
  spinner.text = t('key.rotate.reencrypting');
  try {
    for (const [relFile, plaintext] of decryptedContents) {
      const absPath = path.join(repoPath, relFile);
      const reEncrypted = cryptoEngine.encryptString(plaintext, keyPath);
      fs.writeFileSync(absPath, reEncrypted, 'utf-8');
    }
  } catch (err) {
    // Rollback: restore old key
    fs.writeFileSync(keyPath, oldKeyHex, { mode: 0o600, encoding: 'utf-8' });
    spinner.fail(t('key.rotate.failed', { error: (err as Error).message }));
    logger.warn(t('key.rotate.rolledBack'));
    return;
  }

  // 6. Commit and push
  try {
    await gitEngine.commitAndPush(
      repoPath,
      'security: rotate master key',
      resolveGitBranch(cfg),
    );
  } catch (err) {
    // Rollback: restore old key and re-encrypt with old key
    fs.writeFileSync(keyPath, oldKeyHex, { mode: 0o600, encoding: 'utf-8' });
    for (const [relFile, plaintext] of decryptedContents) {
      const absPath = path.join(repoPath, relFile);
      const reEncrypted = cryptoEngine.encryptString(plaintext, keyPath);
      fs.writeFileSync(absPath, reEncrypted, 'utf-8');
    }
    spinner.fail(t('key.rotate.failed', { error: (err as Error).message }));
    logger.warn(t('key.rotate.rolledBack'));
    return;
  }

  spinner.succeed(t('key.rotate.complete', { count: encFiles.length }));
}

function exportKey(cfg: import('../types.js').WangchuanConfig): void {
  const keyPath = syncEngine.expandHome(cfg.keyPath);
  const hex = fs.readFileSync(keyPath, 'utf-8').trim();
  logger.info(t('key.export.hex', { hex }));
  logger.warn(t('key.export.warning'));
}

function importKey(cfg: import('../types.js').WangchuanConfig, hex: string | undefined): void {
  if (!hex) {
    throw new Error(t('key.import.hexRequired'));
  }
  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(t('key.import.invalidHex'));
  }
  const keyPath = syncEngine.expandHome(cfg.keyPath);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, trimmed, { mode: 0o600, encoding: 'utf-8' });
  logger.ok(t('key.import.success', { path: keyPath }));
}

export async function cmdKey({ action, hex }: KeyOptions): Promise<void> {
  logger.banner(t('key.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  switch (action) {
    case 'rotate':
      await rotateKey(cfg);
      break;
    case 'export':
      exportKey(cfg);
      break;
    case 'import':
      importKey(cfg, hex);
      break;
    default:
      throw new Error(t('key.unknownAction', { action }));
  }
}
