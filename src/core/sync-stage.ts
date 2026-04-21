/**
 * sync-stage.ts — Push direction: workspace → local repo directory
 *
 * Handles file staging, encryption change detection, integrity checksums,
 * key fingerprint validation, sync metadata, and stale file detection.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import crypto from 'crypto';
import { cryptoEngine } from './crypto.js';
import { keyFingerprint } from './crypto.js';
import { jsonField }    from './json-field.js';
import { validator }    from '../utils/validator.js';
import { logger }       from '../utils/logger.js';
import { walkDir as walkDirRaw } from '../utils/fs.js';
import { t }            from '../i18n.js';
import chalk            from 'chalk';
import { expandHome, buildFileEntries } from './sync.js';
import { distributeShared, savePendingDeletions } from './sync-shared.js';
import type {
  WangchuanConfig,
  FileEntry,
  StageResult,
  AgentName,
  FilterOptions,
} from '../types.js';

// ── Sync metadata ──────────────────────────────────────────────────

export interface SyncMeta {
  readonly lastSyncAt: string;
  readonly hostname: string;
  readonly environment: string;
}

const SYNC_META_FILE = 'sync-meta.json';

export function writeSyncMeta(repoPath: string, cfg: WangchuanConfig): void {
  const meta: SyncMeta = {
    lastSyncAt:  new Date().toISOString(),
    hostname:    cfg.hostname || os.hostname(),
    environment: cfg.environment ?? 'default',
  };
  fs.writeFileSync(
    path.join(repoPath, SYNC_META_FILE),
    JSON.stringify(meta, null, 2),
    'utf-8',
  );
}

export function readSyncMeta(repoPath: string): SyncMeta | null {
  const metaPath = path.join(repoPath, SYNC_META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SyncMeta;
  } catch {
    return null;
  }
}

// ── Integrity checksum ─────────────────────────────────────────────

const INTEGRITY_FILE = 'integrity.json';

export interface IntegrityManifest {
  readonly generatedAt: string;
  readonly checksums: Record<string, string>;
  readonly plaintextHashes?: Record<string, string>;
}

/** Compute SHA-256 hash of a file */
function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Write integrity.json to repo root after staging */
export function writeIntegrity(
  repoPath: string,
  syncedFiles: readonly string[],
  plaintextHashes?: ReadonlyMap<string, string>,
): void {
  const checksums: Record<string, string> = {};
  for (const repoRel of syncedFiles) {
    const absPath = path.join(repoPath, repoRel);
    if (fs.existsSync(absPath)) {
      checksums[repoRel] = sha256File(absPath);
    }
  }
  const manifest: IntegrityManifest = {
    generatedAt: new Date().toISOString(),
    checksums,
    ...(plaintextHashes && plaintextHashes.size > 0
      ? { plaintextHashes: Object.fromEntries(plaintextHashes) }
      : {}),
  };
  fs.writeFileSync(
    path.join(repoPath, INTEGRITY_FILE),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
  logger.debug(t('integrity.writing'));
}

/** Verify integrity.json checksums against repo files, return mismatched file list */
export function verifyIntegrity(repoPath: string): string[] {
  const manifestPath = path.join(repoPath, INTEGRITY_FILE);
  if (!fs.existsSync(manifestPath)) {
    logger.debug(t('integrity.missingChecksum'));
    return [];
  }
  let manifest: IntegrityManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as IntegrityManifest;
  } catch {
    return [];
  }

  const mismatched: string[] = [];
  for (const [repoRel, expectedHash] of Object.entries(manifest.checksums)) {
    const absPath = path.join(repoPath, repoRel);
    if (!fs.existsSync(absPath)) continue;
    const actualHash = sha256File(absPath);
    if (actualHash !== expectedHash) {
      mismatched.push(repoRel);
      logger.warn(t('integrity.mismatch', { file: repoRel }));
    }
  }
  if (mismatched.length === 0) {
    const count = Object.keys(manifest.checksums).length;
    logger.debug(t('integrity.verified', { count }));
  } else {
    logger.warn(t('integrity.mismatchCount', { count: mismatched.length }));
  }
  return mismatched;
}

/** Read stored plaintext hashes from integrity.json (for fast change detection) */
export function readPlaintextHashes(repoPath: string): Map<string, string> {
  const manifestPath = path.join(repoPath, INTEGRITY_FILE);
  if (!fs.existsSync(manifestPath)) return new Map();
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as IntegrityManifest;
    return new Map(Object.entries(manifest.plaintextHashes ?? {}));
  } catch {
    return new Map();
  }
}

// ── Key fingerprint validation ─────────────────────────────────────

const KEY_FINGERPRINT_FILE = 'key-fingerprint.json';

interface KeyFingerprintManifest {
  readonly fingerprint: string;
  readonly updatedAt: string;
}

/** Write the local key's SHA-256 fingerprint to the repo */
export function writeKeyFingerprint(repoPath: string, keyPath: string): void {
  const fp = keyFingerprint(keyPath);
  const manifest: KeyFingerprintManifest = {
    fingerprint: fp,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(repoPath, KEY_FINGERPRINT_FILE),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
}

/** Verify the local key matches the fingerprint stored in the repo */
export function verifyKeyFingerprint(repoPath: string, keyPath: string): void {
  const fpPath = path.join(repoPath, KEY_FINGERPRINT_FILE);
  if (!fs.existsSync(fpPath)) {
    logger.debug(t('keyFingerprint.notFound'));
    return;
  }
  let manifest: KeyFingerprintManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(fpPath, 'utf-8')) as KeyFingerprintManifest;
  } catch {
    return;
  }
  const localFp = keyFingerprint(keyPath);
  if (localFp !== manifest.fingerprint) {
    throw new Error(t('keyFingerprint.mismatchWithHint'));
  }
  logger.debug(t('keyFingerprint.verified'));
}

// ── Stale file detection ───────────────────────────────────────────

/**
 * Detect stale files in repo (present in repo but absent from current entries).
 * Returns the list of stale repoRel paths WITHOUT deleting them.
 */
export function detectStaleFiles(repoPath: string, entries: FileEntry[]): string[] {
  const activeRepoRels = new Set(entries.map(e => e.repoRel));
  const stale: string[] = [];

  for (const topDir of ['agents', 'shared']) {
    const scanRoot = path.join(repoPath, topDir);
    if (!fs.existsSync(scanRoot)) continue;

    for (const relFile of walkDirRaw(scanRoot)) {
      const repoRel = path.join(topDir, relFile);
      if (!activeRepoRels.has(repoRel)) {
        stale.push(repoRel);
      }
    }
  }
  return stale;
}

/**
 * Actually delete stale files from repo (after user confirmation).
 */
export function deleteStaleFiles(repoPath: string, staleFiles: string[]): void {
  for (const repoRel of staleFiles) {
    const abs = path.join(repoPath, repoRel);
    if (!fs.existsSync(abs)) continue;
    fs.unlinkSync(abs);
    logger.debug(`  ${t('sync.pruneStale', { file: repoRel })}`);

    const topDir = repoRel.split(path.sep)[0]!;
    const scanRoot = path.join(repoPath, topDir);
    let dir = path.dirname(abs);
    while (dir !== scanRoot && dir.startsWith(scanRoot)) {
      const remaining = fs.readdirSync(dir);
      if (remaining.length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    }
  }
}

// ── Progress display ───────────────────────────────────────────────

/** Log a colorized progress line for stage/restore operations */
export function logProgress(
  index: number,
  total: number,
  tag: 'enc' | 'field' | 'decrypted' | 'copy',
  filePath: string,
): void {
  const counter = chalk.gray(`[${index}/${total}]`);
  const tagColors: Record<string, string> = {
    enc:       chalk.magenta(t('sync.progress.enc')),
    field:     chalk.yellow(t('sync.progress.field')),
    decrypted: chalk.cyan(t('sync.progress.decrypted')),
    copy:      chalk.white(t('sync.progress.copy')),
  };
  const coloredTag = tagColors[tag] ?? tag;
  logger.info(`  ${counter} ${coloredTag} ${chalk.white(filePath)}`);
}

// ── Change detection ───────────────────────────────────────────────

/** Check if a file's content matches a buffer (byte-equal for <64KB, SHA-256 for larger) */
export function contentUnchanged(existingPath: string, newContent: Buffer): boolean {
  if (!fs.existsSync(existingPath)) return false;
  const existingBuf = fs.readFileSync(existingPath);
  if (existingBuf.length !== newContent.length) return false;
  if (newContent.length < 65536) return existingBuf.equals(newContent);
  const h1 = crypto.createHash('sha256').update(existingBuf).digest('hex');
  const h2 = crypto.createHash('sha256').update(newContent).digest('hex');
  return h1 === h2;
}

/**
 * Check if an encrypted file's plaintext matches new plaintext content.
 * Uses stored plaintext hashes for fast comparison (no decryption needed).
 * Falls back to decrypt-compare when hashes are unavailable (backward compat).
 */
export function encryptedPlaintextUnchanged(
  existingEncPath: string,
  newPlaintext: Buffer,
  keyPath: string,
  repoRel?: string,
  storedHashes?: ReadonlyMap<string, string>,
): boolean {
  // Fast path: hash-based comparison (no decryption needed)
  if (repoRel && storedHashes) {
    const storedHash = storedHashes.get(repoRel);
    if (storedHash) {
      const newHash = crypto.createHash('sha256').update(newPlaintext).digest('hex');
      return newHash === storedHash;
    }
  }
  // Fallback: decrypt-compare (backward compat for repos without plaintextHashes)
  if (!fs.existsSync(existingEncPath)) return false;
  try {
    const existingEnc = fs.readFileSync(existingEncPath, 'utf-8').trim();
    const existingPlain = cryptoEngine.decryptString(existingEnc, keyPath);
    return Buffer.from(existingPlain, 'utf-8').equals(newPlaintext);
  } catch {
    return false;
  }
}

// ── Stage progress (crash recovery) ────────────────────────────────

const STAGE_PROGRESS_PATH = path.join(os.homedir(), '.wangchuan', 'stage-progress.json');

interface StageProgress {
  readonly startedAt: string;
  readonly completedRels: string[];
}

/** Load stage progress from previous interrupted push */
export function loadStageProgress(): Set<string> {
  if (!fs.existsSync(STAGE_PROGRESS_PATH)) return new Set();
  try {
    const prog = JSON.parse(fs.readFileSync(STAGE_PROGRESS_PATH, 'utf-8')) as StageProgress;
    return new Set(prog.completedRels);
  } catch {
    return new Set();
  }
}

/** Append a successfully staged file to the progress marker */
function appendStageProgress(repoRel: string): void {
  let prog: StageProgress;
  try {
    prog = JSON.parse(fs.readFileSync(STAGE_PROGRESS_PATH, 'utf-8')) as StageProgress;
  } catch {
    prog = { startedAt: new Date().toISOString(), completedRels: [] };
  }
  (prog.completedRels as string[]).push(repoRel);
  fs.mkdirSync(path.dirname(STAGE_PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(STAGE_PROGRESS_PATH, JSON.stringify(prog), 'utf-8');
}

/** Clear stage progress on successful completion */
export function clearStageProgress(): void {
  if (fs.existsSync(STAGE_PROGRESS_PATH)) fs.unlinkSync(STAGE_PROGRESS_PATH);
}

// ── Main push function ─────────────────────────────────────────────

/**
 * Push: distribute shared content to all agents, then collect files to repo.
 */
export async function stageToRepo(
  cfg: WangchuanConfig,
  agent?: AgentName | string,
  filter?: FilterOptions,
  yes?: boolean,
  skipShared?: boolean,
  skipStaleDetection?: boolean,
): Promise<StageResult> {
  // Distribute shared resources to all agents before full push
  // Skip in watch mode — shared changes are deferred for interactive confirmation
  if (!agent && !skipShared) {
    distributeShared(cfg);
  }
  const repoPath = expandHome(cfg.localRepoPath);
  const keyPath  = expandHome(cfg.keyPath);

  // Verify key fingerprint before pushing
  verifyKeyFingerprint(repoPath, keyPath);
  const entries  = buildFileEntries(cfg, undefined, agent, filter);
  const result: StageResult = { synced: [], skipped: [], encrypted: [], deleted: [], unchanged: [] };
  let progressIdx = 0;
  const totalEntries = entries.length;

  // Load stored plaintext hashes for fast encrypted change detection
  const storedHashes = readPlaintextHashes(repoPath);
  const plaintextHashMap = new Map<string, string>();

  // Load stage progress for crash recovery
  const previousProgress = loadStageProgress();
  if (previousProgress.size > 0) {
    logger.info(t('sync.resuming', { count: previousProgress.size }));
  }

  for (const entry of entries) {
    // Skip files already staged in a previous interrupted push
    if (previousProgress.has(entry.repoRel)) {
      (result.synced as string[]).push(entry.repoRel);
      logger.debug(t('sync.resumeSkip', { file: entry.repoRel }));
      continue;
    }

    if (!fs.existsSync(entry.srcAbs)) {
      logger.debug(t('sync.skipNotFound', { path: entry.srcAbs }));
      (result.skipped as string[]).push(entry.srcAbs);
      continue;
    }

    const destAbs = path.join(repoPath, entry.repoRel);
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });

    // ── JSON field-level extraction ────────────────────────────
    if (entry.jsonExtract) {
      try {
        const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
        const partial  = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
        const content  = JSON.stringify(partial, null, 2);

        if (entry.encrypt) {
          const contentBuf = Buffer.from(content, 'utf-8');
          if (encryptedPlaintextUnchanged(destAbs, contentBuf, keyPath, entry.repoRel, storedHashes)) {
            (result.unchanged as string[]).push(entry.repoRel);
            continue;
          }
          const encrypted = cryptoEngine.encryptString(content, keyPath);
          fs.writeFileSync(destAbs, encrypted, 'utf-8');
          (result.encrypted as string[]).push(entry.repoRel);
          // Store plaintext hash
          plaintextHashMap.set(entry.repoRel, crypto.createHash('sha256').update(contentBuf).digest('hex'));
        } else {
          const newBuf = Buffer.from(content, 'utf-8');
          if (contentUnchanged(destAbs, newBuf)) {
            (result.unchanged as string[]).push(entry.repoRel);
            continue;
          }
          fs.writeFileSync(destAbs, content, 'utf-8');
        }
        (result.synced as string[]).push(entry.repoRel);
        progressIdx++;
        logProgress(progressIdx, totalEntries, 'field', entry.repoRel);
        appendStageProgress(entry.repoRel);
      } catch (err) {
        logger.warn(t('sync.skipJsonParse', { path: entry.srcAbs, error: (err as Error).message }));
        (result.skipped as string[]).push(entry.repoRel);
      }
      continue;
    }

    // ── Whole-file sync ────────────────────────────────────────
    if (!entry.encrypt) {
      const srcBuf = fs.readFileSync(entry.srcAbs);
      if (contentUnchanged(destAbs, srcBuf)) {
        (result.unchanged as string[]).push(entry.repoRel);
        continue;
      }
      const content = srcBuf.toString('utf-8');
      if (validator.containsSensitiveData(content)) {
        logger.warn(`  ${t('sync.sensitiveData', { path: entry.srcAbs })}`);
        logger.warn(`   ${t('sync.suggestEncrypt')}`);
        (result.skipped as string[]).push(entry.repoRel);
        continue;
      }
    }
    if (entry.encrypt) {
      const srcBuf = fs.readFileSync(entry.srcAbs);
      if (encryptedPlaintextUnchanged(destAbs, srcBuf, keyPath, entry.repoRel, storedHashes)) {
        (result.unchanged as string[]).push(entry.repoRel);
        continue;
      }
      cryptoEngine.encryptFile(entry.srcAbs, destAbs, keyPath);
      (result.encrypted as string[]).push(entry.repoRel);
      // Store plaintext hash
      plaintextHashMap.set(entry.repoRel, crypto.createHash('sha256').update(srcBuf).digest('hex'));
      progressIdx++;
      logProgress(progressIdx, totalEntries, 'enc', entry.repoRel);
    } else {
      fs.copyFileSync(entry.srcAbs, destAbs);
      progressIdx++;
      logProgress(progressIdx, totalEntries, 'copy', entry.repoRel);
    }
    (result.synced as string[]).push(entry.repoRel);
    appendStageProgress(entry.repoRel);
  }

  // ── Detect stale files in repo (full push only, skip when filtering or explicitly disabled) ──
  if (!agent && !filter && !skipStaleDetection) {
    const syncedEntries = entries.filter(e => fs.existsSync(e.srcAbs));
    const stale = detectStaleFiles(repoPath, syncedEntries);
    if (stale.length > 0) {
      const isTTY = process.stdin.isTTY === true;
      if (isTTY || yes) {
        logger.warn(t('sync.pendingDeletions', { count: stale.length }));
        for (const f of stale) logger.warn(`  ${t('sync.pruneCandidate', { file: f })}`);

        let answer = 'y';
        if (!yes) {
          const rl = await import('readline');
          const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
          answer = await new Promise<string>(resolve => {
            iface.question(t('sync.confirmDelete'), (ans: string) => { iface.close(); resolve(ans.trim().toLowerCase()); });
          });
        }

        if (answer === 'y' || answer === 'yes' || answer === '') {
          deleteStaleFiles(repoPath, stale);
          (result.deleted as string[]).push(...stale);
        } else {
          logger.info(t('sync.deletionSkipped'));
        }
      } else {
        savePendingDeletions(stale);
        logger.info(t('sync.deletionDeferred', { count: stale.length }));
      }
    }
  }

  // Only write metadata files when there are actual content changes
  // (avoids empty commits from timestamp-only updates to sync-meta.json)
  if (result.synced.length > 0 || result.deleted.length > 0) {
    writeSyncMeta(repoPath, cfg);
    writeIntegrity(repoPath, result.synced, plaintextHashMap);
    writeKeyFingerprint(repoPath, keyPath);
  }

  // Clear stage progress on successful completion
  clearStageProgress();

  return result;
}
