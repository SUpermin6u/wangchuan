/**
 * validator.ts — Common validation functions
 *
 * requireInit uses TypeScript asserts predicate to narrow cfg to non-null.
 * Must declare explicit interface (TS2775: assertion functions cannot be called through inferred const objects).
 */

import fs from 'fs';
import { t } from '../i18n.js';
import type { WangchuanConfig } from '../types.js';

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/,
  /api[_-]?key\s*[:=]\s*["'][^"']{8,}/i,
  /token\s*[:=]\s*["'][^"']{16,}/i,
  /password\s*[:=]\s*["'][^"']{6,}/i,
  /secret\s*[:=]\s*["'][^"']{16,}/i,
];

interface Validator {
  pathExists(p: string): boolean;
  isGitUrl(url: string): boolean;
  containsSensitiveData(content: string): boolean;
  requireInit(cfg: WangchuanConfig | null): asserts cfg is WangchuanConfig;
}

export const validator: Validator = {
  pathExists(p: string): boolean {
    return fs.existsSync(p);
  },

  isGitUrl(url: string): boolean {
    if (!url) return false;
    return /^(git@|https?:\/\/).+\.(git)?/.test(url.trim());
  },

  containsSensitiveData(content: string): boolean {
    return SENSITIVE_PATTERNS.some(re => re.test(content));
  },

  requireInit(cfg: WangchuanConfig | null): asserts cfg is WangchuanConfig {
    if (cfg === null) {
      throw new Error(t('validator.notInit'));
    }
  },
};
