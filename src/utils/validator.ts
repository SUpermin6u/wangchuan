/**
 * validator.ts — 通用校验函数
 *
 * requireInit 使用 TypeScript asserts 类型谓词，调用后编译器收窄 cfg 为非 null。
 * 必须声明显式接口（TS2775：assertion 函数不能通过推断的 const 对象调用）。
 */

import fs from 'fs';
import type { WangchuanConfig } from '../types.js';

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/,
  /api[_-]?key\s*[:=]\s*["']?\S+/i,
  /token\s*[:=]\s*["']?\S{16,}/i,
  /password\s*[:=]\s*["']?\S+/i,
  /secret\s*[:=]\s*["']?\S+/i,
];

/** 显式接口确保 asserts 签名可被编译器识别 */
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
      throw new Error('忘川尚未初始化，请先运行: wangchuan init --repo <仓库地址>');
    }
  },
};
