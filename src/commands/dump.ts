/**
 * dump.ts — wangchuan dump 命令
 *
 * 在临时目录生成与 repo 完全同构的明文快照，
 * 所有 .enc 加密文件自动解密，方便人工检查同步内容。
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
  logger.banner('忘川 · 明文快照');

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  const keyPath  = expandHome(cfg.keyPath);
  const entries  = buildFileEntries(cfg, undefined, agent);

  // 创建临时目录
  const dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wangchuan-dump-'));

  let count = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!fs.existsSync(entry.srcAbs)) {
      skipped++;
      continue;
    }

    // 输出路径：用 plainRel（不带 .enc 后缀）
    const destPath = path.join(dumpDir, entry.plainRel);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    if (entry.jsonExtract) {
      // JSON 字段提取 → 写入提取后的 JSON
      try {
        const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
        const partial  = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
        fs.writeFileSync(destPath, JSON.stringify(partial, null, 2), 'utf-8');
      } catch (err) {
        logger.warn(`跳过 JSON 字段提取（解析失败）: ${entry.srcAbs}`);
        skipped++;
        continue;
      }
    } else {
      // 整文件 → 直接复制明文
      fs.copyFileSync(entry.srcAbs, destPath);
    }

    const labels: string[] = [];
    if (entry.encrypt)     labels.push(chalk.gray('[原文件加密]'));
    if (entry.jsonExtract) labels.push(chalk.blue('[字段提取]'));

    console.log(`  ${chalk.green('✔')} ${entry.plainRel} ${labels.join('')}`);
    count++;
  }

  console.log();
  console.log(chalk.bold(`  输出目录：`) + chalk.cyan(dumpDir));
  console.log(chalk.bold(`  文件数量：`) + `${count} 个文件` + (skipped > 0 ? chalk.gray(` (${skipped} 个跳过)`) : ''));
  console.log();
  console.log(chalk.gray(`  提示：该目录包含明文敏感信息，查看后请及时删除`));
  console.log(chalk.gray(`  rm -rf ${dumpDir}`));
}
