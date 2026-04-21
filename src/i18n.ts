/**
 * i18n.ts — Internationalization core module
 *
 * Provides language switching (zh/en) for all CLI messages.
 * Language priority: WANGCHUAN_LANG env > config.json lang field > default 'zh'
 *
 * Zero dependencies on other project modules to avoid circular imports.
 * Reads config.json directly via fs.
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';

export type Lang = 'zh' | 'en';

const CONFIG_PATH = path.join(os.homedir(), '.wangchuan', 'config.json');

let cachedLang: Lang | undefined;

export function getLang(): Lang {
  if (cachedLang !== undefined) return cachedLang;

  const env = process.env['WANGCHUAN_LANG'];
  if (env === 'en' || env === 'zh') { cachedLang = env; return env; }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const cfg = JSON.parse(raw) as { lang?: string };
    if (cfg.lang === 'en' || cfg.lang === 'zh') { cachedLang = cfg.lang; return cfg.lang; }
  } catch { /* config not found or invalid — use default */ }

  cachedLang = 'zh';
  return 'zh';
}

export function setLang(lang: Lang): void {
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
  }
  cfg['lang'] = lang;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
  cachedLang = lang;
}

/** Reset lang cache (for testing or after external config changes) */
export function resetLangCache(): void { cachedLang = undefined; }

// ─── Message Dictionary ────────────────────────────────────────
// Format: [english, chinese]
type Msgs = Record<string, readonly [string, string]>;

const M: Msgs = {
  // ── CLI ──────────────────────────────────────────────────────
  'cli.description':     ['Wangchuan · AI Memory Sync System', '忘川 · AI 记忆同步系统'],
  'cli.invalidAgent':    ['--agent must be a built-in agent (openclaw | claude | gemini | codebuddy | workbuddy | cursor | codex) or a custom agent defined in config.json, got: {val}', '--agent 必须是内置代理 (openclaw | claude | gemini | codebuddy | workbuddy | cursor | codex) 或 config.json 中定义的自定义代理名称，收到: {val}'],
  'cli.cmd.init':        ['Initialize Wangchuan, configure repo and generate key', '初始化忘川，配置仓库并生成密钥'],
  'cli.cmd.init.repo':   ['Git repo URL (SSH or HTTPS)', 'Git 仓库地址'],
  'cli.cmd.init.key':    ['Import existing master key (hex string)', '导入已有的主密钥（十六进制字符串）'],
  'cli.cmd.init.force':  ['Force re-init (overwrite existing config)', '强制重新初始化'],
  'cli.cmd.agent':       ['Filter by agent (openclaw|claude|gemini|codebuddy|workbuddy|cursor|codex)', '只操作指定智能体 (openclaw|claude|gemini|codebuddy|workbuddy|cursor|codex)'],
  'cli.cmd.status':      ['Show sync state at a glance (--verbose for full detail)', '一览同步状态（--verbose 查看完整详情）'],
  'cli.cmd.status.verbose': ['Show full detail: file list, diff, history, health breakdown', '显示完整详情：文件清单、差异、历史、健康评分'],
  'cli.cmd.lang':        ['Set display language (zh|en)', '设置显示语言 (zh|en)'],
  'cli.cmd.sync':        ['Smart bidirectional sync (pull if needed, then push)', '智能双向同步（有更新先拉取，再推送）'],
  'cli.cmd.watch':       ['Watch for file changes and auto-sync', '监听文件变更并自动同步'],
  'cli.cmd.watch.interval': ['Poll interval in minutes (default: 5)', '轮询间隔，单位分钟（默认: 5）'],

  // ── lang command ────────────────────────────────────────────
  'lang.current':  ['Current language: {lang}', '当前语言: {lang}'],
  'lang.switched': ['Language set to {lang}', '语言已切换为 {lang}'],
  'lang.invalid':  ['Invalid language, use: zh | en', '无效的语言选项，请使用: zh | en'],

  // ── init ────────────────────────────────────────────────────
  'init.banner':          ['Wangchuan Init', '忘川初始化'],
  'init.invalidGitUrl':   ['Invalid Git URL: {repo}', '无效的 Git 地址: {repo}'],
  'init.alreadyInit':     ['Already initialized (repo: {repo})', '忘川已初始化 (repo: {repo})'],
  'init.useForce':        ['Use --force to re-initialize', '如需重新初始化，请使用 --force 参数'],
  'init.writingConfig':   ['Writing config …', '写入配置 …'],
  'init.configSaved':     ['Config saved: {path}', '配置已写入: {path}'],
  'init.invalidKey':      ['Invalid key format, expected 64 hex chars (256-bit)', '密钥格式无效，需要 64 位十六进制字符'],
  'init.keyImported':     ['Master key imported: {path}', '主密钥已导入: {path}'],
  'init.generatingKey':   ['Generating AES-256-GCM master key …', '生成主密钥 …'],
  'init.keyGenerated':    ['Master key generated: {path}', '主密钥已生成: {path}'],
  'init.keyExists':       ['Master key exists, skipping: {path}', '主密钥已存在: {path}'],
  'init.cloningRepo':     ['Cloning repo: {repo} …', '克隆仓库: {repo} …'],
  'init.repoReady':       ['Repo ready: {path}', '仓库已就绪: {path}'],
  'init.cloneFailed':     ['Clone failed', '克隆仓库失败'],
  'init.gitFailed':       ['Git operation failed: {error}', 'Git 操作失败: {error}'],
  'init.complete':        ['Wangchuan initialized!', '忘川初始化完成！'],
  'init.detectedAgents':  ['Auto-detected agents: {agents}', '自动检测到的 Agent: {agents}'],
  'init.noAgentsDetected': ['No agents detected — enable agents manually via config.json', '未检测到已安装的 Agent，请手动在 config.json 中启用'],
  'init.autoSync':        ['Running first sync...', '正在执行首次同步...'],
  'init.autoSyncDone':    ['First sync completed', '首次同步完成'],
  'init.autoSyncFailed':  ['First sync failed (you can retry with wangchuan sync): {error}', '首次同步失败（可稍后执行 wangchuan sync 重试）: {error}'],
  'init.syncHint':        ['Run `wangchuan sync` when ready to push local data to cloud', '准备好后运行 `wangchuan sync` 将本地数据推送到云端'],
  'init.nextPull':        ['Next: wangchuan sync  (sync memories across environments)', '下一步: wangchuan sync  (同步记忆到各环境)'],
  'init.nextPush':        ['              wangchuan status  (check sync state)', '              wangchuan status  (查看同步状态)'],

  // ── push (used by sync) ──────────────────────────────────────
  'push.unchangedSummary':     ['({count} unchanged, skipped)', '（{count} 个未变更，已跳过）'],

  // ── status ──────────────────────────────────────────────────
  'status.banner':         ['Wangchuan · Status', '忘川 · 同步状态'],
  'status.repo':           ['Repo:   ', '仓库地址：'],
  'status.local':          ['Local:  ', '本地路径：'],
  'status.branch':         ['Branch: ', '分支：  '],
  'status.env':            ['Env:    ', '环境：  '],
  'status.agent':          ['Agent:  ', '过滤智能体：'],
  'status.recentCommits':  ['Recent commits:', '最近提交：'],
  'status.cannotReadLog':  ['Cannot read git log (repo may not be cloned)', '无法读取 git 日志'],
  'status.uncommitted':    ['Uncommitted changes:', '本地仓库（未提交变更）：'],
  'status.inSync':         ['Local repo in sync with remote', '本地仓库与远端保持一致'],
  'status.noSync':         ['Workspace matches repo, no sync needed', '工作区与仓库一致，无需同步'],
  'status.workspaceDiff':  ['Workspace diff:', '工作区差异：'],
  'status.newTag':         ['(new, will sync on push)', '(本地新增)'],
  'status.modifiedTag':    ['(modified)', '(已修改)'],
  'status.missingTag':     ['(missing, will restore on pull)', '(本地缺失)'],
  'status.addedLabel':     ['added', '新增'],
  'status.modifiedLabel':  ['modified', '修改'],
  'status.missingLabel':   ['missing', '缺失'],
  'status.diffFailed':     ['Diff analysis failed: {error}', '差异分析失败: {error}'],
  'status.healthLabel':    ['Health: ', '健康度：'],
  'status.lastSync':       ['Last sync:', '上次同步：'],
  'status.syncHint':       ['Run `wangchuan sync` to synchronize', '执行 `wangchuan sync` 同步'],
  'status.verboseHint':    ['Run `wangchuan status -v` for full detail', '执行 `wangchuan status -v` 查看完整详情'],
  'status.historyLabel':   ['Recent sync history:', '最近同步历史：'],
  'status.lockActive':     ['Sync in progress (PID: {pid}, started: {startedAt})', '同步进行中 (PID: {pid}, 开始于: {startedAt})'],
  'status.lockStale':      ['Stale sync lock detected (PID {pid} is dead). Run `wangchuan doctor` to clean up', '检测到过期同步锁 (PID {pid} 已终止)，执行 `wangchuan doctor` 清理'],
  'status.inventory':      ['Config inventory ({count} items):', '配置文件清单（{count} 项）：'],
  'status.fieldLabel':     ['[field]', '[字段]'],

  // ── diff (used by status) ────────────────────────────────────
  'diff.newFile':        ['(new, not in repo)', '(新增，仓库中不存在)'],
  'diff.missingFile':    ['(missing locally)', '(本地缺失)'],
  'diff.cannotDecrypt':  ['[encrypted, cannot decrypt]', '[加密文件，无法解密比较]'],
  'diff.noDiff':         ['All files match repo, no diff', '所有文件与仓库一致，无差异'],
  'diff.filesDiffer':    ['{count} files differ', '{count} 个文件有差异'],

  // ── list ────────────────────────────────────────────────────
  'list.banner':       ['Wangchuan · List', '忘川 · 配置清单'],
  'list.tierShared':   ['Shared (cross-agent)', '共享（跨 Agent）'],
  'list.localLabel':   ['local', '本地'],
  'list.repoLabel':    ['repo', '仓库'],
  'list.fieldLabel':   ['[field]', '[字段]'],
  'list.totalFiles':   ['{count} config files', '共 {count} 个配置文件'],
  'list.legend':       ['✔ = exists  · = not in repo  [enc] = encrypted  [field] = JSON field extraction', '✔ = 存在  · = 仓库中尚无  [enc] = 加密  [字段] = JSON 字段提取'],

  // ── validator ───────────────────────────────────────────────
  'validator.notInit': ['Wangchuan not initialized, run: wangchuan init --repo <url>', '忘川尚未初始化，请执行: wangchuan init --repo <url>'],

  // ── prompt ──────────────────────────────────────────────────
  'prompt.conflict':        ['Conflict: {file}', '冲突: {file}'],
  'prompt.conflictDesc':    ['Local file exists and differs.', '本地文件已存在且内容不同。'],
  'prompt.conflictChoices': ['[o] Overwrite  [s] Skip  [A] Overwrite all  [S] Skip all', '[o] 覆盖  [s] 跳过  [A] 全部覆盖  [S] 全部跳过'],
  'prompt.choose':          ['Choose [{choices}]: ', '请选择 [{choices}]: '],

  // ── migrate ─────────────────────────────────────────────────
  'migrate.incomplete':        ['Incomplete migration detected, rolling back from backup …', '检测到上次迁移未完成，正在回滚 …'],
  'migrate.rolledBack':        ['Rolled back from backup, restarting migration', '已从备份回滚，重新开始迁移'],
  'migrate.backingUp':         ['Backing up old repo structure …', '备份旧 repo 结构 …'],
  'migrate.validationFailed':  ['Migration validation failed: {path} not found', '迁移校验失败: {path} 不存在'],
  'migrate.failed':            ['Migration failed: {error}', '迁移失败: {error}'],
  'migrate.rollingBack':       ['Rolling back from backup …', '正在从备份回滚 …'],
  'migrate.rolledBackOk':      ['Rolled back to pre-migration state', '已回滚到迁移前状态'],
  'migrate.rollbackFailed':    ['Rollback failed: {error}', '回滚失败: {error}'],
  'migrate.manualRestore':     ['Please manually restore from {path}', '请手动从 {path} 恢复'],
  'migrate.detecting':         ['Detected v{from} config, migrating to v{to} …', '检测到 v{from} 配置，正在迁移至 v{to} …'],
  'migrate.complete':          ['Config migration complete', '配置迁移完成'],
  'migrate.backedUp':          ['Old data backed up to {path}/backup-v1/', '旧数据已备份到 {path}/backup-v1/'],
  'migrate.profilesReconciled': ['Agent profiles updated to match latest definitions', '智能体配置已更新至最新定义'],

  // ── sync (debug) ────────────────────────────────────────────
  'sync.distributeSkill':  ['distribute skill: {file} → {agent}', '分发 skill: {file} → {agent}'],
  'sync.distributeAgent':  ['distribute agent: {file} → {agent}', '分发 agent: {file} → {agent}'],
  'sync.distributeMcp':    ['distribute MCP servers → {agent}', '分发 MCP servers → {agent}'],
  'sync.pruneStale':       ['repo prune stale: {file}', 'repo 清理过期文件: {file}'],
  'sync.pruneCandidate':   ['  will delete: {file}', '  待删除: {file}'],
  'sync.pendingDeletions': ['{count} files were removed locally and pending deletion from cloud:', '有 {count} 个文件在本地已删除，等待确认是否从云端删除：'],
  'sync.pendingConflicts':         ['{count} conflict(s) detected by watch daemon — please review:', '监听守护进程检测到 {count} 个冲突 — 请检查：'],
  'sync.pendingConflictDetectedAt':['detected at {time}', '发现于 {time}'],
  'sync.pendingConflictLocal':     ['Local', '本地'],
  'sync.pendingConflictRemote':    ['Remote', '云端'],
  'sync.confirmDelete':    ['Delete these files from cloud? [Y/n] ', '确认从云端删除这些文件？[Y/n] '],
  'sync.deletionConfirmed':['Deleted {count} stale files from cloud', '已从云端删除 {count} 个过期文件'],
  'sync.deletionSkipped':  ['Deletion skipped, files kept in cloud', '跳过删除，文件保留在云端'],
  'sync.deletionDeferred': ['{count} pending deletions saved — confirm next time you run sync interactively', '{count} 个待删除文件已记录，下次交互式运行 sync 时确认'],
  'sync.skillDeletedFrom':    ['Skill "{file}" was deleted from: {agents}', '技能 "{file}" 已从以下 agent 中删除: {agents}'],
  'sync.skillStillIn':        ['Still present in: {agents}', '仍存在于: {agents}'],
  'sync.skillDeleteChoices':  ['Also delete from these agents?', '是否也从这些 agent 中删除？'],
  'sync.skillDeleteAll':      ['delete from all agents', '从全部 agent 中删除'],
  'sync.skillDeleteNone':     ['keep in all agents', '在所有 agent 中保留'],
  'sync.skillDeletePrompt':   ['Enter numbers (comma-separated), or "0" for all: ', '输入编号（逗号分隔），或输入 "0" 选择全部: '],
  'sync.skillDeletedFromAgent': ['Deleted {file} from {agent}', '已从 {agent} 删除 {file}'],
  'sync.skillDeleteKept':     ['Skill kept in all agents', '技能在所有 agent 中保留'],
  'sync.agentDeletedFrom':    ['Agent definition "{file}" was deleted from: {agents}', 'Agent 定义 "{file}" 已从以下 agent 中删除: {agents}'],
  'sync.agentStillIn':        ['Still present in: {agents}', '仍存在于: {agents}'],
  'sync.agentDeletedFromAgent': ['Deleted {file} from {agent}', '已从 {agent} 删除 {file}'],
  'sync.agentDeleteKept':     ['Agent definition kept in all agents', 'Agent 定义在所有 agent 中保留'],
  // ── Unified pending distribution prompts ──────────────────────
  'sync.pendingDistributions':  ['{count} cross-agent changes detected:', '检测到 {count} 个跨 agent 变更：'],
  'sync.distItem':              ['[{kind}] [{action}] "{file}" from {source}', '[{kind}] [{action}] "{file}" 来自 {source}'],
  'sync.distPrompt':            ['Distribute to which agents?', '分发到哪些 agent？'],
  'sync.distAll':               ['all agents', '全部 agent'],
  'sync.distNone':              ['skip (don\'t distribute)', '跳过（不分发）'],
  'sync.distInputPrompt':       ['Enter numbers (comma-separated), or "0" for all: ', '输入编号（逗号分隔），或输入 "0" 选择全部: '],
  'sync.distApplied':           ['{action} {file} → {agent}', '{action} {file} → {agent}'],
  'sync.distSkipped':           ['Skipped (not distributed)', '已跳过（未分发）'],
  'sync.distRegistered':        ['Registered "{name}" as shared resource', '已注册 "{name}" 为共享资源'],
  'sync.distDeleteApplied':     ['Deleted "{name}" from {count} agent(s)', '已从 {count} 个 agent 中删除 "{name}"'],
  'sync.pendingNotice':         ['⚠ {count} pending action(s) require your attention. Run `wangchuan sync` to review.', '⚠ 有 {count} 项待处理操作需要确认。执行 `wangchuan sync` 查看详情。'],
  'sync.skipNotFound':     ['Skipping (not found): {path}', '跳过（不存在）: {path}'],
  'sync.skipJsonParse':    ['Skipping JSON field extraction (parse error): {path} — {error}', '跳过 JSON 字段提取（解析失败）: {path} — {error}'],
  'sync.sensitiveData':    ['Possible plaintext sensitive data detected: {path}', '检测到疑似明文敏感信息: {path}'],
  'sync.suggestEncrypt':   ['Consider setting encrypt:true in config', '建议标记为 encrypt:true'],
  'sync.skipNotInRepo':    ['Skipping (not in repo): {file}', '跳过（仓库中不存在）: {file}'],
  'sync.skippedKeepLocal': ['Skipped (keep local): {file}', '跳过（保留本地）: {file}'],

  // ── sync command ──────────────────────────────────────────────
  'sync.banner':              ['Wangchuan · Sync', '忘川 · 双向同步'],
  'sync.filterAgent':         ['Filter agent: {agent}', '过滤智能体: {agent}'],
  'sync.fetching':            ['Fetching remote …', '检查远端更新 …'],
  'sync.remoteAhead':         ['Remote is {count} commits ahead', '远端领先 {count} 个提交'],
  'sync.remoteUpToDate':      ['Remote is up to date', '远端无新提交'],
  'sync.fetchFailed':         ['Fetch failed', '检查远端失败'],
  'sync.fetchFailedDetail':   ['Fetch failed: {error}', '检查远端失败: {error}'],
  'sync.pulling':             ['Pulling remote changes …', '拉取远端变更 …'],
  'sync.pulled':              ['Remote changes pulled', '远端变更已拉取'],
  'sync.pullFailed':          ['Pull failed', '拉取失败'],
  'sync.pullFailedDetail':    ['Pull failed: {error}', '拉取失败: {error}'],
  'sync.restoreFailed':       ['Restore failed: {error}', '还原失败: {error}'],
  'sync.pullSummary':         ['Pulled {count} files ({encrypted} encrypted)', '拉取 {count} 个文件（{encrypted} 个加密）'],
  'sync.staging':             ['Encrypting and staging files …', '加密并准备配置文件 …'],
  'sync.staged':              ['Staged {count} files', '已准备 {count} 个文件'],
  'sync.stagingFailed':       ['Staging failed', '暂存文件失败'],
  'sync.stagingFailedDetail': ['Staging failed: {error}', '准备文件失败: {error}'],
  'sync.commitMsg':           ['sync: auto-sync {tag}[{host}]', 'sync: 自动同步 {tag}[{host}]'],
  'sync.pushing':             ['Committing and pushing …', '提交并推送 …'],
  'sync.pushed':              ['Pushed to {repo}', '已推送到 {repo}'],
  'sync.nothingToCommit':     ['Nothing to commit (repo is up to date)', '没有变更需要提交'],
  'sync.pushFailed':          ['Push failed, rolling back …', '推送失败，正在回滚 …'],
  'sync.rollbackFailed':      ['Rollback failed: {error}', '回滚失败: {error}'],
  'sync.pushFailedDetail':    ['Push failed: {error}', '推送失败: {error}'],
  'sync.noChanges':           ['No local changes to push', '没有本地变更需要推送'],
  'sync.summaryPull':         ['Pulled {count} files from remote', '从远端拉取 {count} 个文件'],
  'sync.summaryPush':         ['Pushed {count} files, commit: {sha}', '推送 {count} 个文件，commit: {sha}'],
  'sync.alreadyInSync':       ['Everything is up to date', '本地与远端已同步，无需操作'],

  // ── watch command ─────────────────────────────────────────────
  'watch.banner':          ['Wangchuan · Watch', '忘川 · 监听模式'],
  'watch.filterAgent':     ['Filter agent: {agent}', '过滤智能体: {agent}'],
  'watch.interval':        ['Poll interval: {minutes} minutes', '轮询间隔: {minutes} 分钟'],
  'watch.triggerSync':     ['[{time}] Pull triggered: {reason}', '[{time}] 触发拉取: {reason}'],
  'watch.syncError':       ['Pull error: {error}', '拉取出错: {error}'],
  'watch.reasonPoll':      ['periodic remote check', '定时远端检查'],
  'watch.shutdown':        ['Shutting down watch daemon …', '正在停止监听 …'],
  'watch.started':         ['Watch daemon started (pull-only mode)', '监听守护进程已启动（仅拉取模式）'],
  'watch.stopHint':        ['Press Ctrl+C to stop', '按 Ctrl+C 停止'],
  'watch.alreadyRunning':  ['Watch daemon already running (PID {pid})', '监听守护进程已在运行 (PID {pid})'],
  'watch.conflictAutoMerged':  ['Auto-merged conflict (no markers): {file}', '自动合并冲突（无冲突标记）: {file}'],
  'watch.conflictNeedsManual': ['Conflict needs manual resolution: {file}', '冲突需手动解决: {file}'],
  'watch.conflictsSaved':      ['{count} conflict(s) saved — will prompt on next interactive sync', '{count} 个冲突已记录 — 下次交互式同步时提示处理'],

  'sync.decryptFailed': ['Decrypt failed (skipped): {path} — {error}', '解密失败（已跳过）: {path} — {error}'],

  // ── sync-meta ─────────────────────────────────────────────────
  'sync.meta.lastSync':   ['Last synced: {time} from {hostname} ({env})', '上次同步: {time}，来自 {hostname}（{env}）'],
  'sync.meta.staleDays':  ['Warning: repo data is {days} days old', '警告: 仓库数据已有 {days} 天未更新'],

  // ── dry-run ───────────────────────────────────────────────────
  'dryRun.enabled':       ['Dry-run mode: no changes will be committed or pushed', '预览模式: 不会提交或推送任何变更'],
  'dryRun.wouldSync':     ['Would sync {count} files ({encrypted} encrypted)', '将同步 {count} 个文件（{encrypted} 个加密）'],
  'dryRun.wouldPrune':    ['Would prune {count} stale files', '将清理 {count} 个过期文件'],
  'dryRun.wouldCommit':   ['Would commit and push to {repo}', '将提交并推送到 {repo}'],
  'dryRun.nothingToSync': ['Nothing to sync', '没有需要同步的内容'],
  'cli.cmd.dryRun':       ['Preview changes without committing or pushing', '预览变更，不实际提交或推送'],
  'cli.cmd.sync.only':    ['Only sync files matching these patterns', '仅同步匹配指定模式的文件'],
  'cli.cmd.sync.exclude': ['Exclude files matching these patterns', '排除匹配指定模式的文件'],
  'cli.cmd.sync.yes':     ['Auto-confirm all prompts (deletions, distributions)', '自动确认所有提示（删除、分发）'],

  // ── conflict detection in status ──────────────────────────
  'status.conflictWarning':  ['Potential sync conflicts detected:', '检测到潜在同步冲突：'],
  'status.conflictFile':     ['⚠ {file} — modified locally since last sync, remote also updated', '⚠ {file} — 上次同步后本地有修改，远端也有更新'],
  'status.conflictHint':     ['Run wangchuan status -v to inspect, then sync to resolve', '执行 wangchuan status -v 查看详情，然后 sync 解决冲突'],

  // ── colorized sync progress ───────────────────────────────
  'sync.progress.enc':       ['[enc]', '[加密]'],
  'sync.progress.field':     ['[field]', '[字段]'],
  'sync.progress.decrypted': ['[decrypted]', '[解密]'],
  'sync.progress.copy':      ['[copy]', '[复制]'],

  // ── config ──────────────────────────────────────────────────
  'config.loadFailed': ['Failed to load config: {error}', '读取配置失败: {error}'],
  'config.saved':      ['Config saved to {path}', '配置已保存到 {path}'],
  'config.invalidFormat': ['Invalid config: missing required field "{field}"', '配置文件无效: 缺少必需字段 "{field}"'],

  // ── crypto ─────────────────────────────────────────────────
  'crypto.keyNotFound': [
    'Key file not found: {path}\n\n  How to fix:\n  - If you have the key from another machine: wangchuan init --key <hex>\n  - Export from the source machine first:       wangchuan doctor --key-export\n  - Generate a new key (fresh start):           wangchuan init --repo <url>',
    '未找到密钥文件: {path}\n\n  修复方法:\n  - 如果有其他机器的密钥: wangchuan init --key <hex>\n  - 先从源机器导出密钥:   wangchuan doctor --key-export\n  - 生成新密钥（全新开始）: wangchuan init --repo <url>'
  ],
  'crypto.invalidKeyFormat': [
    'Invalid key file format (expected {expected} hex characters).\n\n  The key file may be corrupted. Re-import with: wangchuan init --key <hex>',
    '密钥文件格式无效（应为 {expected} 个十六进制字符）。\n\n  密钥文件可能已损坏。重新导入: wangchuan init --key <hex>'
  ],

  // ── env command ──────────────────────────────────────────────
  'cli.cmd.env':              ['Manage environments (list|create|switch|current|delete)', '管理多环境 (list|create|switch|current|delete)'],
  'cli.cmd.env.from':         ['Base branch to create from (default: current branch)', '创建环境时的基础分支（默认：当前分支）'],
  'env.banner':               ['Wangchuan · Environments', '忘川 · 多环境管理'],
  'env.current':              ['Current environment: {name}', '当前环境: {name}'],
  'env.list.header':          ['Environments:', '环境列表：'],
  'env.list.empty':           ['No environments found', '暂无环境'],
  'env.notFound':             ['Environment not found: {name}', '环境不存在: {name}'],
  'env.alreadyExists':        ['Environment already exists: {name}', '环境已存在: {name}'],
  'env.cannotDeleteCurrent':  ['Cannot delete current environment: {name}', '无法删除当前环境: {name}'],
  'env.cannotDeleteDefault':  ['Cannot delete the default environment', '无法删除 default 环境'],
  'env.created':              ['Environment created: {name}', '环境已创建: {name}'],
  'env.switched':             ['Switched to environment: {name}', '已切换到环境: {name}'],
  'env.switch.syncing':       ['Syncing memories for the new environment …', '正在同步新环境的记忆 …'],
  'env.deleted':              ['Environment deleted: {name}', '环境已删除: {name}'],
  'env.create.creating':      ['Creating environment {name} …', '正在创建环境 {name} …'],
  'env.switch.switching':     ['Switching to environment {name} …', '正在切换到环境 {name} …'],
  'env.switch.syncHint':      ['Run `wangchuan sync` to push changes to this environment', '运行 `wangchuan sync` 将变更推送到此环境'],
  'env.delete.deleting':      ['Deleting environment {name} …', '正在删除环境 {name} …'],
  'env.unknownAction':        ['Unknown action: {action}. Use list|create|switch|current|delete', '未知操作: {action}，请使用 list|create|switch|current|delete'],

  // ── key management (used by doctor) ───────────────────────────
  'key.rotate.start':         ['Rotating master key …', '正在轮换主密钥 …'],
  'key.rotate.decrypting':    ['Decrypting {count} files with old key …', '使用旧密钥解密 {count} 个文件 …'],
  'key.rotate.reencrypting':  ['Re-encrypting with new key …', '使用新密钥重新加密 …'],
  'key.rotate.complete':      ['Key rotation complete: {count} files re-encrypted', '密钥轮换完成: 重新加密 {count} 个文件'],
  'key.rotate.noFiles':       ['No encrypted files found in repo', '仓库中没有加密文件'],
  'key.rotate.failed':        ['Key rotation failed: {error}', '密钥轮换失败: {error}'],
  'key.rotate.rolledBack':    ['Old key restored after failed rotation', '轮换失败，已恢复旧密钥'],
  'doctor.keyRotateHint':     ['Run `wangchuan sync` to push re-encrypted files to cloud', '运行 `wangchuan sync` 将重新加密的文件推送到云端'],
  'key.export.hex':           ['Master key (hex): {hex}', '主密钥（hex）: {hex}'],
  'key.export.warning':       ['Keep this key safe — anyone with it can decrypt your data', '请妥善保管此密钥，持有者可解密所有数据'],
  'key.export.fileHint':       ['Save to file for transfer: wangchuan doctor --key-export > ~/wangchuan-key.txt', '保存到文件以便迁移: wangchuan doctor --key-export > ~/wangchuan-key.txt'],

  // ── integrity checksum ────────────────────────────────────────
  'integrity.writing':        ['Writing integrity checksums …', '写入完整性校验 …'],
  'integrity.verified':       ['Integrity verified: {count} files OK', '完整性校验通过: {count} 个文件'],
  'integrity.mismatch':       ['Integrity mismatch: {file} (possible corruption or tampering)', '完整性校验失败: {file}（可能被篡改或损坏）'],
  'integrity.missingChecksum':['No integrity.json in repo, skipping verification', '仓库中无 integrity.json，跳过校验'],
  'integrity.mismatchCount':  ['Warning: {count} files failed integrity check', '警告: {count} 个文件完整性校验失败'],

  // ── key fingerprint validation ──────────────────────────────────
  'keyFingerprint.notFound':  ['No key fingerprint in repo (first push or legacy), skipping validation', '仓库中无密钥指纹（首次推送或旧版本），跳过校验'],
  'keyFingerprint.verified':  ['Key fingerprint verified ✓', '密钥指纹校验通过 ✓'],
  'keyFingerprint.mismatch':  ['⛔ Key mismatch! Your local master.key does NOT match the key used to encrypt the repo.\n   This likely means you copied the wrong key or are using a different key from another machine.\n   To fix: run `wangchuan doctor --key-export` on the machine that last pushed, and import that key here.\n   Sync aborted to prevent data corruption.', '⛔ 密钥不匹配！本地 master.key 与仓库加密密钥不一致。\n   可能原因：复制了错误的密钥，或使用了另一台机器的密钥。\n   修复方法：在上次推送的机器上执行 `wangchuan doctor --key-export`，将密钥导入到本机。\n   同步已中止，以防止数据损坏。'],
  'keyFingerprint.mismatchWithHint': [
    'Key mismatch: your local key does not match the repo fingerprint.\n\n  This means another machine pushed with a different key.\n  How to fix:\n  - Export the correct key: run `wangchuan doctor --key-export` on the machine that last pushed\n  - Then import here:       wangchuan init --key <hex>',
    '密钥不匹配: 本地密钥与仓库指纹不一致。\n\n  这表示另一台机器使用了不同的密钥推送。\n  修复方法:\n  - 在最后推送的机器上导出密钥: wangchuan doctor --key-export\n  - 然后在此导入:              wangchuan init --key <hex>'
  ],
  'doctor.keyFingerprintOk':  ['Key fingerprint matches repo ✓', '密钥指纹与仓库一致 ✓'],
  'doctor.keyFingerprintFail':['Key fingerprint does NOT match repo — wrong master.key?', '密钥指纹与仓库不一致 — 是否使用了错误的 master.key？'],
  'doctor.keyFingerprintNone':['No key fingerprint in repo (run sync once to generate)', '仓库中无密钥指纹（执行一次 sync 即可生成）'],

  // ── backup before pull ────────────────────────────────────────
  'backup.creating':          ['Backing up {count} files before overwrite …', '覆盖前备份 {count} 个文件 …'],
  'backup.created':           ['Backup saved: {path}', '备份已保存: {path}'],
  'backup.rotated':           ['Rotated old backups (kept {kept}, removed {removed})', '清理旧备份（保留 {kept} 个，删除 {removed} 个）'],

  // ── init (idempotent) ────────────────────────────────────────
  'init.alreadySame':       ['Already initialized with the same repo, nothing to do', '已使用相同仓库初始化，无需操作'],
  'init.differentRepo':     ['Already initialized with a different repo: {existing}', '已使用不同仓库初始化: {existing}'],
  'init.useForceSwitch':    ['Use --force to switch repo', '如需切换仓库请使用 --force'],
  'init.repoMissing':       ['Repo directory missing, re-cloning …', '仓库目录缺失，正在重新克隆 …'],

  // ── sync-lock ──────────────────────────────────────────────────
  'syncLock.anotherRunning':   ['Another sync is running (PID {pid}). If no sync is running, delete ~/.wangchuan/sync-lock.json', '另一个同步正在运行 (PID {pid})。如果没有同步在运行，请删除 ~/.wangchuan/sync-lock.json'],
  'syncLock.staleLock':        ['Stale sync lock found (PID {pid} is dead), cleaning up …', '发现过期同步锁 (PID {pid} 已终止)，正在清理 …'],
  'syncLock.acquired':         ['Sync lock acquired', '同步锁已获取'],
  'syncLock.released':         ['Sync lock released', '同步锁已释放'],
  'syncLock.cleanedDirtyState':['Cleaned dirty git state from interrupted sync', '已清理被中断同步留下的脏状态'],
  'syncLock.cleanFailed':      ['Failed to clean dirty state: {error}', '清理脏状态失败: {error}'],

  // ── doctor command ─────────────────────────────────────────────
  'cli.cmd.doctor':            ['Diagnose and auto-fix issues (always fixes automatically)', '诊断并自动修复问题（自动修复，无需额外参数）'],
  'cli.cmd.doctor.fix':        ['Auto-fix common issues', '自动修复常见问题'],
  'cli.cmd.doctor.keyRotate':  ['Rotate the master encryption key', '轮换主加密密钥'],
  'cli.cmd.doctor.keyExport':  ['Print master key hex for migration', '输出主密钥（用于迁移）'],
  'cli.cmd.doctor.setup':      ['Show one-liner init command for a new machine', '生成新机器初始化命令'],
  'doctor.banner':             ['Wangchuan · Doctor', '忘川 · 健康检查'],
  'doctor.configOk':           ['Config file exists and is valid', '配置文件存在且有效'],
  'doctor.configMissing':      ['Config file not found: {path}', '配置文件未找到: {path}'],
  'doctor.configInvalid':      ['Config file is invalid: {error}', '配置文件无效: {error}'],
  'doctor.keyOk':              ['Master key exists with correct permissions', '主密钥存在且权限正确'],
  'doctor.keyMissing':         ['Master key not found: {path}', '主密钥未找到: {path}'],
  'doctor.keyBadPerms':        ['Master key has insecure permissions (expected 0600): {path}', '主密钥权限不安全 (应为 0600): {path}'],
  'doctor.gitOk':              ['Git is available', 'Git 可用'],
  'doctor.gitMissing':         ['Git is not installed or not in PATH', 'Git 未安装或不在 PATH 中'],
  'doctor.repoOk':             ['Git repo is cloned: {path}', 'Git 仓库已克隆: {path}'],
  'doctor.repoMissing':        ['Git repo not cloned: {path}', 'Git 仓库未克隆: {path}'],
  'doctor.sshOk':              ['Remote repo is accessible', '远端仓库可访问'],
  'doctor.sshFailed':          ['Cannot access remote repo: {error}', '无法访问远端仓库: {error}'],
  'doctor.sshTimeout':         ['Remote access check timed out (10s)', '远端访问检查超时 (10秒)'],
  'doctor.agentOk':            ['Agent {name} workspace exists: {path}', '智能体 {name} 工作区存在: {path}'],
  'doctor.agentMissing':       ['Agent {name} workspace not found: {path}', '智能体 {name} 工作区未找到: {path}'],
  'doctor.lockNone':           ['No stale sync lock', '无过期同步锁'],
  'doctor.lockStale':          ['Stale sync lock found (PID {pid} is dead), run sync to auto-clean', '发现过期同步锁 (PID {pid} 已终止)，执行同步可自动清理'],
  'doctor.lockActive':         ['Active sync lock (PID {pid})', '同步锁活动中 (PID {pid})'],
  'doctor.integrityOk':        ['Integrity checksums match ({count} files)', '完整性校验通过 ({count} 个文件)'],
  'doctor.integrityMissing':   ['No integrity.json in repo', '仓库中无 integrity.json'],
  'doctor.integrityFailed':    ['{count} files failed integrity check', '{count} 个文件完整性校验失败'],
  'doctor.ignoreOk':           ['.wangchuanignore loaded ({count} patterns)', '.wangchuanignore 已加载（{count} 条规则）'],
  'doctor.ignoreNotFound':     ['.wangchuanignore not found (optional)', '.wangchuanignore 未找到（可选）'],

  // ── history (used by status) ────────────────────────────────────
  'history.empty':             ['No sync history found', '暂无同步记录'],

  'doctor.summary':            ['{pass} passed, {warn} warnings, {fail} failed', '{pass} 通过, {warn} 警告, {fail} 失败'],
  'doctor.fixStaleLock':       ['Fixed: removed stale sync lock (PID {pid})', '已修复: 删除过期同步锁 (PID {pid})'],
  'doctor.fixRepoClone':       ['Fixed: re-cloned repo to {path}', '已修复: 重新克隆仓库到 {path}'],
  'doctor.fixRepoCloneFailed': ['Fix failed: could not clone repo — {error}', '修复失败: 无法克隆仓库 — {error}'],
  'doctor.fixKeyPerms':        ['Fixed: set master key permissions to 0600', '已修复: 主密钥权限已设置为 0600'],
  'doctor.fixAgentDir':        ['Fixed: created agent workspace directory {path}', '已修复: 已创建智能体工作区目录 {path}'],
  'doctor.fixAgentEnabled':    ['Fixed: auto-enabled agent {name}', '已修复: 已自动启用智能体 {name}'],
  'doctor.phantomFiles':       ['{count} phantom files (configured but missing locally)', '{count} 个幽灵文件（已配置但本地不存在）'],
  'doctor.dormantFiles':       ['{count} dormant files (long inactive)', '{count} 个休眠文件（长期未活动）'],
  'doctor.staleFiles':         ['{count} stale files (>90d not modified)', '{count} 个过期文件（>90 天未修改）'],
  'doctor.filesHealthy':       ['All managed files are healthy', '所有受管文件状态正常'],

  // ── filter (--only / --exclude) ─────────────────────────────────
  'cli.cmd.only':              ['Only sync files matching patterns (comma-separated)', '仅同步匹配的文件（逗号分隔）'],
  'cli.cmd.exclude':           ['Exclude files matching patterns (comma-separated)', '排除匹配的文件（逗号分隔）'],
  'filter.only':               ['Filter --only: {patterns}', '过滤 --only: {patterns}'],
  'filter.exclude':            ['Filter --exclude: {patterns}', '过滤 --exclude: {patterns}'],

  // ── three-way merge ────────────────────────────────────────────────
  'merge.autoResolved':        ['Auto-merged (no conflicts): {file}', '自动合并（无冲突）: {file}'],
  'merge.conflictsFound':      ['Merge conflicts in {file} — edit to resolve markers', '合并冲突: {file} — 请编辑解决冲突标记'],
  'merge.conflictMarkers':     ['Conflict markers inserted', '已插入冲突标记'],

  // ── setup (used by doctor) ──────────────────────────────────────
  'setup.repoLabel':           ['Repo:  ', '仓库：'],
  'setup.keyLabel':            ['Key:   ', '密钥：'],
  'setup.commandLabel':        ['Run this on the new machine:', '在新机器上执行以下命令：'],
  'setup.keyNotFound':         ['Master key not found: {path}', '主密钥未找到: {path}'],
  'setup.keyFileHint':         ['Save the key to a file: wangchuan doctor --key-export > ~/wangchuan-key.txt', '将密钥保存到文件: wangchuan doctor --key-export > ~/wangchuan-key.txt'],

  // ── snapshot command ──────────────────────────────────────────────
  'cli.cmd.snapshot':          ['Manage sync snapshots (save|list|restore|delete)', '管理同步快照 (save|list|restore|delete)'],
  'cli.cmd.snapshot.limit':    ['Max snapshots to keep (default: 10)', '保留的最大快照数（默认: 10）'],
  'snapshot.banner':           ['Wangchuan · Snapshot', '忘川 · 快照管理'],
  'snapshot.saved':            ['Snapshot saved: {name} ({count} files)', '快照已保存: {name}（{count} 个文件）'],
  'snapshot.restored':         ['Snapshot restored: {name}', '快照已恢复: {name}'],
  'snapshot.pushing':          ['Pushing restored snapshot to cloud …', '正在将恢复的快照推送到云端 …'],
  'snapshot.pushedToCloud':    ['Restored snapshot pushed to cloud — other machines will pull this version', '已推送到云端 — 其他机器下次同步将拉取此版本'],
  'snapshot.restoreHint':      ['Run `wangchuan sync` to push restored state to cloud', '运行 `wangchuan sync` 将恢复的状态推送到云端'],
  'snapshot.deleted':          ['Snapshot deleted: {name}', '快照已删除: {name}'],
  'snapshot.notFound':         ['Snapshot not found: {name}', '快照不存在: {name}'],
  'snapshot.listHeader':       ['Snapshots:', '快照列表：'],
  'snapshot.listEmpty':        ['No snapshots found', '暂无快照'],
  'snapshot.listEntry':        ['{name}  {time}  {count} files  {size}', '{name}  {time}  {count} 个文件  {size}'],
  'snapshot.pruned':           ['Auto-pruned {count} old snapshots (max: {max})', '自动清理 {count} 个旧快照（上限: {max}）'],
  'snapshot.unknownAction':    ['Unknown action: {action}. Use save|list|restore|delete', '未知操作: {action}，请使用 save|list|restore|delete'],
  'snapshot.nameRequired':     ['Snapshot name is required for restore/delete', 'restore/delete 操作需要指定快照名称'],

  // ── webhook ──────────────────────────────────────────────────────
  'webhook.firing':   ['Firing {count} webhook(s) for event: {event}', '触发 {count} 个 webhook，事件: {event}'],
  'webhook.success':  ['Webhook OK: {url} ({status})', 'Webhook 成功: {url} ({status})'],
  'webhook.failed':   ['Webhook failed: {url} — {error}', 'Webhook 失败: {url} — {error}'],

  // ── health (used by status) ──────────────────────────────────────
  'health.freshness':         ['Freshness', '新鲜度'],
  'health.coverage':          ['Coverage', '覆盖率'],
  'health.integrity':         ['Integrity', '完整性'],
  'health.encryption':        ['Encryption', '加密率'],
  'health.overall':           ['Overall', '综合'],

  // ── enhanced prompt ───────────────────────────────────────────
  'prompt.sizeCompare':        ['local: {local} → remote: {remote}', '本地: {local} → 远端: {remote}'],
  'prompt.showDiff':           ['Show full diff', '显示完整差异'],
  'prompt.merge':              ['Attempt merge', '尝试合并'],
  'prompt.moreChanges':        ['{count} more changes …', '还有 {count} 处变更 …'],

  // ── agent discovery ────────────────────────────────────────────
  'doctor.discoveredAgent':      ['Agent {name} workspace found at {path} but agent is disabled — auto-enabling', '智能体 {name} 工作区存在于 {path}，但该智能体已禁用 — 自动启用'],
  'doctor.openclawProfiles':     ['Detected OpenClaw profile: {name} ({path}). Run `wangchuan agent set-path openclaw {path}/workspace` to sync this profile instead.', '检测到 OpenClaw 配置文件: {name} ({path})。执行 `wangchuan agent set-path openclaw {path}/workspace` 来同步该配置。'],
  'status.discoveredAgent':      ['Agent {name} found at {path} but disabled. Run `wangchuan doctor` to auto-enable', '智能体 {name} 存在于 {path}，但已禁用。执行 `wangchuan doctor` 自动启用'],

  // ── hooks ──────────────────────────────────────────────────────
  'hooks.running':           ['Running {count} {type} hooks …', '执行 {count} 个 {type} 钩子 …'],
  'hooks.success':           ['Hook OK: {cmd}', '钩子成功: {cmd}'],
  'hooks.failed':            ['Hook failed (exit {code}): {cmd}', '钩子失败 (退出码 {code}): {cmd}'],

  // ── init wizard ────────────────────────────────────────────────
  'init.wizard.title':         ['Select your Git platform:', '选择你的 Git 平台:'],
  'init.wizard.ghAuto':        ['GitHub (create automatically via gh CLI)', 'GitHub（通过 gh CLI 自动创建）'],
  'init.wizard.github':        ['GitHub (manual URL)', 'GitHub（手动输入地址）'],
  'init.wizard.gitlab':        ['GitLab', 'GitLab'],
  'init.wizard.gitee':         ['Gitee', 'Gitee'],
  'init.wizard.other':         ['Other (enter custom URL)', '其他（输入自定义地址）'],
  'init.wizard.choose':        ['Enter choice [1-{max}]:', '请选择 [1-{max}]:'],
  'init.wizard.enterUrl':      ['Enter Git repo URL', '输入 Git 仓库地址'],
  'init.wizard.example':       ['e.g.', '示例'],
  'init.wizard.invalidChoice': ['Invalid choice', '无效的选择'],

  // ── init interactive ──────────────────────────────────────────
  'init.promptRepo':         ['Enter git repo URL (SSH or HTTPS):', '请输入 Git 仓库地址（SSH 或 HTTPS）:'],
  'init.promptRepoOrCreate': ['Enter git repo URL, or type \'create\' to create one via GitHub CLI:', '请输入 Git 仓库地址，或输入 \'create\' 通过 GitHub CLI 创建:'],
  'init.repoRequired':       ['--repo is required (or run interactively in a terminal)', '需要 --repo 参数（或在终端中交互运行）'],
  'init.ghCreating':         ['Creating private repo via GitHub CLI …', '正在通过 GitHub CLI 创建私有仓库 …'],
  'init.ghCreated':          ['Repo created: {url}', '仓库已创建: {url}'],
  'init.ghParseFailed':      ['Failed to parse repo URL from gh output: {output}', '无法从 gh 输出中解析仓库地址: {output}'],
  'init.ghNotAvailable':     ['GitHub CLI (gh) is not installed or not authenticated', 'GitHub CLI (gh) 未安装或未登录'],
  'init.ghCreateFailed':     ['Failed to create GitHub repo: {error}', '创建 GitHub 仓库失败: {error}'],

  // ── memory command ──────────────────────────────────────────────
  'cli.cmd.memory':            ['Browse and copy memory files across agents (list|show|copy|broadcast)', '浏览和跨智能体复制记忆文件 (list|show|copy|broadcast)'],
  'cli.cmd.memory.file':       ['Filter by file name pattern (substring match)', '按文件名模式过滤（子串匹配）'],
  'memory.banner':             ['Wangchuan · Memory', '忘川 · 记忆浏览'],
  'memory.list.header':        ['Memory files:', '记忆文件：'],
  'memory.list.empty':         ['No memory files found', '未找到记忆文件'],
  'memory.list.agentHeader':   ['Agent: {agent}', '智能体: {agent}'],
  'memory.show.notFound':      ['File not found: {agent}/{file}', '文件不存在: {agent}/{file}'],
  'memory.show.fileList':      ['Available files for {agent}:', '{agent} 的可用文件：'],
  'memory.show.exists':        ['exists', '存在'],
  'memory.show.missing':       ['missing', '缺失'],
  'memory.show.fuzzyHint':     ['File \'{file}\' not found for {agent}. Did you mean: {suggestions}?', '{agent} 下未找到文件 \'{file}\'。你是否想找: {suggestions}?'],
  'memory.show.header':        ['── {agent}/{file} ──', '── {agent}/{file} ──'],
  'memory.copy.done':          ['Copied {count} files from {from} to {to}', '从 {from} 复制 {count} 个文件到 {to}'],
  'memory.copy.overwrite':     ['Overwriting existing file: {file}', '覆盖已存在文件: {file}'],
  'memory.copy.noFiles':       ['No files to copy', '没有可复制的文件'],
  'memory.broadcast.done':     ['Broadcast {count} files from {from} to {agents}', '从 {from} 广播 {count} 个文件到 {agents}'],
  'memory.unknownAction':      ['Unknown action: {action}. Use list|show|copy|broadcast', '未知操作: {action}，请使用 list|show|copy|broadcast'],
  'memory.argsRequired':       ['Arguments required. Usage: wangchuan memory {action} <agent> [file]', '缺少参数。用法: wangchuan memory {action} <agent> [file]'],
  'memory.sameAgent':          ['Source and target agents are the same', '源和目标智能体相同'],

  // ── env create import ──────────────────────────────────────────
  'env.create.importPrompt':   ['Import memories from current environment? [Y/n] ', '从当前环境导入记忆? [Y/n] '],
  'env.create.imported':       ['Memories imported from \'{env}\' environment', '已从 \'{env}\' 环境导入记忆'],
  'env.create.empty':          ['Created empty environment \'{name}\'', '已创建空白环境 \'{name}\''],
  'env.create.clearing':       ['Clearing files for empty environment …', '正在清空文件以创建空白环境 …'],

  // ── status enhancements ────────────────────────────────────────
  'status.lastSyncFrom':       ['Last synced from: {hostname} at {time}', '上次同步来自: {hostname}，时间: {time}'],
  'status.activeMachines':     ['Active machines: {count} ({hosts})', '活跃机器: {count} 台 ({hosts})'],
  'status.watchRunning':       ['Watch daemon: running (PID {pid})', '监听守护进程: 运行中 (PID {pid})'],
  'status.watchNotRunning':    ['Watch daemon: not running — run `wangchuan watch` to start', '监听守护进程: 未运行 — 执行 `wangchuan watch` 启动'],
  'sync.skippedAgents':        ['Skipped agents (not installed): {agents}. Install them and run `wangchuan doctor` to enable.', '跳过的智能体（未安装）: {agents}。安装后执行 `wangchuan doctor` 启用。'],

  // ── restore command ──────────────────────────────────────────────
  'cli.cmd.restore':           ['Restore from cloud (import key + clone repo + pull all data)', '从云端恢复（导入密钥 + 克隆仓库 + 拉取所有数据）'],
  'cli.cmd.restore.key':       ['Master key (hex string or file path)', '主密钥（十六进制字符串或文件路径）'],
  'restore.banner':            ['Wangchuan · Restore', '忘川 · 云端恢复'],
  'restore.repoRequired':     ['--repo is required for restore', '恢复操作需要 --repo 参数'],
  'restore.keyRequired':      ['--key is required for restore (export from source machine: wangchuan doctor --key-export)', '恢复操作需要 --key 参数（从源机器导出: wangchuan doctor --key-export）'],
  'restore.cloudRestore':     ['Restoring from cloud …', '正在从云端恢复 …'],
  'restore.cloudRestored':    ['Cloud data restored to local', '云端数据已恢复到本地'],
  'restore.configRestored':   ['Restored workspace paths from cloud config snapshot', '已从云端配置快照恢复工作区路径'],
  'restore.complete':         ['Restore complete! All cloud data has been pulled to local.', '恢复完成！所有云端数据已拉取到本地。'],
  'restore.syncingLocal':     ['Syncing local additions to cloud …', '正在将本地新增同步到云端 …'],
};

/**
 * Translate a message key, optionally interpolating {param} placeholders.
 *
 * @example t('init.banner')
 * @example t('sync.staged', { count: 26 })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const entry = M[key];
  if (!entry) return key;
  const idx = getLang() === 'en' ? 0 : 1;
  let msg = entry[idx]!;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}
