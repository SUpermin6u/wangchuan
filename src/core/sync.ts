/**
 * sync.ts — 同步引擎核心
 *
 * 三个方向：
 *   stageToRepo      工作区 → 本地仓库目录（推送前准备）
 *   restoreFromRepo  本地仓库目录 → 工作区（拉取后还原）
 *   diff             对比两侧，返回差异摘要
 *
 * 支持三层同步：
 *   shared   — 跨 agent 共享（skills、MCP 模板、共享记忆）
 *   agents/* — per-agent 跨环境同步
 *
 * 所有方法支持可选的 agent 过滤参数，只操作指定智能体的文件。
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { cryptoEngine } from './crypto.js';
import { jsonField }    from './json-field.js';
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
  AgentProfile,
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

/** 按 repoRel 去重，保留第一个出现的条目 */
function deduplicateEntries(entries: FileEntry[]): FileEntry[] {
  const seen = new Set<string>();
  return entries.filter(e => {
    if (seen.has(e.repoRel)) return false;
    seen.add(e.repoRel);
    return true;
  });
}

const AGENT_NAMES: AgentName[] = ['openclaw', 'claude', 'gemini'];

/**
 * 为指定 agent profile 生成 syncFiles + syncDirs + jsonFields 条目
 */
function buildAgentEntries(
  name: AgentName,
  profile: AgentProfile,
  repoDirBase?: string,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const wsPath = expandHome(profile.workspacePath);
  const repoPrefix = `agents/${name}`;

  // syncFiles
  for (const item of profile.syncFiles) {
    const suffix = item.encrypt ? '.enc' : '';
    entries.push({
      srcAbs:    path.join(wsPath, item.src),
      repoRel:   path.join(repoPrefix, item.src + suffix),
      plainRel:  path.join(repoPrefix, item.src),
      encrypt:   item.encrypt,
      agentName: name,
    });
  }

  // syncDirs
  for (const dir of (profile.syncDirs ?? [])) {
    const scanBase = repoDirBase
      ? path.join(repoDirBase, repoPrefix, dir.src)
      : path.join(wsPath, dir.src);
    if (!fs.existsSync(scanBase)) continue;

    for (const relFile of walkDir(scanBase)) {
      const suffix    = dir.encrypt ? '.enc' : '';
      const plainFile = relFile.endsWith('.enc') ? relFile.slice(0, -4) : relFile;
      entries.push({
        srcAbs:    path.join(wsPath, dir.src, plainFile),
        repoRel:   path.join(repoPrefix, dir.src, plainFile + suffix),
        plainRel:  path.join(repoPrefix, dir.src, plainFile),
        encrypt:   dir.encrypt,
        agentName: name,
      });
    }
  }

  // jsonFields — 字段级 JSON 提取
  for (const jf of (profile.jsonFields ?? [])) {
    const suffix = jf.encrypt ? '.enc' : '';
    entries.push({
      srcAbs:    path.join(wsPath, jf.src),
      repoRel:   path.join(repoPrefix, jf.repoName + suffix),
      plainRel:  path.join(repoPrefix, jf.repoName),
      encrypt:   jf.encrypt,
      agentName: name,
      jsonExtract: {
        fields:       jf.fields,
        originalPath: path.join(wsPath, jf.src),
      },
    });
  }

  return entries;
}

/**
 * 构建 shared tier 条目（skills、MCP 模板、共享文件）
 */
function buildSharedEntries(
  cfg: WangchuanConfig,
  repoDirBase?: string,
): FileEntry[] {
  const entries: FileEntry[] = [];
  const shared = cfg.shared;
  if (!shared) return entries;
  const profiles = cfg.profiles.default;

  // ── shared skills：多源汇聚 ────────────────────────────────
  for (const source of shared.skills.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const wsPath = expandHome(p.workspacePath);
    const scanBase = repoDirBase
      ? path.join(repoDirBase, 'shared', 'skills')
      : path.join(wsPath, source.dir);
    if (!fs.existsSync(scanBase)) continue;

    for (const relFile of walkDir(scanBase)) {
      // 跳过 .DS_Store 等系统文件
      if (path.basename(relFile).startsWith('.')) continue;
      entries.push({
        srcAbs:    path.join(wsPath, source.dir, relFile),
        repoRel:   path.join('shared', 'skills', relFile),
        plainRel:  path.join('shared', 'skills', relFile),
        encrypt:   false,
        agentName: 'shared',
      });
    }
  }

  // ── shared MCP：从各 agent 的 JSON 中提取 mcpServers ──────
  for (const source of shared.mcp.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const wsPath   = expandHome(p.workspacePath);
    const srcPath  = path.join(wsPath, source.src);
    const repoName = `mcp/${source.agent}-${source.field}.json`;
    entries.push({
      srcAbs:    srcPath,
      repoRel:   path.join('shared', repoName + '.enc'),
      plainRel:  path.join('shared', repoName),
      encrypt:   true,
      agentName: 'shared',
      jsonExtract: {
        fields:       [source.field],
        originalPath: srcPath,
      },
    });
  }

  // ── shared syncFiles ───────────────────────────────────────
  for (const item of shared.syncFiles) {
    const wsPath = expandHome(item.workspacePath);
    const suffix = item.encrypt ? '.enc' : '';
    entries.push({
      srcAbs:    path.join(wsPath, item.src),
      repoRel:   path.join('shared', item.src + suffix),
      plainRel:  path.join('shared', item.src),
      encrypt:   item.encrypt,
      agentName: 'shared',
    });
  }

  return entries;
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
  const profiles = cfg.profiles.default;

  // per-agent 条目
  for (const name of AGENT_NAMES) {
    const p = profiles[name];
    if (!p.enabled || (agent && agent !== name)) continue;
    entries.push(...buildAgentEntries(name, p, repoDirBase));
  }

  // shared 条目（--agent 过滤时不包含 shared，因为 shared 不属于任何单一 agent）
  if (!agent) {
    entries.push(...buildSharedEntries(cfg, repoDirBase));
  }

  return deduplicateEntries(entries);
}

/**
 * 将 shared 内容（skills、MCP 配置）分发到各 agent 的本地目录。
 * push 前调用，确保各 agent 在推送前已获得最新共享资源。
 */
function distributeShared(cfg: WangchuanConfig): void {
  const shared = cfg.shared;
  if (!shared) return;
  const profiles = cfg.profiles.default;

  // ── 分发 skills：从每个 source 收集，只添加对方完全没有的新 skill ──
  // 收集各 agent 当前拥有的 skill 集合
  const agentSkills = new Map<string, Map<string, string>>(); // agent → relPath → absPath
  for (const source of shared.skills.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const skillsDir = path.join(expandHome(p.workspacePath), source.dir);
    const skills = new Map<string, string>();
    if (fs.existsSync(skillsDir)) {
      for (const relFile of walkDir(skillsDir)) {
        if (path.basename(relFile).startsWith('.')) continue;
        skills.set(relFile, path.join(skillsDir, relFile));
      }
    }
    agentSkills.set(source.agent, skills);
  }

  // 合并所有 agent 的 skill（去重，先出现者优先）
  const allSkills = new Map<string, string>();
  for (const skills of agentSkills.values()) {
    for (const [rel, abs] of skills) {
      if (!allSkills.has(rel)) allSkills.set(rel, abs);
    }
  }

  // 分发：只把某 agent 缺少的 skill 复制过去（skill 存在于全局集合中）
  for (const source of shared.skills.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const mySkills  = agentSkills.get(source.agent)!;
    const skillsDir = path.join(expandHome(p.workspacePath), source.dir);
    for (const [relFile, srcAbs] of allSkills) {
      if (mySkills.has(relFile)) continue; // 已有，不覆盖
      const dest = path.join(skillsDir, relFile);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(srcAbs, dest);
      logger.debug(`  distribute skill / 分发 skill: ${relFile} → ${source.agent}`);
    }
  }

  // ── 分发 MCP 配置：从每个 source 提取，merge 到其他 agent ──
  const mergedMcp: Record<string, unknown> = {};
  for (const source of shared.mcp.sources) {
    const p = profiles[source.agent];
    if (!p.enabled) continue;
    const srcPath = path.join(expandHome(p.workspacePath), source.src);
    if (!fs.existsSync(srcPath)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Record<string, unknown>;
      const mcpField = json[source.field];
      if (mcpField && typeof mcpField === 'object') {
        Object.assign(mergedMcp, mcpField);
      }
    } catch { /* 忽略解析失败 */ }
  }
  // 写回到每个 source agent 的 MCP 配置（文件不存在时创建）
  if (Object.keys(mergedMcp).length > 0) {
    for (const source of shared.mcp.sources) {
      const p = profiles[source.agent];
      if (!p.enabled) continue;
      const srcPath = path.join(expandHome(p.workspacePath), source.src);
      try {
        let json: Record<string, unknown> = {};
        if (fs.existsSync(srcPath)) {
          json = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Record<string, unknown>;
        }
        const currentMcp = (json[source.field] ?? {}) as Record<string, unknown>;
        // 只添加本地没有的 MCP server，不覆盖已有配置
        let changed = false;
        for (const [key, val] of Object.entries(mergedMcp)) {
          if (!(key in currentMcp)) {
            currentMcp[key] = val;
            changed = true;
          }
        }
        if (changed) {
          json[source.field] = currentMcp;
          fs.mkdirSync(path.dirname(srcPath), { recursive: true });
          fs.writeFileSync(srcPath, JSON.stringify(json, null, 2), 'utf-8');
          logger.debug(`  distribute MCP servers / 分发 MCP servers → ${source.agent}`);
        }
      } catch { /* 忽略 */ }
    }
  }
}

/**
 * 清理 repo 中的过期文件 — repo 有但当前 entries 中不包含的条目删除。
 * 仅清理 agents/ 和 shared/ 目录下的文件（不删 .git 等）。
 */
function pruneRepoStaleFiles(repoPath: string, entries: FileEntry[]): string[] {
  const activeRepoRels = new Set(entries.map(e => e.repoRel));
  const deleted: string[] = [];

  for (const topDir of ['agents', 'shared']) {
    const scanRoot = path.join(repoPath, topDir);
    if (!fs.existsSync(scanRoot)) continue;

    for (const relFile of walkDir(scanRoot)) {
      if (path.basename(relFile).startsWith('.')) continue;
      const repoRel = path.join(topDir, relFile);
      if (!activeRepoRels.has(repoRel)) {
        const abs = path.join(repoPath, repoRel);
        fs.unlinkSync(abs);
        deleted.push(repoRel);
        logger.debug(`  repo prune stale / repo 清理过期文件: ${repoRel}`);

        // 清理空目录
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
  }
  return deleted;
}

export const syncEngine = {
  expandHome,
  buildFileEntries,

  /**
   * 推送前：先分发 shared 内容到各 agent，再收集文件到 repo。
   */
  async stageToRepo(cfg: WangchuanConfig, agent?: AgentName): Promise<StageResult> {
    // 推送全部时，先分发 shared 资源到各 agent
    if (!agent) {
      distributeShared(cfg);
    }
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, undefined, agent);
    const result: StageResult = { synced: [], skipped: [], encrypted: [], deleted: [] };

    for (const entry of entries) {
      if (!fs.existsSync(entry.srcAbs)) {
        logger.debug(`Skipping (not found) / 跳过（不存在）: ${entry.srcAbs}`);
        (result.skipped as string[]).push(entry.srcAbs);
        continue;
      }

      const destAbs = path.join(repoPath, entry.repoRel);
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });

      // ── JSON 字段级提取 ─────────────────────────────────────
      if (entry.jsonExtract) {
        try {
          const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
          const partial  = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
          const content  = JSON.stringify(partial, null, 2);

          if (entry.encrypt) {
            const encrypted = cryptoEngine.encryptString(content, keyPath);
            fs.writeFileSync(destAbs, encrypted, 'utf-8');
            (result.encrypted as string[]).push(entry.repoRel);
          } else {
            fs.writeFileSync(destAbs, content, 'utf-8');
          }
          (result.synced as string[]).push(entry.repoRel);
        } catch (err) {
          logger.warn(`Skipping JSON field extraction (parse error) / 跳过 JSON 字段提取（解析失败）: ${entry.srcAbs} — ${(err as Error).message}`);
          (result.skipped as string[]).push(entry.repoRel);
        }
        continue;
      }

      // ── 整文件同步（原有逻辑） ────────────────────────────────
      if (!entry.encrypt) {
        const content = fs.readFileSync(entry.srcAbs, 'utf-8');
        if (validator.containsSensitiveData(content)) {
          logger.warn(`⚠  Possible plaintext sensitive data detected / 检测到疑似明文敏感信息: ${entry.srcAbs}`);
          logger.warn(`   Consider setting encrypt:true in config / 建议标记为 encrypt:true`);
        }
      }
      if (entry.encrypt) {
        cryptoEngine.encryptFile(entry.srcAbs, destAbs, keyPath);
        (result.encrypted as string[]).push(entry.repoRel);
      } else {
        fs.copyFileSync(entry.srcAbs, destAbs);
      }
      (result.synced as string[]).push(entry.repoRel);
    }

    // ── 清理 repo 中的过期文件（全量 push 时） ──────────────────
    // 只用实际写入 repo 的条目做 prune，排除本地不存在的 skipped 条目
    if (!agent) {
      const syncedEntries = entries.filter(e => fs.existsSync(e.srcAbs));
      const pruned = pruneRepoStaleFiles(repoPath, syncedEntries);
      (result.deleted as string[]).push(...pruned);
    }

    return result;
  },

  async restoreFromRepo(cfg: WangchuanConfig, agent?: AgentName): Promise<RestoreResult> {
    const repoPath = expandHome(cfg.localRepoPath);
    const keyPath  = expandHome(cfg.keyPath);
    const entries  = buildFileEntries(cfg, repoPath, agent);
    const result: RestoreResult = { synced: [], skipped: [], decrypted: [], conflicts: [], localOnly: [] };

    let batchDecision: 'overwrite_all' | 'skip_all' | undefined;

    for (const entry of entries) {
      const srcRepo = path.join(repoPath, entry.repoRel);
      if (!fs.existsSync(srcRepo)) {
        // repo 没有但本地有 → 记录为 localOnly
        // jsonFields 条目：srcAbs 是完整 JSON（总是存在），需检查提取字段是否非空
        if (entry.jsonExtract) {
          try {
            const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
            const extracted = jsonField.extractFields(fullJson, entry.jsonExtract.fields);
            if (Object.keys(extracted).length > 0) {
              (result.localOnly as string[]).push(entry.repoRel);
            }
          } catch { /* JSON 解析失败则忽略 */ }
        } else if (fs.existsSync(entry.srcAbs)) {
          (result.localOnly as string[]).push(entry.repoRel);
        }
        logger.debug(`Skipping (not in repo) / 跳过（仓库中不存在）: ${entry.repoRel}`);
        (result.skipped as string[]).push(entry.repoRel);
        continue;
      }

      // ── JSON 字段级 merge-back ────────────────────────────────
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

        // 读取本地完整 JSON，merge 进去（不破坏其他字段）
        const targetPath = entry.jsonExtract.originalPath;
        let fullJson: Record<string, unknown> = {};
        if (fs.existsSync(targetPath)) {
          fullJson = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as Record<string, unknown>;
        }
        const merged = jsonField.mergeFields(fullJson, partial);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2), 'utf-8');

        // shared MCP 条目：同时分发到所有其他 agent
        if (entry.agentName === 'shared' && cfg.shared) {
          for (const source of cfg.shared.mcp.sources) {
            const p = cfg.profiles.default[source.agent];
            if (!p.enabled) continue;
            const otherPath = path.join(expandHome(p.workspacePath), source.src);
            if (otherPath === targetPath) continue; // 已处理
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
        continue;
      }

      // ── shared skills 分发到各 agent ──────────────────────────
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
        continue;
      }

      // ── 冲突检测（整文件同步） ────────────────────────────────
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

          if (batchDecision === 'skip_all') {
            logger.info(`  ↷ Skipped (keep local) / 跳过（保留本地）: ${entry.repoRel}`);
            (result.skipped as string[]).push(entry.repoRel);
            continue;
          }
          if (batchDecision !== 'overwrite_all') {
            const ans = await askConflict(entry.repoRel);
            if (ans === 'skip' || ans === 'skip_all') {
              if (ans === 'skip_all') batchDecision = 'skip_all';
              logger.info(`  ↷ Skipped (keep local) / 跳过（保留本地）: ${entry.repoRel}`);
              (result.skipped as string[]).push(entry.repoRel);
              continue;
            }
            if (ans === 'overwrite_all') batchDecision = 'overwrite_all';
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
      (result.synced as string[]).push(entry.repoRel);
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

      // JSON 字段提取时，比较提取后的内容
      if (entry.jsonExtract) {
        try {
          const fullJson = JSON.parse(fs.readFileSync(entry.srcAbs, 'utf-8')) as Record<string, unknown>;
          const localPartial = JSON.stringify(jsonField.extractFields(fullJson, entry.jsonExtract.fields), null, 2);

          let repoContent: string;
          if (entry.encrypt) {
            repoContent = cryptoEngine.decryptString(
              fs.readFileSync(path.join(repoPath, entry.repoRel), 'utf-8').trim(), keyPath,
            );
          } else {
            repoContent = fs.readFileSync(path.join(repoPath, entry.repoRel), 'utf-8');
          }
          if (localPartial !== repoContent) {
            (diff.modified as string[]).push(entry.repoRel);
          }
        } catch {
          (diff.modified as string[]).push(entry.repoRel);
        }
        continue;
      }

      // 整文件比较
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
