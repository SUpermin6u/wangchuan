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
  'prompt.choose':          ['Choose [o/s/A/S]: ', '请选择 [o/s/A/S]: '],

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

  // ── config ──────────────────────────────────────────────────
  'config.loadFailed': ['Failed to load config: {error}', '读取配置失败: {error}'],
  'config.saved':      ['Config saved to {path}', '配置已保存到 {path}'],
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
