/**
 * sync-restore.ts — Pull direction: local repo directory → workspace
 *
 * Handles file restoration, backup management, conflict detection,
 * three-way merge, and shared content distribution on pull.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { cryptoEngine } from './crypto.js';
import { jsonField }    from './json-field.js';
import { logger }       from '../utils/logger.js';
import { askConflict }  from '../utils/prompt.js';
import { threeWayMerge } from './merge.js';
import { gitEngine }    from './git.js';
import { t }            from '../i18n.js';
import { expandHome, buildFileEntries } from './sync.js';
import { logProgress }  from './sync-stage.js';
import { verifyIntegrity, readSyncMeta, verifyKeyFingerprint } from './sync-stage.js';
import { AGENT_NAMES }  from '../types.js';
import type {
  WangchuanConfig,
  FileEntry,
  RestoreResult,
  AgentName,
  FilterOptions,
} from '../types.js';

// ── Backup before destructive pull ─────────────────────────────────

const WANGCHUAN_DIR = path.join(os.homedir(), '.wangchuan');
const BACKUPS_DIR   = path.join(WANGCHUAN_DIR, 'backups');
const MAX_BACKUPS   = 5;

/**
 * Create a timestamped backup of local files that would be overwritten by restore.
 * Returns the backup directory path, or null if no files needed backup.
 */
export function backupBeforeRestore(
  entries: readonly FileEntry[],
  repoPath: string,
): string | null {
  const filesToBackup: Array<{ srcAbs: string; repoRel: string }> = [];
  for (const entry of entries) {
    const srcRepo = path.join(repoPath, entry.repoRel);
    if (!fs.existsSync(srcRepo) || !fs.existsSync(entry.srcAbs)) continue;
    const localPath = entry.jsonExtract ? entry.jsonExtract.originalPath : entry.srcAbs;
    if (!fs.existsSync(localPath)) continue;

    const localBuf = fs.readFileSync(localPath);
    const repoBuf  = fs.readFileSync(srcRepo);
    if (!localBuf.equals(repoBuf)) {
      filesToBackup.push({ srcAbs: localPath, repoRel: entry.repoRel });
    }
  }

  if (filesToBackup.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(BACKUPS_DIR, timestamp);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  logger.info(t('backup.creating', { count: filesToBackup.length }));

  const seen = new Set<string>();
  for (const { srcAbs, repoRel } of filesToBackup) {
    if (seen.has(srcAbs)) continue;
    seen.add(srcAbs);
    const dest = path.join(backupDir, repoRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcAbs, dest);
  }

  logger.info(t('backup.created', { path: backupDir }));
  return backupDir;
}

/** Keep only the N most recent backup directories, delete the rest */
export function rotateBackups(): void {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const dirs = fs.readdirSync(BACKUPS_DIR)
    .filter(d => fs.statSync(path.join(BACKUPS_DIR, d)).isDirectory())
    .sort()
    .reverse();

  if (dirs.length <= MAX_BACKUPS) return;

  const toRemove = dirs.slice(MAX_BACKUPS);
  for (const dir of toRemove) {
    fs.rmSync(path.join(BACKUPS_DIR, dir), { recursive: true, force: true });
  }
  logger.debug(t('backup.rotated', { kept: MAX_BACKUPS, removed: toRemove.length }));
}

// ── Main pull function ─────────────────────────────────────────────

/**
 * Pull: restore files from local repo to workspace.
 */
export async function restoreFromRepo(
  cfg: WangchuanConfig,
  agent?: AgentName | string,
  filter?: FilterOptions,
): Promise<RestoreResult> {
  const repoPath = expandHome(cfg.localRepoPath);
  const keyPath  = expandHome(cfg.keyPath);

  // Verify key fingerprint before pulling
  verifyKeyFingerprint(repoPath, keyPath);

  const entries  = buildFileEntries(cfg, repoPath, agent, filter);
  const result: RestoreResult = { synced: [], skipped: [], decrypted: [], conflicts: [], localOnly: [], skippedAgents: [] };
  let restoreIdx = 0;
  const restoreTotal = entries.length;

  // Detect skipped agents (workspace dir doesn't exist)
  const profiles = cfg.profiles.default;
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (p.enabled || (agent && agent !== name)) continue;
    const wsPath = expandHome(p.workspacePath);
    if (!fs.existsSync(wsPath)) {
      (result.skippedAgents as string[]).push(name);
    }
  }
  if (cfg.customAgents) {
    for (const [name, profile] of Object.entries(cfg.customAgents)) {
      if (agent && agent !== name) continue;
      const wsPath = expandHome(profile.workspacePath);
      if (!fs.existsSync(wsPath)) {
        (result.skippedAgents as string[]).push(name);
      }
    }
  }

  // Verify integrity checksums before restore
  verifyIntegrity(repoPath);

  // Backup local files before overwriting
  backupBeforeRestore(entries, repoPath);
  rotateBackups();

  let batchDecision: 'overwrite_all' | 'skip_all' | undefined;

  for (const entry of entries) {
    const srcRepo = path.join(repoPath, entry.repoRel);
    if (!fs.existsSync(srcRepo)) {
      if (entry.jsonExtract) {
        try {
          const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
          const extracted = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
          if (Object.keys(extracted).length > 0) {
            (result.localOnly as string[]).push(entry.repoRel);
          }
        } catch { /* ignore JSON parse failures */ }
      } else if (fs.existsSync(entry.srcAbs)) {
        (result.localOnly as string[]).push(entry.repoRel);
      }
      logger.debug(t('sync.skipNotInRepo', { file: entry.repoRel }));
      (result.skipped as string[]).push(entry.repoRel);
      continue;
    }

    // ── JSON field-level merge-back ────────────────────────────
    if (entry.jsonExtract) {
      let partialContent: string;
      if (entry.encrypt) {
        partialContent = cryptoEngine.decryptString(
          fs.readFileSync(srcRepo, 'utf-8').trim(), keyPath,
        );
      } else {
        partialContent = fs.readFileSync(srcRepo, 'utf-8');
      }
      const partial = JSON.parse(partialContent) as Record<string, unknown>;

      const targetPath = entry.jsonExtract.originalPath;
      let fullJson: Record<string, unknown> = {};
      if (fs.existsSync(targetPath)) {
        fullJson = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as Record<string, unknown>;
      }
      const merged = jsonField.mergeFields(fullJson, partial);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2), 'utf-8');

      // shared MCP entry: also distribute to all other agents
      if (entry.agentName === 'shared' && cfg.shared) {
        for (const source of cfg.shared.mcp.sources) {
          const p = cfg.profiles.default[source.agent];
          if (!p.enabled) continue;
          const otherPath = path.join(expandHome(p.workspacePath), source.src);
          if (otherPath === targetPath) continue;
          let otherJson: Record<string, unknown> = {};
          if (fs.existsSync(otherPath)) {
            try { otherJson = JSON.parse(fs.readFileSync(otherPath, 'utf-8')) as Record<string, unknown>; } catch { /* */ }
          }
          const otherMerged = jsonField.mergeFields(otherJson, partial);
          fs.mkdirSync(path.dirname(otherPath), { recursive: true });
          fs.writeFileSync(otherPath, JSON.stringify(otherMerged, null, 2), 'utf-8');
        }
      }

      (result.synced as string[]).push(entry.repoRel);
      if (entry.encrypt) (result.decrypted as string[]).push(entry.repoRel);
      restoreIdx++;
      logProgress(restoreIdx, restoreTotal, entry.encrypt ? 'decrypted' : 'field', entry.repoRel);
      continue;
    }

    // ── Distribute shared skills to all agents ─────────────────
    if (entry.agentName === 'shared' && entry.repoRel.startsWith('shared/skills/')) {
      const relInSkills = entry.repoRel.slice('shared/skills/'.length);
      const shared = cfg.shared;
      if (shared) {
        for (const source of shared.skills.sources) {
          const p = cfg.profiles.default[source.agent];
          if (!p.enabled) continue;
          const dest = path.join(expandHome(p.workspacePath), source.dir, relInSkills);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(srcRepo, dest);
        }
      }
      (result.synced as string[]).push(entry.repoRel);
      restoreIdx++;
      logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
      continue;
    }

    // ── Distribute shared custom agents to all agents ──────────
    if (entry.agentName === 'shared' && entry.repoRel.startsWith('shared/agents/')) {
      const relInAgents = entry.repoRel.slice('shared/agents/'.length);
      const shared = cfg.shared;
      if (shared?.agents) {
        for (const source of shared.agents.sources) {
          const p = cfg.profiles.default[source.agent];
          if (!p.enabled) continue;
          const dest = path.join(expandHome(p.workspacePath), source.dir, relInAgents);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(srcRepo, dest);
        }
      }
      (result.synced as string[]).push(entry.repoRel);
      restoreIdx++;
      logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
      continue;
    }

    // ── Conflict detection (whole-file sync) ──────────────────
    if (fs.existsSync(entry.srcAbs)) {
      let isDiff = false;
      const localBuf = fs.readFileSync(entry.srcAbs);
      let remoteContent: string | undefined;
      if (entry.encrypt) {
        try {
          const decrypted = cryptoEngine.decryptString(
            fs.readFileSync(srcRepo, 'utf-8').trim(), keyPath,
          );
          isDiff = localBuf.toString('utf-8') !== decrypted;
          remoteContent = decrypted;
        } catch {
          isDiff = true;
        }
      } else {
        const repoBuf = fs.readFileSync(srcRepo);
        isDiff = !localBuf.equals(repoBuf);
        remoteContent = repoBuf.toString('utf-8');
      }

      if (isDiff) {
        const ext = path.extname(entry.repoRel).toLowerCase();
        const MERGEABLE_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);
        const isTextMergeable = !entry.encrypt && MERGEABLE_EXTS.has(ext);
        if (isTextMergeable && remoteContent !== undefined) {
          const baseContent = await gitEngine.showFile(repoPath, 'HEAD~1', entry.repoRel);
          if (baseContent !== null) {
            const localContent = localBuf.toString('utf-8');
            const mergeResult = threeWayMerge(baseContent, localContent, remoteContent);
            if (!mergeResult.hasConflicts) {
              fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
              fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
              logger.info(`  ${t('merge.autoResolved', { file: entry.repoRel })}`);
              (result.synced as string[]).push(entry.repoRel);
              restoreIdx++;
              logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
              continue;
            }
            fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
            fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
            logger.warn(`  ${t('merge.conflictsFound', { file: entry.repoRel })}`);
            (result.conflicts as string[]).push(entry.repoRel);
            (result.synced as string[]).push(entry.repoRel);
            restoreIdx++;
            logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
            continue;
          }
        }

        // Fallback: interactive overwrite/skip/merge prompt
        (result.conflicts as string[]).push(entry.repoRel);

        if (batchDecision === 'skip_all') {
          logger.info(`  \u21b7 ${t('sync.skippedKeepLocal', { file: entry.repoRel })}`);
          (result.skipped as string[]).push(entry.repoRel);
          continue;
        }
        if (batchDecision !== 'overwrite_all') {
          const localStr = localBuf.toString('utf-8');
          const canMerge = isTextMergeable && remoteContent !== undefined;
          const ans = await askConflict(entry.repoRel, localStr, remoteContent, canMerge);
          if (ans === 'skip' || ans === 'skip_all') {
            if (ans === 'skip_all') batchDecision = 'skip_all';
            logger.info(`  \u21b7 ${t('sync.skippedKeepLocal', { file: entry.repoRel })}`);
            (result.skipped as string[]).push(entry.repoRel);
            continue;
          }
          if (ans === 'overwrite_all') batchDecision = 'overwrite_all';
          if (ans === 'merge' && canMerge) {
            const baseContent = await gitEngine.showFile(repoPath, 'HEAD~1', entry.repoRel);
            const base = baseContent ?? '';
            const mergeResult = threeWayMerge(base, localStr, remoteContent!);
            fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
            fs.writeFileSync(entry.srcAbs, mergeResult.merged, 'utf-8');
            if (mergeResult.hasConflicts) {
              logger.warn(`  ${t('merge.conflictsFound', { file: entry.repoRel })}`);
            } else {
              logger.info(`  ${t('merge.autoResolved', { file: entry.repoRel })}`);
            }
            (result.synced as string[]).push(entry.repoRel);
            restoreIdx++;
            logProgress(restoreIdx, restoreTotal, 'copy', entry.repoRel);
            continue;
          }
        }
      }
    }

    // ── Write file ───────────────────────────────────────────
    fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
    if (entry.encrypt) {
      cryptoEngine.decryptFile(srcRepo, entry.srcAbs, keyPath);
      (result.decrypted as string[]).push(entry.repoRel);
    } else {
      fs.copyFileSync(srcRepo, entry.srcAbs);
    }
    (result.synced as string[]).push(entry.repoRel);
    restoreIdx++;
    logProgress(restoreIdx, restoreTotal, entry.encrypt ? 'decrypted' : 'copy', entry.repoRel);
  }

  // Log sync-meta freshness info
  const meta = readSyncMeta(repoPath);
  if (meta) {
    logger.info(t('sync.meta.lastSync', {
      time:     meta.lastSyncAt,
      hostname: meta.hostname,
      env:      meta.environment,
    }));
    const ageMs  = Date.now() - new Date(meta.lastSyncAt).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (ageDays >= 3) {
      logger.warn(t('sync.meta.staleDays', { days: ageDays }));
    }
  }

  return result;
}
