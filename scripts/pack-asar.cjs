/**
 * 构建后辅助脚本：抽取 app.asar → 生成 asar-latest.json
 *
 * 调用方式：
 *   node scripts/pack-asar.cjs [--owner=<gh用户名> --repo=<仓库名> --branch=main]
 *
 * 步骤：
 *   1. 从 electron-builder 的 release-new/win-unpacked/resources/app.asar 拷贝到
 *      release-new/asar/app-<version>.asar
 *   2. 计算 sha512 (base64) + size
 *   3. 生成 release-new/asar/asar-latest.json
 *        - 自动填充 releaseDate/version
 *        - 按 CLI 参数自动填充 4~5 层 CDN fallback URLs
 *        - requiredMinVersion：如果不传 --reqMinVer 就默认写当前 major.minor.0（小版本内安全）
 *        - notes：从 CHANGELOG_RELEASE.md 或 releaseNotes.txt 或命令行 --notes="" 取
 *   4. 打印一份 "发布指南"（GitHub Release + 仓库文件放置位置）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- 解析 CLI ----------
function parseArgs(argv) {
  const args = {};
  for (const token of argv.slice(2)) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > 0) args[token.slice(2, eq)] = token.slice(eq + 1);
    else args[token.slice(2)] = true;
  }
  return args;
}
const cli = parseArgs(process.argv);

// ---------- 路径 ----------
const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'release-new');
const UNP  = path.join(OUT, 'win-unpacked', 'resources');
const ASAR = path.join(UNP, 'app.asar');
const DIST = path.join(OUT, 'asar');

const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const VERSION = PKG.version;
const OWNER   = cli.owner || process.env.GH_OWNER || 'vipchens';
const REPO    = cli.repo  || process.env.GH_REPO  || 'HeLiLauncher';
const BRANCH  = cli.branch || process.env.GH_BRANCH || 'main';
const TAG     = 'v' + VERSION;
const REQ_MIN = cli.reqMinVer || (VERSION.split('.').slice(0,2).join('.') + '.0');
const NOTES   = cli.notes
  || (fs.existsSync(path.join(ROOT, 'releaseNotes.txt')) ? fs.readFileSync(path.join(ROOT, 'releaseNotes.txt'), 'utf-8').trim() : '')
  || '';
const PRODUCT = PKG.productName || '河狸乐园登录器';
const SETUP_EXE_X64  = `${PRODUCT}-Setup-${VERSION}-x64.exe`;

// ---------- 校验 ----------
if (!fs.existsSync(ASAR)) {
  console.error('❌ 找不到构建产物 app.asar：' + ASAR);
  console.error('👉 请先执行 npm run electron:build');
  process.exit(1);
}
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

// ---------- 执行 ----------
const TARGET_ASAR = path.join(DIST, `app-${VERSION}.asar`);
fs.copyFileSync(ASAR, TARGET_ASAR);
console.log('✅ 拷贝 app.asar →', path.relative(ROOT, TARGET_ASAR));

const stat = fs.statSync(TARGET_ASAR);
const size = stat.size;
const sha512 = crypto.createHash('sha512').update(fs.readFileSync(TARGET_ASAR)).digest('base64');

// asar 文件 CDN 列表
// 【核心】主通道：仓库 raw 分支（jsDelivr 对仓库源码树单文件放宽到 100MB，比 Release 附件的 50MB 宽 1 倍）
// 要求：app-{version}.asar 必须和 asar-latest.json 一起提交到仓库 {BRANCH} 分支的 updates/asar/ 目录下
// 兜底通道：Release 附件（50MB 限制，最后 fallback）
const asarName = `app-${VERSION}.asar`;
const asarUrls = [
  // --- 第 1 梯队：仓库源码树 raw 分支（100MB 限制，体积优化后必命中）---
  `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/${asarName}`,
  `https://fastly.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/${asarName}`,
  `https://gcore.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/${asarName}`,
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/updates/asar/${asarName}`,
  // --- 第 2 梯队：Release 附件（50MB 限制，仅最后兜底）---
  `https://mirror.ghproxy.com/https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${asarName}`,
  `https://ghproxy.com/https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${asarName}`,
  `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${asarName}`,
];
// nsis 完整安装器（>100MB，jsdelivr 不支持，直接走 gh-proxy → GitHub Release）
const nsisUrls = [
  `https://mirror.ghproxy.com/https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${encodeURIComponent(SETUP_EXE_X64)}`,
  `https://ghproxy.com/https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${encodeURIComponent(SETUP_EXE_X64)}`,
  `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${encodeURIComponent(SETUP_EXE_X64)}`,
];

// asar 元数据 JSON
const meta = {
  schemaVersion: 1,
  version: VERSION,
  releaseDate: new Date().toISOString(),
  requiredMinVersion: REQ_MIN,
  notes: NOTES,
  product: PRODUCT,
  github: { owner: OWNER, repo: REPO, releaseTag: TAG, rawBranch: BRANCH },
  asar: {
    fileName: asarName,
    size,
    sha512,
    urls: asarUrls,
  },
  nsis: {
    fileName: SETUP_EXE_X64,
    urls: nsisUrls,
  },
};

const META_PATH = path.join(DIST, 'asar-latest.json');
fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
console.log('✅ 生成 asar-latest.json →', path.relative(ROOT, META_PATH));
console.log('   version            =', meta.version);
console.log('   requiredMinVersion =', meta.requiredMinVersion);
console.log('   asar.size          =', (size/1024/1024).toFixed(2), 'MB');
console.log('   asar.sha512        =', sha512.slice(0, 20) + '...');
console.log('   github.owner/repo  =', OWNER + '/' + REPO + ' @ ' + TAG);
console.log('');

// ---------- 发布指南 ----------
const REPO_TREE = `仓库根目录下（如未存在则新建）：
  updates/
    asar/
      asar-latest.json       ← 把 release-new/asar/asar-latest.json 拷到这里
      app-${VERSION}.asar    ← ⚠️ 必须同时把 asar 文件也放进来！（raw 分支走 CDN 限制 100MB，比 Release 附件的 50MB 宽 1 倍，不会再报超限）
`;
const RELEASE_GUIDE = `
────────────────────────────────────────────────────────────────
  📌 发布步骤（纯 CDN · 免费方案 · 不依赖 AccountServer）
────────────────────────────────────────────────────────────────

【本次产物】
   version        = ${meta.version}
   asar 体积      = ${(size/1024/1024).toFixed(2)} MB
   jsdelivr 限额  = 100 MB（raw 仓库源码树，本版本 ✅ 预留充足余量）

────────────────────────────────────────────────────────────────
1️⃣  把 asar 两个文件【一起】提交到仓库源码树（让 CDN 从 raw 分支取）：

   目标位置（必须放在同一个目录！）：
     └─ HeLiLauncher/               ← 你的仓库根
        └─ updates/
           └─ asar/
              ├─ asar-latest.json   <—— 复制 release-new/asar/asar-latest.json
              └─ app-${VERSION}.asar  <—— ⚠️ 复制 release-new/asar/app-${VERSION}.asar（不能只放 Release 附件！）

   提交 & push 到 main 分支：
     git add updates/asar/
     git commit -m "chore(updater): asar v${VERSION}"
     git push origin ${BRANCH}

   ⏳ 等待 30~120 秒（jsdelivr 需要同步新文件缓存）。
   测试 CDN 是否生效：
     浏览器打开 → https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/asar-latest.json
     浏览器打开 → https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/app-${VERSION}.asar
     都能 200 → 这一步完成 ✅。
   如果返回旧版本 → 手动 purge：curl "https://purge.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/asar-latest.json"

────────────────────────────────────────────────────────────────
2️⃣  （可选，但强烈建议）创建 GitHub Release 作为最后兜底：

   打开 https://github.com/${OWNER}/${REPO}/releases/new
   - Tag:     ${TAG}
   - Target:  ${BRANCH}
   - Title:   河狸乐园登录器 ${TAG}
   - 附件上传：
       a) release-new/asar/app-${VERSION}.asar       ← asar 增量包（Release 附件兜底用，CDN 不再依赖它）
       b) release-new/${SETUP_EXE_X64}                ← x64 完整安装器（NSIS 通道）
       c) release-new/河狸乐园登录器-Setup-${VERSION}-ia32.exe  ← ia32 完整安装器
       d) release-new/latest.yml                      ← NSIS 通道版本清单

────────────────────────────────────────────────────────────────
3️⃣  纯 CDN 更新链路（客户端已自动按优先级 fallback）：
   🟢 优先级 1~3：cdn.jsdelivr / fastly.jsdelivr / gcore.jsdelivr
      （都从仓库 raw 分支取，100MB 限制，不会再 50MB 超限）
   🟢 优先级 4  ：raw.githubusercontent（GitHub raw 直连，绕过 CDN）
   🟡 优先级 5~6：ghproxy.com（Release 附件代理，最后兜底）
   ⚫ 优先级 7  ：GitHub Release 直链（最慢，但一定能下载到）

────────────────────────────────────────────────────────────────
4️⃣  客户端方式 B 兜底验证（老用户 config.json 没写 update.github 也行）：
   在客户端 DevTools 执行：
     await window.electronAPI.readConfig()
   应返回 { update: { github: { owner: 'vipchens', repo: 'HeLiLauncher', rawBranch: 'main' } } }
   → 说明兜底注入成功，老用户零配置自动启用 asar 增量热更新 ✅
`;
console.log(RELEASE_GUIDE);
if (OWNER !== 'vipchens' || REPO !== 'HeLiLauncher') {
  console.warn('⚠️  注意：当前使用的 owner/repo 非默认值（vipchens/HeLiLauncher），请确认与 GitHub 实际仓库一致：');
  console.warn('    owner=' + OWNER + '  repo=' + REPO + '  branch=' + BRANCH);
}
