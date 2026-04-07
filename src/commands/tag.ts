/**
 * tag.ts — wangchuan tag command
 *
 * Manage file tags for personal organization:
 *   wangchuan tag add <file-pattern> <tags...>
 *   wangchuan tag remove <file-pattern> <tags...>
 *   wangchuan tag list
 *   wangchuan tag find <tag>
 */

import { config }          from '../core/config.js';
import { ensureMigrated }  from '../core/migrate.js';
import { buildFileEntries } from '../core/sync.js';
import { tagsEngine }      from '../core/tags.js';
import { validator }       from '../utils/validator.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import chalk               from 'chalk';

export interface TagOptions {
  readonly action: string;
  readonly pattern: string | undefined;
  readonly tags: readonly string[];
}

export async function cmdTag(opts: TagOptions): Promise<void> {
  logger.banner(t('tag.banner'));

  switch (opts.action) {
    case 'add': {
      if (!opts.pattern || opts.tags.length === 0) {
        logger.error(t('tag.addUsage'));
        return;
      }
      let cfg = config.load();
      validator.requireInit(cfg);
      cfg = ensureMigrated(cfg);

      const entries = buildFileEntries(cfg);
      const repoRels = entries.map(e => e.repoRel);
      const matched = tagsEngine.addTags(repoRels, opts.pattern, opts.tags);

      if (matched.length === 0) {
        logger.warn(t('tag.noMatch', { pattern: opts.pattern }));
      } else {
        for (const rel of matched) {
          console.log(`  ${chalk.green('+')} ${chalk.white(rel)}  ${chalk.cyan(opts.tags.join(', '))}`);
        }
        logger.ok(t('tag.added', { count: matched.length, tags: opts.tags.join(', ') }));
      }
      break;
    }

    case 'remove': {
      if (!opts.pattern || opts.tags.length === 0) {
        logger.error(t('tag.removeUsage'));
        return;
      }
      const matched = tagsEngine.removeTags(opts.pattern, opts.tags);

      if (matched.length === 0) {
        logger.warn(t('tag.noMatch', { pattern: opts.pattern }));
      } else {
        for (const rel of matched) {
          console.log(`  ${chalk.red('-')} ${chalk.white(rel)}  ${chalk.gray(opts.tags.join(', '))}`);
        }
        logger.ok(t('tag.removed', { count: matched.length, tags: opts.tags.join(', ') }));
      }
      break;
    }

    case 'list': {
      const allTags = tagsEngine.listTags();
      const tagGroups = new Map<string, string[]>();

      for (const [rel, tags] of Object.entries(allTags)) {
        for (const tag of tags) {
          const group = tagGroups.get(tag) ?? [];
          group.push(rel);
          tagGroups.set(tag, group);
        }
      }

      if (tagGroups.size === 0) {
        logger.info(t('tag.empty'));
        return;
      }

      const sorted = [...tagGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [tag, files] of sorted) {
        console.log(`\n  ${chalk.bold.cyan(`#${tag}`)} ${chalk.gray(`(${files.length})`)}`);
        for (const f of files) {
          console.log(`    ${chalk.white(f)}`);
        }
      }
      console.log();
      logger.ok(t('tag.listSummary', { tags: tagGroups.size, files: Object.keys(allTags).length }));
      break;
    }

    case 'find': {
      if (!opts.pattern) {
        logger.error(t('tag.findUsage'));
        return;
      }
      const files = tagsEngine.findByTag(opts.pattern);
      if (files.length === 0) {
        logger.info(t('tag.findEmpty', { tag: opts.pattern }));
      } else {
        console.log(`\n  ${chalk.bold.cyan(`#${opts.pattern}`)} ${chalk.gray(`(${files.length})`)}`);
        for (const f of files) {
          console.log(`    ${chalk.white(f)}`);
        }
        console.log();
      }
      break;
    }

    default:
      logger.error(t('tag.unknownAction', { action: opts.action }));
  }
}
