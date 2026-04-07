/**
 * crypto.test.ts — AES-256-GCM encryption module unit tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'fs';
import os     from 'os';
import path   from 'path';
import { cryptoEngine } from '../src/core/crypto.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-test-'));
const KEY = path.join(TMP, 'master.key');

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('cryptoEngine.generateKey', () => {
  it('generates a 64-char hex key file', () => {
    cryptoEngine.generateKey(KEY);
    const hex = fs.readFileSync(KEY, 'utf-8').trim();
    assert.equal(hex.length, 64);
    assert.match(hex, /^[0-9a-f]+$/);
  });

  it('file permissions are 0o600', () => {
    if (process.platform !== 'win32') {
      const stat = fs.statSync(KEY);
      assert.equal((stat.mode & 0o777).toString(8), '600');
    }
  });
});

describe('cryptoEngine.hasKey', () => {
  it('returns true when key exists',  () => assert.equal(cryptoEngine.hasKey(KEY), true));
  it('returns false when key missing', () => assert.equal(cryptoEngine.hasKey(`${KEY}.nope`), false));
});

describe('cryptoEngine.encryptString / decryptString', () => {
  const cases: string[] = [
    '普通 ASCII text',
    '中文内容：忘川永不遗忘',
    '{"api_key":"sk-test-1234","model":"claude-3"}',
    'A'.repeat(10_000),
    '',
  ];

  for (const plain of cases) {
    it(`round-trip: "${plain.slice(0, 40)}"`, () => {
      const enc = cryptoEngine.encryptString(plain, KEY);
      assert.ok(typeof enc === 'string' && enc.length > 0);
      const dec = cryptoEngine.decryptString(enc, KEY);
      assert.equal(dec, plain);
    });
  }

  it('same plaintext encrypted twice yields different ciphertext (random IV)', () => {
    const a = cryptoEngine.encryptString('hello', KEY);
    const b = cryptoEngine.encryptString('hello', KEY);
    assert.notEqual(a, b);
  });

  it('tampered ciphertext throws error (GCM AuthTag verification)', () => {
    const enc  = cryptoEngine.encryptString('sensitive', KEY);
    const buf  = Buffer.from(enc, 'base64');
    const last = buf[buf.length - 1];
    assert.ok(last !== undefined, 'ciphertext should not be empty');
    buf[buf.length - 1] = last ^ 0xff;
    const tampered = buf.toString('base64');
    assert.throws(() => cryptoEngine.decryptString(tampered, KEY));
  });
});

describe('cryptoEngine.encryptFile / decryptFile', () => {
  const PLAIN_FILE = path.join(TMP, 'plain.txt');
  const ENC_FILE   = path.join(TMP, 'plain.txt.enc');
  const DEC_FILE   = path.join(TMP, 'plain.dec.txt');
  const CONTENT    = '敏感配置\nAPI_KEY=sk-xxxxx\n用户信息';

  before(() => {
    fs.writeFileSync(PLAIN_FILE, CONTENT, 'utf-8');
  });

  it('encrypted file does not contain plaintext', () => {
    cryptoEngine.encryptFile(PLAIN_FILE, ENC_FILE, KEY);
    const raw = fs.readFileSync(ENC_FILE, 'utf-8');
    assert.ok(!raw.includes('敏感配置'));
    assert.ok(!raw.includes('sk-xxxxx'));
  });

  it('decrypted content matches original', () => {
    cryptoEngine.decryptFile(ENC_FILE, DEC_FILE, KEY);
    assert.equal(fs.readFileSync(DEC_FILE, 'utf-8'), CONTENT);
  });
});

describe('cryptoEngine error paths', () => {
  it('throws friendly error when key file missing', () => {
    assert.throws(
      () => cryptoEngine.encryptString('x', '/tmp/nonexistent.key'),
      /Key file not found/
    );
  });

  it('throws error on invalid key format', () => {
    const badKey = path.join(TMP, 'bad.key');
    fs.writeFileSync(badKey, 'tooshort', 'utf-8');
    assert.throws(
      () => cryptoEngine.encryptString('x', badKey),
      /Invalid key file format/
    );
  });
});
