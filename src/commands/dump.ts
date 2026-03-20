/**
 * dump.ts — wangchuan dump command / dump 命令
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
import chalk               from 'chalk';
import type { AgentOptions, AgentName } from '../types.js';

export async function cmdDump({ agent }: AgentOptions = {}): Promise<void> {
  logger.banner('Wangchuan · Dump / 忘川 · 明文快照');

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const keyPath  = expandHome(cfg.keyPath);
  const entries  = buildFileEntries(cfg, undefined, agent);

  // Create temp dir / 创建临时目录
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
        logger.warn(`Skipping JSON extraction (parse error) / 跳过 JSON 字段提取: ${entry.srcAbs}`);
        skipped++;
        continue;
      }
    } else {
      fs.copyFileSync(entry.srcAbs, destPath);
    }

    const labels: string[] = [];
    if (entry.encrypt)     labels.push(chalk.gray('[src encrypted/原文件加密]'));
    if (entry.jsonExtract) labels.push(chalk.blue('[field extraction/字段提取]'));

    console.log(`  ${chalk.green('✔')} ${entry.plainRel} ${labels.join('')}`);
    count++;
  }

  console.log();
  console.log(chalk.bold(`  Output dir / 输出目录：`) + chalk.cyan(dumpDir));
  console.log(chalk.bold(`  File count / 文件数量：`) + `${count} files/个文件` + (skipped > 0 ? chalk.gray(` (${skipped} skipped/个跳过)`) : ''));
  console.log();
  console.log(chalk.gray(`  Warning: this dir contains plaintext sensitive data, delete after inspection / 提示：含明文敏感信息，查看后请删除`));
  console.log(chalk.gray(`  rm -rf ${dumpDir}`));
}
