/**
 * search.ts — wangchuan search command
 *
 * Search across all synced (non-encrypted) text files for a query string or regex.
 * Shows file path, line number, and matching line with context.
 */

import fs   from 'fs';
import path from 'path';
import { config }         from '../core/config.js';
import { ensureMigrated } from '../core/migrate.js';
import { syncEngine, buildFileEntries } from '../core/sync.js';
import { validator }      from '../utils/validator.js';
import { logger }         from '../utils/logger.js';
import { t }              from '../i18n.js';
import chalk              from 'chalk';
import type { AgentName } from '../types.js';

export interface SearchOptions {
  readonly query: string;
  readonly agent?: AgentName | undefined;
  readonly ignoreCase?: boolean | undefined;
  readonly regex?: boolean | undefined;
  readonly context?: number | undefined;
}

interface SearchHit {
  readonly file: string;
  readonly lineNo: number;
  readonly line: string;
  readonly contextBefore: readonly string[];
  readonly contextAfter: readonly string[];
}

/**
 * Build a matcher function from the query string.
 * Returns both a test function and a highlighter.
 */
function buildMatcher(
  query: string,
  useRegex: boolean,
  ignoreCase: boolean,
): { test: (line: string) => boolean; highlight: (line: string) => string } {
  const flags = ignoreCase ? 'gi' : 'g';
  const re = useRegex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

  return {
    test: (line: string) => {
      re.lastIndex = 0;
      return re.test(line);
    },
    highlight: (line: string) => {
      re.lastIndex = 0;
      return line.replace(re, (m) => chalk.yellow(m));
    },
  };
}

/**
 * Search a single file and collect hits with context lines.
 */
function searchFile(
  filePath: string,
  matcher: ReturnType<typeof buildMatcher>,
  contextLines: number,
): SearchHit[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  // Skip binary files (heuristic: check for null bytes in first 512 bytes)
  const sample = content.slice(0, 512);
  if (sample.includes('\0')) return [];

  const lines = content.split('\n');
  const hits: SearchHit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!matcher.test(line)) continue;

    const start = Math.max(0, i - contextLines);
    const end   = Math.min(lines.length - 1, i + contextLines);
    hits.push({
      file:          filePath,
      lineNo:        i + 1,
      line,
      contextBefore: lines.slice(start, i),
      contextAfter:  lines.slice(i + 1, end + 1),
    });
  }
  return hits;
}

export async function cmdSearch(opts: SearchOptions): Promise<void> {
  logger.banner(t('search.banner'));

  let cfg = config.load();
  validator.requireInit(cfg);
  cfg = ensureMigrated(cfg);

  if (opts.agent) {
    console.log(chalk.bold(`  ${t('search.filterAgent', { agent: opts.agent })}`));
  }

  const contextLines = opts.context ?? 2;
  const matcher = buildMatcher(opts.query, opts.regex ?? false, opts.ignoreCase ?? false);

  // Collect all non-encrypted file entries
  const entries = buildFileEntries(cfg, undefined, opts.agent);
  const searchableFiles = new Set<string>();

  for (const entry of entries) {
    if (entry.encrypt) continue;
    if (entry.jsonExtract) continue; // Skip JSON field entries (partial extraction)
    if (fs.existsSync(entry.srcAbs)) {
      searchableFiles.add(entry.srcAbs);
    }
  }

  console.log(chalk.gray(`  ${t('search.searching', { count: searchableFiles.size })}`));
  console.log();

  let totalHits = 0;
  let totalFiles = 0;

  for (const filePath of searchableFiles) {
    const hits = searchFile(filePath, matcher, contextLines);
    if (hits.length === 0) continue;

    totalFiles++;
    totalHits += hits.length;

    // Show file header
    console.log(chalk.bold.cyan(`  ${filePath}`));

    for (const hit of hits) {
      // Context before
      for (let j = 0; j < hit.contextBefore.length; j++) {
        const ln = hit.lineNo - hit.contextBefore.length + j;
        console.log(chalk.gray(`    ${String(ln).padStart(4)}  ${hit.contextBefore[j]}`));
      }
      // Matching line (highlighted)
      console.log(`    ${chalk.white(String(hit.lineNo).padStart(4))}  ${matcher.highlight(hit.line)}`);
      // Context after
      for (let j = 0; j < hit.contextAfter.length; j++) {
        const ln = hit.lineNo + 1 + j;
        console.log(chalk.gray(`    ${String(ln).padStart(4)}  ${hit.contextAfter[j]}`));
      }
      console.log();
    }
  }

  // Summary
  if (totalHits === 0) {
    logger.info(t('search.noResults', { query: opts.query }));
  } else {
    logger.ok(t('search.summary', { hits: totalHits, files: totalFiles }));
  }
}
