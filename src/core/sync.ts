/**
 * sync.ts — 同步引擎核心
 *
 * 三个方向：
 *   stageToRepo      工作区 → 本地仓库目录（推送前准备）
 *   restoreFromRepo  本地仓库目录 → 工作区（拉取后还原）
 *   diff             对比两侧，返回差异摘要
 *
 * 所有方法支持可选的 agent 过滤参数，只操作指定智能体的文件。
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { cryptoEngine } from './crypto.js';
import { validator }    from '../utils/validator.js';
import { logger }       from '../utils/logger.js';
import { askConflict }  from '../utils/prompt.js';
import type {
  WangchuanConfig,
  FileEntry,
  StageResult,
  RestoreResult,
  DiffResult,
  AgentName,
} from '../types.js';

export function expandHome(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function walkDir(dirAbs: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dirAbs)) return results;
  function walk(subPath: string): void {
    const full = path.join(dirAbs, subPath);
    if (fs.statSync(full).isDirectory()) {
      fs.readdirSync(full).forEach(f => walk(path.join(subPath, f)));
    } else {
      results.push(subPath);
    }
  }
  fs.readdirSync(dirAbs).forEach(f => walk(f));
  return results;
}

/**
 * 构建需要同步的文件条目列表（所有同步方向的单一事实来源）。
 *
 * @param repoDirBase 传入本地仓库根目录时，syncDirs 从仓库侧枚举（pull 方向）
 * @param agent       只返回指定智能体的条目，undefined 表示全部
 */
export function buildFileEntries(
  cfg: WangchuanConfig,
  repoDirBase?: string,
  agent?: AgentName,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const profile = cfg.profiles.default;

  // ── OpenClaw ────────────────────────────────────────────────
  if (profile.openclaw.enabled && (!agent || agent === 'openclaw')) {
    const wsPath = expandHome(profile.openclaw.workspacePath);

    for (const item of profile.openclaw.syncFiles) {
      const suffix = item.encrypt ? '.enc' : '';
      entries.push({
        srcAbs:    path.join(wsPath, item.src),
        repoRel:   path.join('openclaw', item.src + suffix),
        plainRel:  path.join('openclaw', item.src),
        encrypt:   item.encrypt,
        agentName: 'openclaw',
      });
    }

    for (const dir of profile.openclaw.syncDirs) {
      const scanBase = repoDirBase
        ? path.join(repoDirBase, 'openclaw', dir.src)
        : path.join(wsPath, dir.src);

      if (!fs.existsSync(scanBase)) continue;

      for (const relFile of walkDir(scanBase)) {
        const suffix    = dir.encrypt ? '.enc' : '';
        const plainFile = relFile.endsWith('.enc') ? relFile.slice(0, -4) : relFile;
        entries.push({
          srcAbs:    path.join(wsPath, dir.src, plainFile),
          repoRel:   path.join('openclaw', dir.src, plainFile + suffix),
          plainRel:  path.join('openclaw', dir.src, plainFile),
          encrypt:   dir.encrypt,
          agentName: 'openclaw',
        });
      }
    }
  }

  // ── Claude ──────────────────────────────────────────────────
  if (profile.claude.enabled && (!agent || agent === 'claude')) {
    const wsPath = expandHome(profile.claude.workspacePath);
    for (const item of profile.claude.syncFiles) {
      const suffix = item.encrypt ? '.enc' : '';
      entries.push({
        srcAbs:    path.join(wsPath, item.src),
        repoRel:   path.join('claude', item.src + suffix),
        plainRel:  path.join('claude', item.src),
        encrypt:   item.encrypt,
        agentName: 'claude',
      });
    }
  }

  // ── Gemini ──────────────────────────────────────────────────
  if (profile.gemini.enabled && (!agent || agent === 'gemini')) {
    const wsPath = expandHome(profile.gemini.workspacePath);
    for (const item of profile.gemini.syncFiles) {
      const suffix = item.encrypt ? '.enc' : '';
      entries.push({
        srcAbs:    path.join(wsPath, item.src),
        repoRel:   path.join('gemini', item.src + suffix),
        plainRel:  path.join('gemini', item.src),
        encrypt:   item.encrypt,
        agentName: 'gemini',
      });
    }
  }

  return entries;
}

export const syncEngine = {
  expandHome,
  buildFileEntries,

  async stageToRepo(cfg: WangchuanConfig, agent?: AgentName): Promise<StageResult> {
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, undefined, agent);
    const result: StageResult = { synced: [], skipped: [], encrypted: [] };

    for (const entry of entries) {
      if (!fs.existsSync(entry.srcAbs)) {
        logger.debug(`跳过（不存在）: ${entry.srcAbs}`);
        (result.skipped as string[]).push(entry.srcAbs);
        continue;
      }
      if (!entry.encrypt) {
        const content = fs.readFileSync(entry.srcAbs, 'utf-8');
        if (validator.containsSensitiveData(content)) {
          logger.warn(`⚠  检测到疑似明文敏感信息: ${entry.srcAbs}`);
          logger.warn(`   建议在配置中将该文件标记为 encrypt:true`);
        }
      }
      const destAbs = path.join(repoPath, entry.repoRel);
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      if (entry.encrypt) {
        cryptoEngine.encryptFile(entry.srcAbs, destAbs, keyPath);
        (result.encrypted as string[]).push(entry.repoRel);
      } else {
        fs.copyFileSync(entry.srcAbs, destAbs);
      }
      (result.synced as string[]).push(entry.repoRel);
    }
    return result;
  },

  async restoreFromRepo(cfg: WangchuanConfig, agent?: AgentName): Promise<RestoreResult> {
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, repoPath, agent);
    const result: RestoreResult = { synced: [], skipped: [], decrypted: [], conflicts: [] };

    // 批量决策：overwrite_all / skip_all
    let batchDecision: 'overwrite_all' | 'skip_all' | undefined;

    for (const entry of entries) {
      const srcRepo = path.join(repoPath, entry.repoRel);
      if (!fs.existsSync(srcRepo)) {
        logger.debug(`跳过（仓库中不存在）: ${entry.repoRel}`);
        (result.skipped as string[]).push(entry.repoRel);
        continue;
      }

      // ── 冲突检测 ─────────────────────────────────────────────
      if (fs.existsSync(entry.srcAbs)) {
        let isDiff = false;
        const localBuf = fs.readFileSync(entry.srcAbs);
        if (entry.encrypt) {
          try {
            const decrypted = cryptoEngine.decryptString(
              fs.readFileSync(srcRepo, 'utf-8').trim(), keyPath,
            );
            isDiff = localBuf.toString('utf-8') !== decrypted;
          } catch {
            isDiff = true;
          }
        } else {
          isDiff = !localBuf.equals(fs.readFileSync(srcRepo));
        }

        if (isDiff) {
          (result.conflicts as string[]).push(entry.repoRel);

          // 已有批量决策则直接应用
          if (batchDecision === 'skip_all') {
            logger.info(`  ↷ 跳过（保留本地）: ${entry.repoRel}`);
            (result.skipped as string[]).push(entry.repoRel);
            continue;
          }
          if (batchDecision === 'overwrite_all') {
            // 继续走下方写入逻辑
          } else {
            // 无批量决策，询问用户
            const ans = await askConflict(entry.repoRel);
            if (ans === 'skip' || ans === 'skip_all') {
              if (ans === 'skip_all') batchDecision = 'skip_all';
              logger.info(`  ↷ 跳过（保留本地）: ${entry.repoRel}`);
              (result.skipped as string[]).push(entry.repoRel);
              continue;
            }
            if (ans === 'overwrite_all') batchDecision = 'overwrite_all';
            // ans === 'overwrite' 或 'overwrite_all'：继续走下方写入逻辑
          }
        }
      }

      // ── 写入文件 ──────────────────────────────────────────────
      fs.mkdirSync(path.dirname(entry.srcAbs), { recursive: true });
      if (entry.encrypt) {
        cryptoEngine.decryptFile(srcRepo, entry.srcAbs, keyPath);
        (result.decrypted as string[]).push(entry.repoRel);
      } else {
        fs.copyFileSync(srcRepo, entry.srcAbs);
      }
      (result.synced as string[]).push(entry.srcAbs);
    }
    return result;
  },

  async diff(cfg: WangchuanConfig, agent?: AgentName): Promise<DiffResult> {
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, undefined, agent);
    const diff: DiffResult = { added: [], modified: [], missing: [] };

    for (const entry of entries) {
      const srcExists  = fs.existsSync(entry.srcAbs);
      const repoExists = fs.existsSync(path.join(repoPath, entry.repoRel));

      if (!srcExists && !repoExists) continue;
      if (srcExists  && !repoExists) { (diff.added   as string[]).push(entry.repoRel); continue; }
      if (!srcExists && repoExists)  { (diff.missing  as string[]).push(entry.repoRel); continue; }

      const srcBuf  = fs.readFileSync(entry.srcAbs);
      const repoBuf = fs.readFileSync(path.join(repoPath, entry.repoRel));

      if (entry.encrypt) {
        try {
          const decrypted = cryptoEngine.decryptString(repoBuf.toString('utf-8').trim(), keyPath);
          if (srcBuf.toString('utf-8') !== decrypted) {
            (diff.modified as string[]).push(entry.repoRel);
          }
        } catch {
          (diff.modified as string[]).push(entry.repoRel);
        }
      } else {
        if (!srcBuf.equals(repoBuf)) (diff.modified as string[]).push(entry.repoRel);
      }
    }
    return diff;
  },
} as const;
