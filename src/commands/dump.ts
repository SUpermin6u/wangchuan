/**
 * dump.ts — wangchuan dump command
 *
 * Generates a plaintext snapshot mirroring repo structure in a temp dir.
 * All .enc files are auto-decrypted for manual inspection.
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { syncEngine, expandHome, buildFileEntries } from '../core/sync.js';
import { cryptoEngine }    from '../core/crypto.js';
import { jsonField }       from '../core/json-field.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import chalk               from 'chalk';
import type { AgentOptions, AgentName } from '../types.js';

export async function cmdDump({ agent }: AgentOptions = {}): Promise<void> {
  logger.banner(t('dump.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const keyPath  = expandHome(cfg.keyPath);
  const entries  = buildFileEntries(cfg, undefined, agent);

  // Create temp dir
  const dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wangchuan-dump-'));

  let count = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!fs.existsSync(entry.srcAbs)) {
      skipped++;
      continue;
    }

    const destPath = path.join(dumpDir, entry.plainRel);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    if (entry.jsonExtract) {
      try {
        const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
        const partial  = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
        fs.writeFileSync(destPath, JSON.stringify(partial, null, 2), 'utf-8');
      } catch (err) {
        logger.warn(t('dump.skipJson', { path: entry.srcAbs }));
        skipped++;
        continue;
      }
    } else {
      fs.copyFileSync(entry.srcAbs, destPath);
    }

    const labels: string[] = [];
    if (entry.encrypt)     labels.push(chalk.gray(t('dump.srcEncrypted')));
    if (entry.jsonExtract) labels.push(chalk.blue(t('dump.fieldExtraction')));

    console.log(`  ${chalk.green('✔')} ${entry.plainRel} ${labels.join('')}`);
    count++;
  }

  console.log();
  console.log(chalk.bold(`  ${t('dump.outputDir')}`) + chalk.cyan(dumpDir));
  console.log(
    chalk.bold(`  ${t('dump.fileCount')}`) +
    t('dump.files', { count }) +
    (skipped > 0 ? chalk.gray(` ${t('dump.skippedCount', { count: skipped })}`) : '')
  );
  console.log();
  console.log(chalk.gray(`  ${t('dump.warning')}`));
  console.log(chalk.gray(`  rm -rf ${dumpDir}`));
}
