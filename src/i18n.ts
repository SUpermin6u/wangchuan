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
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
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
  'cli.invalidAgent':    ['--agent must be openclaw | claude | gemini | codebuddy | workbuddy | cursor, got: {val}', '--agent 必须是 openclaw | claude | gemini | codebuddy | workbuddy | cursor，收到: {val}'],
  'cli.cmd.init':        ['Initialize Wangchuan, configure repo and generate key', '初始化忘川，配置仓库并生成密钥'],
  'cli.cmd.init.repo':   ['Git repo URL (SSH or HTTPS)', 'Git 仓库地址'],
  'cli.cmd.init.key':    ['Import existing master key (hex string)', '导入已有的主密钥（十六进制字符串）'],
  'cli.cmd.init.force':  ['Force re-init (overwrite existing config)', '强制重新初始化'],
  'cli.cmd.pull':        ['Pull and restore configs from remote repo', '从远端仓库拉取并还原配置到本地'],
  'cli.cmd.agent':       ['Filter by agent (openclaw|claude|gemini|codebuddy|workbuddy|cursor)', '只操作指定智能体 (openclaw|claude|gemini|codebuddy|workbuddy|cursor)'],
  'cli.cmd.push':        ['Encrypt and push local configs to remote repo', '将本地配置加密后推送到远端仓库'],
  'cli.cmd.push.msg':    ['Custom commit message', '自定义提交信息'],
  'cli.cmd.status':      ['Show sync status and workspace diff', '查看同步状态和工作区差异'],
  'cli.cmd.diff':        ['Show line-level diff between local and repo', '显示本地与仓库的行级文件差异'],
  'cli.cmd.list':        ['List all managed configs with local/repo status', '列出所有受管配置项及其状态'],
  'cli.cmd.dump':        ['Generate plaintext snapshot to temp dir', '生成明文快照到临时目录'],
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
  'init.nextPull':        ['Next: wangchuan pull  (pull remote memories)', '下一步: wangchuan pull  (同步远端记忆到本地)'],
  'init.nextPush':        ['              wangchuan push  (push local memories)', '              wangchuan push  (推送本地记忆到远端)'],

  // ── pull ────────────────────────────────────────────────────
  'pull.banner':           ['Wangchuan · Pull', '忘川 · 拉取配置'],
  'pull.filterAgent':      ['Filter agent: {agent}', '过滤智能体: {agent}'],
  'pull.pulling':          ['Pulling from {repo} …', '从 {repo} 拉取 …'],
  'pull.pulled':           ['Remote configs pulled', '远端配置已拉取'],
  'pull.gitFailed':        ['Git pull failed', 'Git 拉取失败'],
  'pull.gitFailedDetail':  ['Git pull failed: {error}', 'Git pull 失败: {error}'],
  'pull.restoreFailed':    ['Restore failed: {error}', '还原失败: {error}'],
  'pull.noConfigs':        ['No configs in repo yet, run wangchuan push first', '仓库中暂无配置，请先 push'],
  'pull.decrypted':        ['[decrypted]', '[已解密]'],
  'pull.skipped':          ['Skipped (not in repo): {count} files', '跳过（仓库中不存在）: {count} 个文件'],
  'pull.localOnly':        ['Detected {count} local-only files:', '检测到 {count} 个本地独有文件：'],
  'pull.suggestPush':      ['Run wangchuan push to sync', '如需同步到云端，请执行 wangchuan push'],
  'pull.summary':          ['Synced {synced} files ({encrypted} encrypted, {conflicts} conflicts)', '共同步 {synced} 个文件（{encrypted} 个加密，{conflicts} 个冲突）'],

  // ── push ────────────────────────────────────────────────────
  'push.banner':              ['Wangchuan · Push', '忘川 · 推送配置'],
  'push.filterAgent':         ['Filter agent: {agent}', '过滤智能体: {agent}'],
  'push.commitMsgCustom':     ['sync: {message} [update {tag}{host}]', 'sync: {message} [更新 {tag}{host}]'],
  'push.commitMsgDefault':    ['sync: update configs {tag}[{host}]', 'sync: 更新配置 {tag}[{host}]'],
  'push.staging':             ['Encrypting and staging files …', '加密并准备配置文件 …'],
  'push.staged':              ['Staged {count} files', '已准备 {count} 个文件'],
  'push.stagingFailed':       ['Staging failed', '暂存文件失败'],
  'push.stagingFailedDetail': ['Staging failed: {error}', '准备文件失败: {error}'],
  'push.noFiles':             ['No syncable files found, check workspace paths', '没有可同步的文件，请检查工作区路径'],
  'push.committing':          ['Committing and pushing …', '提交并推送到远端仓库 …'],
  'push.pushed':              ['Pushed to {repo}', '已推送到 {repo}'],
  'push.nothingToCommit':     ['Nothing to commit (repo is up to date)', '没有变更需要提交'],
  'push.pushFailed':          ['Push failed, rolling back …', '推送失败，正在回滚 …'],
  'push.rollbackFailed':      ['Rollback failed: {error}', '回滚失败: {error}'],
  'push.pushFailedDetail':    ['Push failed: {error}', '推送失败: {error}'],
  'push.encrypted':           ['[encrypted]', '[已加密]'],
  'push.pruned':              ['[pruned]', '[已清理]'],
  'push.prunedSummary':       [', pruned {count} stale', '，清理 {count} 个过期文件'],
  'push.complete':            ['Push complete: {count} files{pruned}, commit: {sha}', '推送完成: {count} 个文件{pruned}，commit: {sha}'],

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
  'status.inventory':      ['Config inventory ({count} items):', '配置文件清单（{count} 项）：'],
  'status.fieldLabel':     ['[field]', '[字段]'],

  // ── diff ────────────────────────────────────────────────────
  'diff.banner':         ['Wangchuan · Diff', '忘川 · 文件差异'],
  'diff.filterAgent':    ['Filter agent: {agent}', '过滤智能体: {agent}'],
  'diff.newFile':        ['(new, not in repo)', '(新增，仓库中不存在)'],
  'diff.missingFile':    ['(missing locally)', '(本地缺失)'],
  'diff.cannotDecrypt':  ['[encrypted, cannot decrypt]', '[加密文件，无法解密比较]'],
  'diff.repoVersion':    ['--- repo version', '--- 仓库版本'],
  'diff.localVersion':   ['+++ local version', '+++ 本地版本'],
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

  // ── dump ────────────────────────────────────────────────────
  'dump.banner':           ['Wangchuan · Dump', '忘川 · 明文快照'],
  'dump.skipJson':         ['Skipping JSON extraction (parse error): {path}', '跳过 JSON 字段提取: {path}'],
  'dump.srcEncrypted':     ['[src encrypted]', '[原文件加密]'],
  'dump.fieldExtraction':  ['[field extraction]', '[字段提取]'],
  'dump.outputDir':        ['Output dir: ', '输出目录：'],
  'dump.fileCount':        ['File count: ', '文件数量：'],
  'dump.files':            ['{count} files', '{count} 个文件'],
  'dump.skippedCount':     ['({count} skipped)', '({count} 个跳过)'],
  'dump.warning':          ['Warning: this dir contains plaintext sensitive data, delete after inspection', '提示：含明文敏感信息，查看后请删除'],

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

  // ── sync (debug) ────────────────────────────────────────────
  'sync.distributeSkill':  ['distribute skill: {file} → {agent}', '分发 skill: {file} → {agent}'],
  'sync.distributeMcp':    ['distribute MCP servers → {agent}', '分发 MCP servers → {agent}'],
  'sync.pruneStale':       ['repo prune stale: {file}', 'repo 清理过期文件: {file}'],
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
  'watch.noTargets':       ['No watch targets found, check agent config', '没有可监听的目标，请检查 agent 配置'],
  'watch.watching':        ['Watching {dirs} directories, {files} files', '监听 {dirs} 个目录，{files} 个文件'],
  'watch.triggerSync':     ['[{time}] Sync triggered: {reason}', '[{time}] 触发同步: {reason}'],
  'watch.syncError':       ['Sync error: {error}', '同步出错: {error}'],
  'watch.fileChanged':     ['File changed: {file}', '文件变更: {file}'],
  'watch.reasonFileChange':['file change detected', '检测到文件变更'],
  'watch.reasonPoll':      ['periodic remote check', '定时远端检查'],
  'watch.reasonInitial':   ['initial sync', '初始同步'],
  'watch.dirNotFound':     ['Directory not found, skipping: {dir}', '目录不存在，跳过: {dir}'],
  'watch.watchError':      ['Cannot watch {dir}: {error}', '无法监听 {dir}: {error}'],
  'watch.shutdown':        ['Shutting down watch daemon …', '正在停止监听 …'],
  'watch.started':         ['Watch daemon started', '监听守护进程已启动'],
  'watch.stopHint':        ['Press Ctrl+C to stop', '按 Ctrl+C 停止'],

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

  // ── agent command ──────────────────────────────────────────
  'cli.cmd.agent.desc':      ['Manage agents (list|enable|disable)', '管理智能体 (list|enable|disable)'],
  'agent.banner':            ['Wangchuan · Agents', '忘川 · 智能体管理'],
  'agent.list.header':       ['Agents:', '智能体列表：'],
  'agent.enabled':           ['enabled', '已启用'],
  'agent.disabled':          ['disabled', '已禁用'],
  'agent.alreadyEnabled':    ['Agent {name} is already enabled', '智能体 {name} 已处于启用状态'],
  'agent.alreadyDisabled':   ['Agent {name} is already disabled', '智能体 {name} 已处于禁用状态'],
  'agent.nowEnabled':        ['Agent {name} enabled', '智能体 {name} 已启用'],
  'agent.nowDisabled':       ['Agent {name} disabled', '智能体 {name} 已禁用'],
  'agent.unknownAction':     ['Unknown action: {action}. Use list|enable|disable', '未知操作: {action}，请使用 list|enable|disable'],
  'agent.nameRequired':      ['Agent name is required for enable/disable', 'enable/disable 操作需要指定智能体名称'],

  // ── conflict detection in status ──────────────────────────
  'status.conflictWarning':  ['Potential sync conflicts detected:', '检测到潜在同步冲突：'],
  'status.conflictFile':     ['⚠ {file} — modified locally since last sync, remote also updated', '⚠ {file} — 上次同步后本地有修改，远端也有更新'],
  'status.conflictHint':     ['Run wangchuan diff to inspect, then push or pull to resolve', '执行 wangchuan diff 查看详情，然后 push 或 pull 解决冲突'],

  // ── colorized sync progress ───────────────────────────────
  'sync.progress.enc':       ['[enc]', '[加密]'],
  'sync.progress.field':     ['[field]', '[字段]'],
  'sync.progress.decrypted': ['[decrypted]', '[解密]'],
  'sync.progress.copy':      ['[copy]', '[复制]'],

  // ── config ──────────────────────────────────────────────────
  'config.loadFailed': ['Failed to load config: {error}', '读取配置失败: {error}'],
  'config.saved':      ['Config saved to {path}', '配置已保存到 {path}'],
  'config.invalidFormat': ['Invalid config: missing required field "{field}"', '配置文件无效: 缺少必需字段 "{field}"'],

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
  'env.deleted':              ['Environment deleted: {name}', '环境已删除: {name}'],
  'env.create.creating':      ['Creating environment {name} …', '正在创建环境 {name} …'],
  'env.switch.switching':     ['Switching to environment {name} …', '正在切换到环境 {name} …'],
  'env.delete.deleting':      ['Deleting environment {name} …', '正在删除环境 {name} …'],
  'env.unknownAction':        ['Unknown action: {action}. Use list|create|switch|current|delete', '未知操作: {action}，请使用 list|create|switch|current|delete'],

  // ── key command ──────────────────────────────────────────────
  'cli.cmd.key.desc':         ['Manage master key (rotate|export|import)', '管理主密钥 (rotate|export|import)'],
  'key.banner':               ['Wangchuan · Key Management', '忘川 · 密钥管理'],
  'key.rotate.start':         ['Rotating master key …', '正在轮换主密钥 …'],
  'key.rotate.decrypting':    ['Decrypting {count} files with old key …', '使用旧密钥解密 {count} 个文件 …'],
  'key.rotate.reencrypting':  ['Re-encrypting with new key …', '使用新密钥重新加密 …'],
  'key.rotate.complete':      ['Key rotation complete: {count} files re-encrypted', '密钥轮换完成: 重新加密 {count} 个文件'],
  'key.rotate.noFiles':       ['No encrypted files found in repo', '仓库中没有加密文件'],
  'key.rotate.failed':        ['Key rotation failed: {error}', '密钥轮换失败: {error}'],
  'key.rotate.rolledBack':    ['Old key restored after failed rotation', '轮换失败，已恢复旧密钥'],
  'key.export.hex':           ['Master key (hex): {hex}', '主密钥（hex）: {hex}'],
  'key.export.warning':       ['Keep this key safe — anyone with it can decrypt your data', '请妥善保管此密钥，持有者可解密所有数据'],
  'key.import.success':       ['Master key imported: {path}', '主密钥已导入: {path}'],
  'key.import.invalidHex':    ['Invalid key format, expected 64 hex chars (256-bit)', '密钥格式无效，需要 64 位十六进制字符'],
  'key.import.hexRequired':   ['Key hex string is required', '需要提供密钥十六进制字符串'],
  'key.unknownAction':        ['Unknown action: {action}. Use rotate|export|import', '未知操作: {action}，请使用 rotate|export|import'],

  // ── integrity checksum ────────────────────────────────────────
  'integrity.writing':        ['Writing integrity checksums …', '写入完整性校验 …'],
  'integrity.verified':       ['Integrity verified: {count} files OK', '完整性校验通过: {count} 个文件'],
  'integrity.mismatch':       ['Integrity mismatch: {file} (possible corruption or tampering)', '完整性校验失败: {file}（可能被篡改或损坏）'],
  'integrity.missingChecksum':['No integrity.json in repo, skipping verification', '仓库中无 integrity.json，跳过校验'],
  'integrity.mismatchCount':  ['Warning: {count} files failed integrity check', '警告: {count} 个文件完整性校验失败'],

  // ── backup before pull ────────────────────────────────────────
  'backup.creating':          ['Backing up {count} files before overwrite …', '覆盖前备份 {count} 个文件 …'],
  'backup.created':           ['Backup saved: {path}', '备份已保存: {path}'],
  'backup.rotated':           ['Rotated old backups (kept {kept}, removed {removed})', '清理旧备份（保留 {kept} 个，删除 {removed} 个）'],

  // ── report command ────────────────────────────────────────────
  'cli.cmd.report':         ['Show sync state summary report', '显示同步状态汇总报告'],
  'cli.cmd.report.json':    ['Output as JSON', '以 JSON 格式输出'],
  'report.banner':          ['Wangchuan · Report', '忘川 · 同步报告'],
  'report.repo':            ['Repo:   ', '仓库：  '],
  'report.branch':          ['Branch: ', '分支：  '],
  'report.env':             ['Env:    ', '环境：  '],
  'report.host':            ['Host:   ', '主机：  '],
  'report.lastSync':        ['Last sync: ', '上次同步：'],
  'report.noSync':          ['never', '从未同步'],
  'report.agentsHeader':    ['Agents:', '智能体：'],
  'report.totalFiles':      ['Total: {count} files', '合计: {count} 个文件'],
  'report.encrypted':       ['encrypted', '加密'],
  'report.plaintext':       ['plaintext', '明文'],
  'report.localOnly':       ['{count} local-only files (not in repo):', '{count} 个本地独有文件（不在仓库中）：'],
  'report.missing':         ['{count} missing files (in repo but not local):', '{count} 个缺失文件（在仓库中但本地没有）：'],

  // ── init (idempotent) ────────────────────────────────────────
  'init.alreadySame':       ['Already initialized with the same repo, nothing to do', '已使用相同仓库初始化，无需操作'],
  'init.differentRepo':     ['Already initialized with a different repo: {existing}', '已使用不同仓库初始化: {existing}'],
  'init.useForceSwitch':    ['Use --force to switch repo', '如需切换仓库请使用 --force'],
  'init.repoMissing':       ['Repo directory missing, re-cloning …', '仓库目录缺失，正在重新克隆 …'],

  // ── sync-lock ──────────────────────────────────────────────────
  'syncLock.anotherRunning':   ['Another sync is running (PID {pid}), please wait or kill it', '另一个同步正在进行中 (PID {pid})，请等待或终止该进程'],
  'syncLock.staleLock':        ['Stale sync lock found (PID {pid} is dead), cleaning up …', '发现过期同步锁 (PID {pid} 已终止)，正在清理 …'],
  'syncLock.acquired':         ['Sync lock acquired', '同步锁已获取'],
  'syncLock.released':         ['Sync lock released', '同步锁已释放'],
  'syncLock.cleanedDirtyState':['Cleaned dirty git state from interrupted sync', '已清理被中断同步留下的脏状态'],
  'syncLock.cleanFailed':      ['Failed to clean dirty state: {error}', '清理脏状态失败: {error}'],

  // ── doctor command ─────────────────────────────────────────────
  'cli.cmd.doctor':            ['Run health checks on the Wangchuan setup', '对忘川配置进行健康检查'],
  'cli.cmd.history':           ['Show recent sync history', '显示最近的同步历史'],
  'cli.cmd.history.limit':     ['Number of entries to show (default: 10)', '显示条数（默认: 10）'],
  'cli.cmd.history.json':      ['Output as JSON', '以 JSON 格式输出'],
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

  // ── history command ────────────────────────────────────────────
  'history.banner':            ['Wangchuan · Sync History', '忘川 · 同步历史'],
  'history.empty':             ['No sync history found', '暂无同步记录'],
  'history.header':            ['Time                     Action  Agent     Files  Encrypted  Host', '时间                       操作    智能体    文件数  加密数     主机'],
  'history.separator':         ['─────────────────────────────────────────────────────────────────', '─────────────────────────────────────────────────────────────────────'],

  'doctor.summary':            ['{pass} passed, {warn} warnings, {fail} failed', '{pass} 通过, {warn} 警告, {fail} 失败'],

  // ── filter (--only / --exclude) ─────────────────────────────────
  'cli.cmd.only':              ['Only sync files matching patterns (comma-separated)', '仅同步匹配的文件（逗号分隔）'],
  'cli.cmd.exclude':           ['Exclude files matching patterns (comma-separated)', '排除匹配的文件（逗号分隔）'],
  'filter.only':               ['Filter --only: {patterns}', '过滤 --only: {patterns}'],
  'filter.exclude':            ['Filter --exclude: {patterns}', '过滤 --exclude: {patterns}'],

  // ── push unchanged (incremental) ─────────────────────────────────
  'push.unchangedSummary':     ['({count} unchanged, skipped)', '（{count} 个未变更，已跳过）'],

  // ── three-way merge ────────────────────────────────────────────────
  'merge.autoResolved':        ['Auto-merged (no conflicts): {file}', '自动合并（无冲突）: {file}'],
  'merge.conflictsFound':      ['Merge conflicts in {file} — edit to resolve markers', '合并冲突: {file} — 请编辑解决冲突标记'],
  'merge.conflictMarkers':     ['Conflict markers inserted', '已插入冲突标记'],

  // ── summary command ────────────────────────────────────────────────
  'cli.cmd.summary':           ['Show memory footprint summary', '显示记忆占用摘要'],
  'cli.cmd.summary.json':      ['Output as JSON', '以 JSON 格式输出'],
  'summary.banner':            ['Wangchuan · Summary', '忘川 · 记忆摘要'],
  'summary.agentsHeader':      ['Per-agent breakdown:', '智能体分布：'],
  'summary.sharedHeader':      ['Shared resources:', '共享资源：'],
  'summary.skills':            ['Skills', '技能'],
  'summary.mcpServers':        ['MCP servers', 'MCP 服务'],
  'summary.encryption':        ['Encryption:', '加密统计：'],
  'summary.encrypted':         ['encrypted', '加密'],
  'summary.plaintext':         ['plaintext', '明文'],
  'summary.encryptedRatio':    ['encrypted', '加密率'],
  'summary.totalSize':         ['Total size', '总大小'],
  'summary.recentHeader':      ['Top 5 recently modified:', '最近修改的 5 个文件：'],

  // ── setup command ──────────────────────────────────────────────────
  'cli.cmd.setup':             ['Generate setup command for a new machine', '生成新机器初始化命令'],
  'setup.banner':              ['Wangchuan · Setup', '忘川 · 迁移向导'],
  'setup.repoLabel':           ['Repo:  ', '仓库：'],
  'setup.keyLabel':            ['Key:   ', '密钥：'],
  'setup.commandLabel':        ['Run this on the new machine:', '在新机器上执行以下命令：'],
  'setup.keyNotFound':         ['Master key not found: {path}', '主密钥未找到: {path}'],
  'setup.securityWarning':     ['Warning: this command contains your master key — do not share via insecure channels (chat, email, etc.)', '警告: 此命令包含主密钥 — 请勿通过不安全渠道传输（聊天、邮件等）'],
  'setup.clipboardHint':       ['Copy the command above and paste it on the target machine', '复制上面的命令，粘贴到目标机器上执行'],

  // ── snapshot command ──────────────────────────────────────────────
  'cli.cmd.snapshot':          ['Manage sync snapshots (save|list|restore|delete)', '管理同步快照 (save|list|restore|delete)'],
  'cli.cmd.snapshot.limit':    ['Max snapshots to keep (default: 10)', '保留的最大快照数（默认: 10）'],
  'snapshot.banner':           ['Wangchuan · Snapshot', '忘川 · 快照管理'],
  'snapshot.saved':            ['Snapshot saved: {name} ({count} files)', '快照已保存: {name}（{count} 个文件）'],
  'snapshot.restored':         ['Snapshot restored: {name}', '快照已恢复: {name}'],
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

  // ── health command ───────────────────────────────────────────────
  'cli.cmd.health':           ['Show memory health score', '显示记忆健康评分'],
  'health.banner':            ['Wangchuan · Health', '忘川 · 健康评分'],
  'health.freshness':         ['Freshness', '新鲜度'],
  'health.coverage':          ['Coverage', '覆盖率'],
  'health.integrity':         ['Integrity', '完整性'],
  'health.encryption':        ['Encryption', '加密率'],
  'health.overall':           ['Overall', '综合'],
  'health.agentHeader':       ['Agent scores:', '智能体评分：'],
  'health.lastSyncDaysAgo':   ['Last sync: {days} days ago', '上次同步: {days} 天前'],
  'health.lastSyncToday':     ['Last sync: today', '上次同步: 今天'],
  'health.noSyncHistory':     ['No sync history', '无同步记录'],

  // ── report sync statistics ─────────────────────────────────────
  'report.statsHeader':       ['Sync Statistics:', '同步统计：'],
  'report.statsTotalSyncs':   ['Total syncs: {total} (push: {push}, pull: {pull}, sync: {sync})', '总同步次数: {total} (push: {push}, pull: {pull}, sync: {sync})'],
  'report.statsAvgFiles':     ['Avg files per sync: {avg}', '平均每次同步文件数: {avg}'],
  'report.statsMostActive':   ['Most active agent: {agent} ({count} files)', '最活跃智能体: {agent}（{count} 个文件）'],
  'report.statsLast7Days':    ['Last 7 days: {sparkline}', '最近 7 天: {sparkline}'],
  'report.statsNoHistory':    ['No sync history yet', '暂无同步记录'],

  // ── search command ──────────────────────────────────────────────
  'cli.cmd.search':            ['Search across synced memories', '搜索同步的记忆内容'],
  'cli.cmd.search.ignoreCase': ['Case-insensitive search', '忽略大小写搜索'],
  'cli.cmd.search.regex':      ['Treat query as regular expression', '将查询视为正则表达式'],
  'cli.cmd.search.context':    ['Lines of context before/after match (default: 2)', '匹配行前后的上下文行数（默认: 2）'],
  'search.banner':             ['Wangchuan · Search', '忘川 · 搜索'],
  'search.filterAgent':        ['Filter agent: {agent}', '过滤智能体: {agent}'],
  'search.searching':          ['Searching {count} files …', '搜索 {count} 个文件 …'],
  'search.noResults':          ['No results found for: {query}', '未找到匹配内容: {query}'],
  'search.summary':            ['Found {hits} matches in {files} files', '找到 {hits} 处匹配，分布在 {files} 个文件中'],

  // ── config export/import command ────────────────────────────────
  'cli.cmd.config':              ['Manage config (export|import)', '管理配置 (export|import)'],
  'configMgmt.banner':           ['Wangchuan · Config', '忘川 · 配置管理'],
  'configMgmt.exported':         ['Config exported to {path}', '配置已导出到 {path}'],
  'configMgmt.exportHint':       ['Copy this file to another machine and run: wangchuan config import <file>', '将此文件复制到另一台机器并执行: wangchuan config import <file>'],
  'configMgmt.imported':         ['Config imported from {path}', '配置已从 {path} 导入'],
  'configMgmt.fileNotFound':     ['File not found: {path}', '文件不存在: {path}'],
  'configMgmt.invalidFile':      ['Invalid config file: {error}', '配置文件无效: {error}'],
  'configMgmt.importFileRequired': ['File path is required for import', 'import 操作需要指定文件路径'],
  'configMgmt.unknownAction':    ['Unknown action: {action}. Use export|import', '未知操作: {action}，请使用 export|import'],

  // ── changelog command ───────────────────────────────────────────
  'cli.cmd.changelog':           ['Show sync changelog from git history', '显示 Git 历史中的同步变更日志'],
  'cli.cmd.changelog.limit':     ['Number of commits to show (default: 5)', '显示的提交数量（默认: 5）'],
  'changelog.banner':            ['Wangchuan · Changelog', '忘川 · 变更日志'],
  'changelog.noRepo':            ['Sync repo not found, run wangchuan init first', '同步仓库不存在，请先执行 wangchuan init'],
  'changelog.empty':             ['No commits found in sync repo', '同步仓库中没有提交记录'],
  'changelog.firstCommit':       ['(initial commit)', '(初始提交)'],
  'changelog.shown':             ['Showing {count} recent commits', '显示最近 {count} 条提交'],

  // ── tag command ───────────────────────────────────────────────
  'cli.cmd.tag':               ['Manage file tags (add|remove|list|find)', '管理文件标签 (add|remove|list|find)'],
  'tag.banner':                ['Wangchuan · Tags', '忘川 · 标签管理'],
  'tag.addUsage':              ['Usage: wangchuan tag add <file-pattern> <tags...>', '用法: wangchuan tag add <文件模式> <标签...>'],
  'tag.removeUsage':           ['Usage: wangchuan tag remove <file-pattern> <tags...>', '用法: wangchuan tag remove <文件模式> <标签...>'],
  'tag.findUsage':             ['Usage: wangchuan tag find <tag>', '用法: wangchuan tag find <标签>'],
  'tag.noMatch':               ['No files match pattern: {pattern}', '没有文件匹配模式: {pattern}'],
  'tag.added':                 ['Tagged {count} files with: {tags}', '已为 {count} 个文件添加标签: {tags}'],
  'tag.removed':               ['Removed tags from {count} files: {tags}', '已从 {count} 个文件移除标签: {tags}'],
  'tag.empty':                 ['No tagged files', '暂无标签文件'],
  'tag.listSummary':           ['{tags} tags across {files} files', '{tags} 个标签，{files} 个文件'],
  'tag.findEmpty':             ['No files found with tag: {tag}', '未找到标签为 {tag} 的文件'],
  'tag.unknownAction':         ['Unknown action: {action}. Use add|remove|list|find', '未知操作: {action}，请使用 add|remove|list|find'],

  // ── cleanup command ───────────────────────────────────────────
  'cli.cmd.cleanup':           ['Detect stale/unused memory entries and suggest cleanup', '检测过期/未使用的记忆条目并建议清理'],
  'cli.cmd.cleanup.auto':      ['Auto-disable agents with all phantom files', '自动禁用所有文件缺失的智能体'],
  'cli.cmd.cleanup.days':      ['Stale threshold in days (default: 90)', '过期阈值天数（默认: 90）'],
  'cleanup.banner':            ['Wangchuan · Cleanup', '忘川 · 过期清理'],
  'cleanup.filterAgent':       ['Filter agent: {agent}', '过滤智能体: {agent}'],
  'cleanup.staleHeader':       ['Stale (>{days}d not modified)', '过期（>{days}天 未修改）'],
  'cleanup.dormantHeader':     ['Dormant (long inactive)', '休眠（长期未活动）'],
  'cleanup.phantomHeader':     ['Phantom (configured but missing)', '幽灵（已配置但文件不存在）'],
  'cleanup.ok':                ['OK', '正常'],
  'cleanup.stale':             ['stale', '过期'],
  'cleanup.dormant':           ['dormant', '休眠'],
  'cleanup.phantom':           ['phantom', '幽灵'],
  'cleanup.summary':           ['Total: {total} files — {ok} ok, {stale} stale, {dormant} dormant, {phantom} phantom', '合计: {total} 个文件 — {ok} 正常, {stale} 过期, {dormant} 休眠, {phantom} 幽灵'],
  'cleanup.autoDisabled':      ['Auto-disabled agent: {agent} (all files phantom)', '已自动禁用智能体: {agent}（所有文件缺失）'],
  'cleanup.noAutoAction':      ['No agents to auto-disable', '没有需要自动禁用的智能体'],

  // ── enhanced prompt ───────────────────────────────────────────
  'prompt.sizeCompare':        ['local: {local} → remote: {remote}', '本地: {local} → 远端: {remote}'],
  'prompt.showDiff':           ['Show full diff', '显示完整差异'],
  'prompt.merge':              ['Attempt merge', '尝试合并'],
  'prompt.moreChanges':        ['{count} more changes …', '还有 {count} 处变更 …'],
};

/**
 * Translate a message key, optionally interpolating {param} placeholders.
 *
 * @example t('init.banner')
 * @example t('push.staged', { count: 26 })
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
