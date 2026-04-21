/**
 * doctor.ts — wangchuan doctor command (enhanced)
 *
 * All-in-one diagnostic and fix tool. Always auto-fixes (no --fix needed).
 *
 * Checks:
 *   - config.json exists and is valid
 *   - master.key exists with correct permissions (0o600)
 *   - git is available and repo is cloned
 *   - SSH key can access the remote repo
 *   - each enabled agent's workspace directory exists
 *   - auto-discover disabled agents with existing workspaces → auto-enable
 *   - no stale sync-lock.json
 *   - integrity.json checksums match
 *   - stale/phantom file warnings (from cleanup logic)
 *
 * Flags:
 *   --key-rotate  Rotate the master encryption key
 *   --key-export  Print the master key hex for migration
 *   --setup       Show one-liner init command for a new machine
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { config }          from '../core/config.js';
import { resolveGitBranch } from '../core/config.js';
import { gitEngine }       from '../core/git.js';
import { cryptoEngine, clearKeyCache } from '../core/crypto.js';
import { keyFingerprint } from '../core/crypto.js';
import { syncLock }        from '../core/sync-lock.js';
import { logger }          from '../utils/logger.js';
import { t }               from '../i18n.js';
import { AGENT_NAMES }     from '../types.js';
import { syncEngine }      from '../core/sync.js';
import { loadIgnorePatterns } from '../core/sync.js';
import { ensureMigrated }  from '../core/migrate.js';
import { validator }        from '../utils/validator.js';
import { walkDir }          from '../utils/fs.js';
import type { AgentName, AgentProfile, WangchuanConfig, FileEntry } from '../types.js';
import chalk from 'chalk';
import ora   from 'ora';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CheckResult {
  readonly status: CheckStatus;
  readonly message: string;
}

const PASS = (msg: string): CheckResult => ({ status: 'pass', message: msg });
const WARN = (msg: string): CheckResult => ({ status: 'warn', message: msg });
const FAIL = (msg: string): CheckResult => ({ status: 'fail', message: msg });

const ICONS: Record<CheckStatus, string> = {
  pass: chalk.green('\u2713'),
  warn: chalk.yellow('\u26A0'),
  fail: chalk.red('\u2717'),
};

// ── Individual checks ──────────────────────────────────────────

function checkConfig(): CheckResult {
  try {
    const cfg = config.load();
    if (!cfg) return FAIL(t('doctor.configMissing', { path: config.paths.config }));
    return PASS(t('doctor.configOk'));
  } catch (err) {
    return FAIL(t('doctor.configInvalid', { error: (err as Error).message }));
  }
}

function checkMasterKey(): CheckResult {
  const keyPath = config.paths.key;
  if (!fs.existsSync(keyPath)) {
    return FAIL(t('doctor.keyMissing', { path: keyPath }));
  }
  try {
    const stat = fs.statSync(keyPath);
    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      return WARN(t('doctor.keyBadPerms', { path: keyPath }));
    }
  } catch { /* On some OS permission check may not work */ }
  return PASS(t('doctor.keyOk'));
}

/** Check if local key fingerprint matches the one stored in the repo */
function checkKeyFingerprint(cfg: WangchuanConfig): CheckResult {
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const fpPath = path.join(repoPath, 'key-fingerprint.json');
  if (!fs.existsSync(fpPath)) {
    return WARN(t('doctor.keyFingerprintNone'));
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(fpPath, 'utf-8')) as { fingerprint: string };
    const localFp = keyFingerprint(cfg.keyPath);
    if (localFp !== manifest.fingerprint) {
      return FAIL(t('doctor.keyFingerprintFail'));
    }
    return PASS(t('doctor.keyFingerprintOk'));
  } catch {
    return WARN(t('doctor.keyFingerprintNone'));
  }
}

async function checkGit(): Promise<CheckResult> {
  const available = await gitEngine.isGitAvailable();
  return available ? PASS(t('doctor.gitOk')) : FAIL(t('doctor.gitMissing'));
}

function checkRepoCloned(localRepoPath: string): CheckResult {
  const repoPath = syncEngine.expandHome(localRepoPath);
  if (fs.existsSync(path.join(repoPath, '.git'))) {
    return PASS(t('doctor.repoOk', { path: repoPath }));
  }
  return FAIL(t('doctor.repoMissing', { path: repoPath }));
}

function checkRemoteAccess(repo: string): CheckResult {
  try {
    execSync(`git ls-remote --exit-code "${repo}" HEAD`, {
      timeout: 10_000,
      stdio: 'pipe',
    });
    return PASS(t('doctor.sshOk'));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('timed out') || msg.includes('TIMEOUT')) {
      return WARN(t('doctor.sshTimeout'));
    }
    return WARN(t('doctor.sshFailed', { error: msg.split('\n')[0]! }));
  }
}

function checkAgentWorkspaces(cfg: WangchuanConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const profiles = cfg.profiles.default;
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (!p.enabled) continue;
    const wsPath = syncEngine.expandHome(p.workspacePath);
    if (fs.existsSync(wsPath)) {
      results.push(PASS(t('doctor.agentOk', { name, path: wsPath })));
    } else {
      results.push(WARN(t('doctor.agentMissing', { name, path: wsPath })));
    }
  }
  return results;
}

/** Detect alternative OpenClaw profiles (~/.openclaw-*) and hint the user */
function checkOpenClawProfiles(cfg: WangchuanConfig, results: CheckResult[]): void {
  const home = os.homedir();
  let entries: string[];
  try { entries = fs.readdirSync(home); } catch { return; }

  const currentWs = syncEngine.expandHome(cfg.profiles.default.openclaw.workspacePath);
  for (const name of entries) {
    if (!name.startsWith('.openclaw-')) continue;
    const profileName = name.slice('.openclaw-'.length);
    const profileDir = path.join(home, name);
    try {
      if (!fs.statSync(profileDir).isDirectory()) continue;
    } catch { continue; }
    const wsDir = path.join(profileDir, 'workspace');
    if (wsDir === currentWs) continue;
    results.push(WARN(t('doctor.openclawProfiles', { name: profileName, path: profileDir })));
  }
}

function checkSyncLock(): CheckResult {
  const lock = syncLock.read();
  if (!lock) return PASS(t('doctor.lockNone'));

  try {
    process.kill(lock.pid, 0);
    return WARN(t('doctor.lockActive', { pid: lock.pid }));
  } catch {
    return WARN(t('doctor.lockStale', { pid: lock.pid }));
  }
}

function checkIntegrity(localRepoPath: string): CheckResult {
  const repoPath = syncEngine.expandHome(localRepoPath);
  const manifestPath = path.join(repoPath, 'integrity.json');
  if (!fs.existsSync(manifestPath)) {
    return WARN(t('doctor.integrityMissing'));
  }

  let manifest: { checksums: Record<string, string> };
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as typeof manifest;
  } catch { return WARN(t('doctor.integrityMissing')); }

  const total = Object.keys(manifest.checksums).length;
  let mismatched = 0;
  for (const [repoRel, expectedHash] of Object.entries(manifest.checksums)) {
    const absPath = path.join(repoPath, repoRel);
    if (!fs.existsSync(absPath)) continue;
    const content = fs.readFileSync(absPath);
    const actualHash = crypto.createHash('sha256').update(content).digest('hex');
    if (actualHash !== expectedHash) mismatched++;
  }

  if (mismatched > 0) {
    return FAIL(t('doctor.integrityFailed', { count: mismatched }));
  }
  return PASS(t('doctor.integrityOk', { count: total }));
}

function checkIgnoreFile(): CheckResult {
  const patterns = loadIgnorePatterns();
  if (patterns.length > 0) {
    return PASS(t('doctor.ignoreOk', { count: patterns.length }));
  }
  return WARN(t('doctor.ignoreNotFound'));
}

// ── Stale/phantom file scan (from cleanup.ts) ──────────────────

type FileStatus = 'ok' | 'stale' | 'dormant' | 'phantom';

function classifyFiles(entries: readonly FileEntry[], staleDays = 90): { stale: string[]; dormant: string[]; phantom: string[] } {
  const stale: string[] = [];
  const dormant: string[] = [];
  const phantom: string[] = [];

  for (const entry of entries) {
    if (!fs.existsSync(entry.srcAbs)) {
      phantom.push(entry.repoRel);
      continue;
    }
    const stat = fs.statSync(entry.srcAbs);
    const ageDays = Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24));
    if (ageDays >= staleDays * 2) {
      dormant.push(entry.repoRel);
    } else if (ageDays >= staleDays) {
      stale.push(entry.repoRel);
    }
  }

  return { stale, dormant, phantom };
}

// ── Key management helpers (from key.ts) ────────────────────────

function findEncFiles(repoPath: string): string[] {
  const encFiles: string[] = [];
  for (const topDir of ['agents', 'shared']) {
    const scanRoot = path.join(repoPath, topDir);
    if (!fs.existsSync(scanRoot)) continue;
    for (const relFile of walkDir(scanRoot)) {
      if (relFile.endsWith('.enc')) {
        encFiles.push(path.join(topDir, relFile));
      }
    }
  }
  return encFiles;
}

async function handleKeyRotate(cfg: WangchuanConfig): Promise<void> {
  const repoPath = syncEngine.expandHome(cfg.localRepoPath);
  const keyPath  = syncEngine.expandHome(cfg.keyPath);

  const encFiles = findEncFiles(repoPath);
  if (encFiles.length === 0) {
    logger.info(t('key.rotate.noFiles'));
    return;
  }

  const spinner = ora(t('key.rotate.start')).start();
  const oldKeyHex = fs.readFileSync(keyPath, 'utf-8').trim();

  spinner.text = t('key.rotate.decrypting', { count: encFiles.length });
  const decryptedContents = new Map<string, string>();
  for (const relFile of encFiles) {
    const absPath = path.join(repoPath, relFile);
    const encrypted = fs.readFileSync(absPath, 'utf-8').trim();
    const decrypted = cryptoEngine.decryptString(encrypted, keyPath);
    decryptedContents.set(relFile, decrypted);
  }

  const newKey = cryptoEngine.generateKey(keyPath);
  clearKeyCache(); // Invalidate cached key after rotation

  spinner.text = t('key.rotate.reencrypting');
  try {
    for (const [relFile, plaintext] of decryptedContents) {
      const absPath = path.join(repoPath, relFile);
      const reEncrypted = cryptoEngine.encryptString(plaintext, keyPath);
      fs.writeFileSync(absPath, reEncrypted, 'utf-8');
    }
  } catch (err) {
    fs.writeFileSync(keyPath, oldKeyHex, { mode: 0o600, encoding: 'utf-8' });
    spinner.fail(t('key.rotate.failed', { error: (err as Error).message }));
    logger.warn(t('key.rotate.rolledBack'));
    return;
  }

  try {
    await gitEngine.commitAndPush(repoPath, 'security: rotate master key', resolveGitBranch(cfg));
  } catch (err) {
    fs.writeFileSync(keyPath, oldKeyHex, { mode: 0o600, encoding: 'utf-8' });
    for (const [relFile, plaintext] of decryptedContents) {
      const absPath = path.join(repoPath, relFile);
      const reEncrypted = cryptoEngine.encryptString(plaintext, keyPath);
      fs.writeFileSync(absPath, reEncrypted, 'utf-8');
    }
    spinner.fail(t('key.rotate.failed', { error: (err as Error).message }));
    logger.warn(t('key.rotate.rolledBack'));
    return;
  }

  spinner.succeed(t('key.rotate.complete', { count: encFiles.length }));
}

function handleKeyExport(cfg: WangchuanConfig): void {
  const keyPath = syncEngine.expandHome(cfg.keyPath);
  const raw = fs.readFileSync(keyPath, 'utf-8').trim();
  // Normalize: always output with wangchuan_ prefix
  const prefixed = raw.startsWith('wangchuan_') ? raw : 'wangchuan_' + raw;
  logger.info(t('key.export.hex', { hex: prefixed }));
  logger.warn(t('key.export.warning'));
  logger.info(t('key.export.fileHint', { path: keyPath }));
}

function handleSetup(cfg: WangchuanConfig): void {
  const keyPath = syncEngine.expandHome(cfg.keyPath);
  if (!fs.existsSync(keyPath)) {
    throw new Error(t('setup.keyNotFound', { path: keyPath }));
  }

  const keyHex = fs.readFileSync(keyPath, 'utf-8').trim();
  // Normalize to prefixed format for display
  const prefixed = keyHex.startsWith('wangchuan_') ? keyHex : 'wangchuan_' + keyHex;
  const repo = cfg.repo;

  console.log(chalk.bold(`  ${t('setup.repoLabel')}`) + chalk.cyan(repo));
  console.log(chalk.bold(`  ${t('setup.keyLabel')}`) + chalk.gray(prefixed.slice(0, 18) + '…' + prefixed.slice(-8)));
  console.log();

  const command = `npx wangchuan init --repo ${repo} --key /path/to/exported-key.txt`;
  console.log(chalk.bold(`  ${t('setup.commandLabel')}`));
  console.log();
  console.log(`  ${chalk.green(command)}`);
  console.log();
  logger.info(t('setup.keyFileHint'));
}

// ── Doctor options ──────────────────────────────────────────────

interface DoctorOptions {
  readonly keyRotate?: boolean | undefined;
  readonly keyExport?: boolean | undefined;
  readonly setup?: boolean | undefined;
}

// ── Main command ────────────────────────────────────────────────

export async function cmdDoctor(opts: DoctorOptions = {}): Promise<void> {
  logger.banner(t('doctor.banner'));

  // Load config for subcommands that need it
  let cfg: WangchuanConfig | null = null;
  try { cfg = config.load(); } catch { /* reported in checks below */ }

  if (cfg) {
    validator.requireInit(cfg);
    cfg = ensureMigrated(cfg);
  }

  // ── Handle --key-rotate, --key-export, --setup subcommands ──
  if (opts.keyRotate && cfg) {
    await handleKeyRotate(cfg);
    return;
  }
  if (opts.keyExport && cfg) {
    handleKeyExport(cfg);
    return;
  }
  if (opts.setup && cfg) {
    handleSetup(cfg);
    return;
  }

  // ── Run all checks + auto-fix ──────────────────────────────

  const results: CheckResult[] = [];

  // 1. Config
  results.push(checkConfig());

  // 2. Master key
  results.push(checkMasterKey());

  // 2b. Key fingerprint (repo vs local key match)
  if (cfg) {
    results.push(checkKeyFingerprint(cfg));
  }

  // 3. Git
  results.push(await checkGit());

  if (cfg) {
    // 4. Repo cloned
    const repoResult = checkRepoCloned(cfg.localRepoPath);
    results.push(repoResult);

    // Auto-fix: re-clone if missing
    if (repoResult.status === 'fail') {
      const repoPath = syncEngine.expandHome(cfg.localRepoPath);
      try {
        await gitEngine.cloneOrFetch(cfg.repo, repoPath, resolveGitBranch(cfg));
        console.log(chalk.cyan(`  🔧 ${t('doctor.fixRepoClone', { path: repoPath })}`));
      } catch (err) {
        console.log(chalk.red(`  ✗ ${t('doctor.fixRepoCloneFailed', { error: (err as Error).message })}`));
      }
    }

    // 5. Remote access
    results.push(checkRemoteAccess(cfg.repo));

    // 6. Agent workspaces
    results.push(...checkAgentWorkspaces(cfg));

    // Auto-fix: create missing agent workspace dirs
    const profiles = cfg.profiles.default;
    for (const name of AGENT_NAMES) {
      const p = profiles[name];
      if (!p.enabled) continue;
      const wsPath = syncEngine.expandHome(p.workspacePath);
      if (!fs.existsSync(wsPath)) {
        fs.mkdirSync(wsPath, { recursive: true });
        console.log(chalk.cyan(`  🔧 ${t('doctor.fixAgentDir', { path: wsPath })}`));
      }
    }

    // 7. Auto-discover disabled agents with existing workspaces → auto-enable
    let updatedCfg = cfg;
    for (const name of AGENT_NAMES) {
      const p = profiles[name];
      if (p.enabled) continue;
      const wsPath = syncEngine.expandHome(p.workspacePath);
      if (fs.existsSync(wsPath)) {
        results.push(WARN(t('doctor.discoveredAgent', { name, path: wsPath })));
        // Auto-enable
        const updatedProfile: AgentProfile = { ...updatedCfg.profiles.default[name], enabled: true };
        const updatedProfiles = { ...updatedCfg.profiles.default, [name]: updatedProfile };
        updatedCfg = { ...updatedCfg, profiles: { default: updatedProfiles } };
        console.log(chalk.cyan(`  🔧 ${t('doctor.fixAgentEnabled', { name })}`));
      }
    }
    if (updatedCfg !== cfg) {
      config.save(updatedCfg);
      cfg = updatedCfg;
    }

    // 7b. Detect alternative OpenClaw profiles (~/.openclaw-*)
    checkOpenClawProfiles(cfg, results);

    // 8. Sync lock
    const lockResult = checkSyncLock();
    results.push(lockResult);

    // Auto-fix: remove stale sync lock
    if (lockResult.status === 'warn') {
      const lock = syncLock.read();
      if (lock) {
        let alive: boolean;
        try { process.kill(lock.pid, 0); alive = true; } catch { alive = false; }
        if (!alive) {
          syncLock.release();
          console.log(chalk.cyan(`  🔧 ${t('doctor.fixStaleLock', { pid: lock.pid })}`));
        }
      }
    }

    // 9. Integrity
    results.push(checkIntegrity(cfg.localRepoPath));

    // 10. Ignore file
    results.push(checkIgnoreFile());

    // 11. Stale/phantom file scan
    const allEntries = syncEngine.buildFileEntries(cfg);
    const { stale, dormant, phantom } = classifyFiles(allEntries);
    if (phantom.length > 0) {
      results.push(WARN(t('doctor.phantomFiles', { count: phantom.length })));
    }
    if (dormant.length > 0) {
      results.push(WARN(t('doctor.dormantFiles', { count: dormant.length })));
    }
    if (stale.length > 0) {
      results.push(WARN(t('doctor.staleFiles', { count: stale.length })));
    }
    if (stale.length === 0 && dormant.length === 0 && phantom.length === 0) {
      results.push(PASS(t('doctor.filesHealthy')));
    }
  }

  // Auto-fix: fix key permissions
  const keyPath = config.paths.key;
  if (fs.existsSync(keyPath)) {
    try {
      const stat = fs.statSync(keyPath);
      const mode = stat.mode & 0o777;
      if (mode !== 0o600) {
        fs.chmodSync(keyPath, 0o600);
        console.log(chalk.cyan(`  🔧 ${t('doctor.fixKeyPerms')}`));
      }
    } catch { /* Permission check may not work on some OS */ }
  }

  // Print results
  console.log();
  for (const r of results) {
    console.log(`  ${ICONS[r.status]} ${r.message}`);
  }
  console.log();

  // Summary
  const pass = results.filter(r => r.status === 'pass').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const fail = results.filter(r => r.status === 'fail').length;

  const summary = t('doctor.summary', { pass, warn, fail });
  if (fail > 0) {
    logger.error(summary);
  } else if (warn > 0) {
    logger.warn(summary);
  } else {
    logger.ok(summary);
  }
}
