/**
 * tags.ts — Memory tagging system
 *
 * Stores per-file tags locally at ~/.wangchuan/tags.json.
 * Tags are personal organization metadata and are not synced to the repo.
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';

const TAGS_PATH = path.join(os.homedir(), '.wangchuan', 'tags.json');

/** repoRel → tags array */
export type Tags = Record<string, string[]>;

function loadTags(): Tags {
  if (!fs.existsSync(TAGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(TAGS_PATH, 'utf-8')) as Tags;
  } catch {
    return {};
  }
}

function saveTags(tags: Tags): void {
  fs.mkdirSync(path.dirname(TAGS_PATH), { recursive: true });
  // Prune empty arrays before writing
  const cleaned: Tags = {};
  for (const [k, v] of Object.entries(tags)) {
    if (v.length > 0) cleaned[k] = v;
  }
  fs.writeFileSync(TAGS_PATH, JSON.stringify(cleaned, null, 2), 'utf-8');
}

/**
 * Check if a repoRel matches a glob-like pattern.
 * Supports `*` (any non-slash chars) and `**` (any path segments).
 * Plain substrings without wildcards use substring match.
 */
function matchPattern(repoRel: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return repoRel.includes(pattern);
  }
  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        regex += '(?:.+/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
    } else if (pattern[i] === '*') {
      regex += '[^/]*';
      i++;
    } else {
      regex += pattern[i]!.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  regex += '$';
  return new RegExp(regex).test(repoRel);
}

export const tagsEngine = {
  /** Add tags to all files matching the pattern */
  addTags(repoRels: readonly string[], pattern: string, newTags: readonly string[]): string[] {
    const tags = loadTags();
    const matched: string[] = [];
    for (const rel of repoRels) {
      if (!matchPattern(rel, pattern)) continue;
      matched.push(rel);
      const existing = tags[rel] ?? [];
      const merged = [...new Set([...existing, ...newTags])];
      tags[rel] = merged;
    }
    saveTags(tags);
    return matched;
  },

  /** Remove tags from all files matching the pattern */
  removeTags(pattern: string, tagsToRemove: readonly string[]): string[] {
    const tags = loadTags();
    const removeSet = new Set(tagsToRemove);
    const matched: string[] = [];
    for (const [rel, existing] of Object.entries(tags)) {
      if (!matchPattern(rel, pattern)) continue;
      const filtered = existing.filter(t => !removeSet.has(t));
      if (filtered.length !== existing.length) {
        matched.push(rel);
        tags[rel] = filtered;
      }
    }
    saveTags(tags);
    return matched;
  },

  /** List all tags, returns the full Tags map */
  listTags(): Tags {
    return loadTags();
  },

  /** Find all files with a specific tag */
  findByTag(tag: string): string[] {
    const tags = loadTags();
    return Object.entries(tags)
      .filter(([, v]) => v.includes(tag))
      .map(([k]) => k);
  },
} as const;
