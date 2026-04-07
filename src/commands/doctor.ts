/**
 * doctor.ts — wangchuan doctor command
 *
 * Validates the entire Wangchuan setup and reports issues:
 *   - config.json exists and is valid
 *   - master.key exists with correct permissions (0o600)
 *   - git is available and repo is cloned
 *   - SSH key can access the remote repo (git ls-remote, timeout 10s)
 *   - each enabled agent's workspace directory exists
 *   - no stale sync-lock.json
 *   - integrity.json checksums match repo files
 */

import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { config }      from '../core/config.js';
import { gitEngine }   from '../core/git.js';
import { syncLock }    from '../core/sync-lock.js';
import { logger }      from '../utils/logger.js';
import { t }           from '../i18n.js';
import { AGENT_NAMES } from '../types.js';
import { syncEngine }  from '../core/sync.js';
import { loadIgnorePatterns } from '../core/sync.js';
import chalk from 'chalk';

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
  } catch {
    // On some OS (Windows) permission check may not work — treat as OK
  }
  return PASS(t('doctor.keyOk'));
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

function checkAgentWorkspaces(cfg: import('../types.js').WangchuanConfig): CheckResult[] {
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
  } catch {
    return WARN(t('doctor.integrityMissing'));
  }

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

export async function cmdDoctor(): Promise<void> {
  logger.banner(t('doctor.banner'));

  const results: CheckResult[] = [];

  // 1. Config
  results.push(checkConfig());

  // 2. Master key
  results.push(checkMasterKey());

  // 3. Git
  results.push(await checkGit());

  // Load config for further checks (if available)
  let cfg: import('../types.js').WangchuanConfig | null = null;
  try { cfg = config.load(); } catch { /* already reported above */ }

  if (cfg) {
    // 4. Repo cloned
    results.push(checkRepoCloned(cfg.localRepoPath));

    // 5. Remote access
    results.push(checkRemoteAccess(cfg.repo));

    // 6. Agent workspaces
    results.push(...checkAgentWorkspaces(cfg));

    // 7. Sync lock
    results.push(checkSyncLock());

    // 8. Integrity
    results.push(checkIntegrity(cfg.localRepoPath));

    // 9. Ignore file
    results.push(checkIgnoreFile());
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
