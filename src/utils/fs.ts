/**
 * fs.ts — Shared filesystem utilities
 *
 * Consolidates walkDir and copyDirSync implementations previously
 * duplicated across sync.ts, doctor.ts, key.ts, snapshot.ts, migrate.ts.
 */

import fs   from 'fs';
import path from 'path';

/**
 * Recursively list all file paths under a directory.
 * Returns paths relative to dirAbs.
 * @param filter Optional predicate to exclude relative paths (return false to skip)
 */
export function walkDir(dirAbs: string, filter?: (relPath: string) => boolean): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dirAbs)) return results;
  function walk(subPath: string): void {
    const full = path.join(dirAbs, subPath);
    if (fs.statSync(full).isDirectory()) {
      fs.readdirSync(full).forEach(f => walk(path.join(subPath, f)));
    } else {
      if (filter && !filter(subPath)) return;
      results.push(subPath);
    }
  }
  fs.readdirSync(dirAbs).forEach(f => walk(f));
  return results;
}

/**
 * Recursively copy a directory. Returns the number of files copied.
 * @param skipNames Optional set of entry names to skip (e.g. '.git')
 */
export function copyDirSync(src: string, dest: string, skipNames?: ReadonlySet<string>): number {
  let count = 0;
  if (!fs.existsSync(src)) return count;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames?.has(entry.name)) continue;
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDirSync(srcPath, destPath, skipNames);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}
