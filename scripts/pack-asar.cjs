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
const OWNER   = cli.owner || process.env.GH_OWNER || 'your-name';
const REPO    = cli.repo  || process.env.GH_REPO  || 'AZ_335WebClient';
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

// asar 文件 CDN 列表（注意：jsDelivr 单文件 < 50MB 才走加速，asar <20MB 没问题）
const asarName = `app-${VERSION}.asar`;
const asarUrls = [
  `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${TAG}/updates/asar/${asarName}`,
  `https://fastly.jsdelivr.net/gh/${OWNER}/${REPO}@${TAG}/updates/asar/${asarName}`,
  `https://gcore.jsdelivr.net/gh/${OWNER}/${REPO}@${TAG}/updates/asar/${asarName}`,
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
const REPO_TREE = `仓库根目录下新建（如未存在）：
  updates/
    asar/
      asar-latest.json       ← 把 release-new/asar/asar-latest.json 拷到这里
`;
const RELEASE_GUIDE = `
────────────────────────────────────────────────────────────────
  📌 发布步骤（结合 GitHub + 免费 CDN 方案）
────────────────────────────────────────────────────────────────

1️⃣  提交 & 打 tag：
     git add -A
     git commit -m "chore(release): ${TAG}"
     git tag ${TAG}
     git push origin ${BRANCH} --tags

2️⃣  把 asar-latest.json 推到仓库源码树（让 jsdelivr raw 能命中）：
     将仓库根目录按如下结构提交 & push：
       updates/asar/asar-latest.json     <——— 将 ${path.relative(ROOT, META_PATH)} 复制过去
     （注：提交后访问 https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/asar-latest.json
           应能 200 看到 JSON；如果 404 等 1-5 分钟，或者手动 purge jsdelivr 缓存）

3️⃣  GitHub 创建 Release：
     - Target: ${BRANCH}    Tag: ${TAG}    Title: ${TAG}
     - 描述写什么都行（建议是 ${NOTES ? '你配置的 notes' : '更新说明'}）
     - Release 附件（Assets）上传 3 个文件：
         a) release-new/asar/app-${VERSION}.asar                    <— asar 增量包（<20MB，CDN 能加速）
         b) release-new/${SETUP_EXE_X64}                             <— x64 完整安装器（>100MB，gh-proxy 能加速）
         c) release-new/latest.yml                                   <— 可选，老用户 NSIS 兜底用

4️⃣  客户端配置（登录器 → 设置 → 写 config.json 也行）：
     用户 config.json 加（或以后我帮你在 SettingsView 里加图形化配置）：
        {
          "update": {
            "github": {
              "owner": "${OWNER}",
              "repo":  "${REPO}",
              "rawBranch": "${BRANCH}"
            }
          }
        }
     （客户端会自动从 jsdelivr → fastly → ghproxy → GitHub Release 4 层 fallback）

5️⃣  验证：
     浏览器打开：
       元数据（CDN 加速）：https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/updates/asar/asar-latest.json
       asar 附件（CDN 加速）：https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${TAG}/updates/asar/app-${VERSION}.asar
       asar 附件（ghproxy，>50MB 兜底）：https://mirror.ghproxy.com/https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/app-${VERSION}.asar
       完整 exe（ghproxy）：https://mirror.ghproxy.com/https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${encodeURIComponent(SETUP_EXE_X64)}
     全部能 200 下载，就完成啦 🎉

────────────────────────────────────────────────────────────────
`;
console.log(RELEASE_GUIDE);
if (OWNER === 'your-name' || REPO === 'AZ_335WebClient') {
  console.warn('⚠️  注意：你没填 owner/repo，上面 URL 里是占位，下次构建请加参数：');
  console.warn('    node scripts/pack-asar.cjs --owner=你GitHub用户名 --repo=仓库名 --branch=main');
  console.warn('  或设置环境变量 GH_OWNER / GH_REPO / GH_BRANCH');
}
