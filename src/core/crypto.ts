/**
 * crypto.ts — AES-256-GCM encryption/decryption module
 *
 * Key file format: "wangchuan_" prefix + 64 hex chars (legacy: plain 64 hex chars also supported)
 * Ciphertext format: IV(12B) | AuthTag(16B) | CipherText → Base64 written to .enc file
 */

import crypto from 'crypto';
import fs     from 'fs';
import path   from 'path';
import { logger } from '../utils/logger.js';

const ALGO      = 'aes-256-gcm' as const;
const KEY_BYTES = 32;  // 256 bit
const IV_BYTES  = 12;  // 96 bit (GCM recommended)
const TAG_BYTES = 16;  // 128 bit auth tag
const KEY_PREFIX = 'wangchuan_';

/** In-memory key cache to eliminate redundant disk reads during batch sync operations */
let cachedKey: { readonly path: string; readonly key: Buffer } | undefined;

/** Load and validate the master key from file (cached per path) */
function loadKey(keyPath: string): Buffer {
  if (cachedKey && cachedKey.path === keyPath) return cachedKey.key;
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Key file not found: ${keyPath}\nPlease run wangchuan init to generate a key.`);
  }
  const raw = fs.readFileSync(keyPath, 'utf-8').trim();
  // Support both new format (wangchuan_hex) and legacy format (plain hex)
  const hex = raw.startsWith(KEY_PREFIX) ? raw.slice(KEY_PREFIX.length) : raw;
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(`Invalid key file format, expected ${KEY_BYTES * 2} hex characters`);
  }
  const key = Buffer.from(hex, 'hex');
  cachedKey = { path: keyPath, key };
  return key;
}

/** Invalidate the key cache (required after key rotation) */
export function clearKeyCache(): void { cachedKey = undefined; }

/** Compute SHA-256 fingerprint of the master key (for cross-machine validation) */
export function keyFingerprint(keyPath: string): string {
  const key = loadKey(keyPath);
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Encrypt Buffer → Base64 string (format: IV + AuthTag + CipherText) */
function encryptBuffer(plaintext: Buffer, key: Buffer): string {
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Base64 ciphertext → original Buffer */
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
   * Generate a new master key and write to file (mode 0o600).
   * Returns the raw 32-byte Buffer for test assertions.
   */
  generateKey(keyPath: string): Buffer {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const key = crypto.randomBytes(KEY_BYTES);
    fs.writeFileSync(keyPath, KEY_PREFIX + key.toString('hex'), { mode: 0o600, encoding: 'utf-8' });
    logger.ok(`Master key generated: ${keyPath}`);
    return key;
  },

  /** Check if key file exists */
  hasKey(keyPath: string): boolean {
    return fs.existsSync(keyPath);
  },

  /** Encrypt source file, write ciphertext to destPath (typically ending in .enc) */
  encryptFile(srcPath: string, destPath: string, keyPath: string): void {
    const key       = loadKey(keyPath);
    const plaintext = fs.readFileSync(srcPath);
    const encrypted = encryptBuffer(plaintext, key);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, encrypted, 'utf-8');
    logger.debug(`Encrypted: ${srcPath} → ${destPath}`);
  },

  /** Decrypt .enc file, write plaintext to destPath */
  decryptFile(srcPath: string, destPath: string, keyPath: string): void {
    const key       = loadKey(keyPath);
    const encrypted = fs.readFileSync(srcPath, 'utf-8').trim();
    const plaintext = decryptBuffer(encrypted, key);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, plaintext);
    logger.debug(`Decrypted: ${srcPath} → ${destPath}`);
  },

  /** Encrypt an arbitrary string, return Base64 ciphertext */
  encryptString(plaintext: string, keyPath: string): string {
    const key = loadKey(keyPath);
    return encryptBuffer(Buffer.from(plaintext, 'utf-8'), key);
  },

  /** Decrypt Base64 ciphertext, return original string */
  decryptString(b64: string, keyPath: string): string {
    const key = loadKey(keyPath);
    return decryptBuffer(b64, key).toString('utf-8');
  },
} as const;
