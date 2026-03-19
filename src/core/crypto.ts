/**
 * crypto.ts — AES-256-GCM 加解密模块
 *
 * 密钥文件格式：32 字节随机数据，以十六进制字符串存储（64 chars）
 * 密文文件格式：IV(12B) | AuthTag(16B) | CipherText → Base64 写入 .enc 文件
 */

import crypto from 'crypto';
import fs     from 'fs';
import path   from 'path';
import { logger } from '../utils/logger.js';

const ALGO      = 'aes-256-gcm' as const;
const KEY_BYTES = 32;  // 256 bit
const IV_BYTES  = 12;  // 96 bit (GCM 推荐)
const TAG_BYTES = 16;  // 128 bit auth tag

/** 从文件加载并验证主密钥 */
function loadKey(keyPath: string): Buffer {
  if (!fs.existsSync(keyPath)) {
    throw new Error(`密钥文件不存在: ${keyPath}\n请先运行 wangchuan init 生成密钥。`);
  }
  const hex = fs.readFileSync(keyPath, 'utf-8').trim();
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(`密钥文件格式无效，期望 ${KEY_BYTES * 2} 个十六进制字符`);
  }
  return Buffer.from(hex, 'hex');
}

/** 加密 Buffer → Base64 字符串（格式：IV + AuthTag + CipherText） */
function encryptBuffer(plaintext: Buffer, key: Buffer): string {
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Base64 密文 → 原始 Buffer */
function decryptBuffer(b64: string, key: Buffer): Buffer {
  const data = Buffer.from(b64, 'base64');
  const iv   = data.subarray(0, IV_BYTES);
  const tag  = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const enc  = data.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export const cryptoEngine = {
  /**
   * 生成新主密钥并写入文件（mode 0o600）
   * 返回原始 32 字节 Buffer，供测试断言使用
   */
  generateKey(keyPath: string): Buffer {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const key = crypto.randomBytes(KEY_BYTES);
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600, encoding: 'utf-8' });
    logger.ok(`主密钥已生成: ${keyPath}`);
    return key;
  },

  /** 密钥文件是否存在 */
  hasKey(keyPath: string): boolean {
    return fs.existsSync(keyPath);
  },

  /** 加密源文件，密文写入 destPath（通常以 .enc 结尾） */
  encryptFile(srcPath: string, destPath: string, keyPath: string): void {
    const key       = loadKey(keyPath);
    const plaintext = fs.readFileSync(srcPath);
    const encrypted = encryptBuffer(plaintext, key);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, encrypted, 'utf-8');
    logger.debug(`已加密: ${srcPath} → ${destPath}`);
  },

  /** 解密 .enc 文件，明文写入 destPath */
  decryptFile(srcPath: string, destPath: string, keyPath: string): void {
    const key       = loadKey(keyPath);
    const encrypted = fs.readFileSync(srcPath, 'utf-8').trim();
    const plaintext = decryptBuffer(encrypted, key);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, plaintext);
    logger.debug(`已解密: ${srcPath} → ${destPath}`);
  },

  /** 加密任意字符串，返回 Base64 密文 */
  encryptString(plaintext: string, keyPath: string): string {
    const key = loadKey(keyPath);
    return encryptBuffer(Buffer.from(plaintext, 'utf-8'), key);
  },

  /** 解密 Base64 密文，返回原始字符串 */
  decryptString(b64: string, keyPath: string): string {
    const key = loadKey(keyPath);
    return decryptBuffer(b64, key).toString('utf-8');
  },
} as const;
