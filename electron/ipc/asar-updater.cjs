/**
 * asar 增量热更新（B 方案核心）
 *
 * 更新源 = GitHub + 免费 CDN 双链路自动 fallback
 *
 * 设计思路：
 *  1. 日常 90%+ 发版只有前端 dist/ + electron/ipc 代码变化 → 打包后在 app.asar 里（3~20MB）
 *  2. 登录器启动后先拉 asar-latest.json 看是否有新版本
 *  3. 有新版本 + 当前版本 >= requiredMinVersion → 下载 asar → sha512 校验 → 备份旧 asar → 覆盖 → 重启
 *  4. 如果版本跨度大（低于 requiredMinVersion）、或 asar 更新失败、或 Electron/NSIS/native 模块需要升级
 *     → 自动回落到 electron-updater 的 NSIS 全量安装包（原有 updater.cjs 逻辑兜底）
 *
 * 双链路 URL（用户在 config.update.github 里填 owner/repo/branch 后生效）：
 *   ┌──────────────────────────┬─────────────────────────────────────────────────────────────────────┐
 *   │ 文件                      │ 优先 (CDN 免费加速)                                                   │ Fallback
 *   ├──────────────────────────┼─────────────────────────────────────────────────────────────────────┤
 *   │ asar-latest.json (元数据) │ https://cdn.jsdelivr.net/gh/{OWNER}/{REPO}@{BRANCH}/updates/asar/   │ fastly.jsdelivr → raw.githubusercontent.com
 *   │ app-<ver>.asar (3~20MB)  │ https://cdn.jsdelivr.net/gh/{OWNER}/{REPO}@v<ver>/updates/asar/     │ fastly → gh-proxy.com → GitHub Release
 *   │ Setup-*.exe (>100MB)     │ gh-proxy 反代 GitHub Release（jsdelivr 单文件 >50MB 不支持）         │ GitHub Release 直链
 *   └──────────────────────────┴─────────────────────────────────────────────────────────────────────┘
 */

const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const urlMod = require('url');
const { readConfig } = require('./config.cjs');

// ---------- 路径常量 ----------
const APP_EXE_DIR  = path.dirname(app.getPath('exe'));      // 登录器 .exe 所在目录（已安装后）
const RESOURCES    = path.join(APP_EXE_DIR, 'resources');   // .../resources/
const ASAR_CURRENT = path.join(RESOURCES, 'app.asar');      // 当前运行的 asar
const ASAR_BACKUP  = path.join(RESOURCES, 'app.asar.bak');  // 热更前备份（失败可回滚）
const ASAR_PENDING = path.join(RESOURCES, 'app.asar.pending'); // 下载中/下载完成待校验

// ---------- asar 元数据结构 ----------
/*
{
  "version": "1.0.3",
  "releaseDate": "2026-08-18T00:00:00Z",
  "requiredMinVersion": "1.0.0",
  "notes": "修复硬核模式徽章 + 新增补丁包管理",
  "github": { "owner": "your-name", "repo": "AZ_335WebClient", "releaseTag": "v1.0.3", "rawBranch": "main" },
  "asar": {
    "size": 15462888,
    "sha512": "G5mxxx base64 sha512",
    "urls": [
      "https://cdn.jsdelivr.net/gh/<owner>/<repo>@v1.0.3/updates/asar/app-1.0.3.asar",
      "https://fastly.jsdelivr.net/gh/.../app-1.0.3.asar",
      "https://ghproxy.com/https://github.com/<owner>/<repo>/releases/download/v1.0.3/app-1.0.3.asar",
      "https://github.com/<owner>/<repo>/releases/download/v1.0.3/app-1.0.3.asar"
    ]
  },
  "nsis": { // 可选，仅当 requiredMinVersion 不满足或 asar 失败时才回落到 NSIS 全量
    "provider": "github-releases",
    "urls": [
      "https://ghproxy.com/https://github.com/<owner>/<repo>/releases/download/v1.0.3/河狸乐园登录器-Setup-1.0.3-x64.exe",
      "https://github.com/<owner>/<repo>/releases/download/v1.0.3/河狸乐园登录器-Setup-1.0.3-x64.exe"
    ],
    "sha512": "...",
    "size": 132444444
  }
}
*/

// ---------- 状态 ----------
let currentMeta = null;           // 最近一次 check 拿到的 asar-latest.json
let fallbackNsisRequired = false; // 是否需要强制走 NSIS 全量（版本跨度过大 / asar 失败）

// ---------- 工具 ----------
function cmpVersion(a, b) {
  // semver-like: 1.0.3 compare
  const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] || 0, bv = pb[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function sendToRenderer(win, eventName, payload = {}) {
  if (!win || win.isDestroyed()) return;
  try { win.webContents.send('updater:' + eventName, payload); } catch {}
}
function getMainWindow() {
  const { BrowserWindow } = require('electron');
  return BrowserWindow.getAllWindows()[0] || null;
}

function buildMetaUrlsFromConfig(cfg, meta) {
  // 如果用户 config.update.github 填了 owner/repo，就自动生成 CDN 列表
  const g = cfg?.update?.github || meta?.github;
  if (!g || !g.owner || !g.repo) return [];
  const owner = g.owner;
  const repo  = g.repo;
  const branch = g.rawBranch || meta?.github?.rawBranch || 'main';
  const tag    = g.releaseTag || 'v' + meta.version;
  const app    = `app-${meta.version}.asar`;

  // asar 元数据 URL：放仓库源码树（main 分支 updates/asar/asar-latest.json），走 raw 分支
  const asarMeta = [
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/updates/asar/asar-latest.json`,
    `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/updates/asar/asar-latest.json`,
    `https://gcore.jsdelivr.net/gh/${owner}/${repo}@${branch}/updates/asar/asar-latest.json`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/updates/asar/asar-latest.json`,
  ];

  // asar 包 URL：【优先仓库源码树 raw（jsDelivr 对 raw 单文件放宽到 100MB）→ Release 附件兜底（50MB 限制）】
  // 注意：app-{version}.asar 必须和 asar-latest.json 一起提交到仓库 main 分支的 updates/asar/ 目录下
  const asarFile = [
    // 第 1 梯队：raw 仓库源码树（100MB 限制，体积优化后 asar 一般 20~60MB，全部命中）
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/updates/asar/${app}`,
    `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/updates/asar/${app}`,
    `https://gcore.jsdelivr.net/gh/${owner}/${repo}@${branch}/updates/asar/${app}`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/updates/asar/${app}`,
    // 第 2 梯队：Release 附件（50MB 限制，仅作为最后兜底，以防用户漏提交到仓库树）
    `https://mirror.ghproxy.com/https://github.com/${owner}/${repo}/releases/download/${tag}/${app}`,
    `https://ghproxy.com/https://github.com/${owner}/${repo}/releases/download/${tag}/${app}`,
    `https://github.com/${owner}/${repo}/releases/download/${tag}/${app}`,
  ];

  return { asarMeta, asarFile };
}

function fetchJson(urlList, timeoutMs = 10000) {
  // 顺序尝试 URL 列表，任何一个成功就返回 JSON
  return new Promise(async (resolve, reject) => {
    let lastErr = null;
    for (const url of urlList) {
      try {
        const body = await fetchText(url, timeoutMs);
        resolve(JSON.parse(body));
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    reject(lastErr || new Error('所有元数据地址均不可达'));
  });
}

/** 原生 http/https 递归跟随 301/302/307/308（最多 5 次），替代 follow-redirects 免加依赖 */
function doRequest(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', timeoutMs = 15000, maxRedirects = 5, onHeaders, onData, onEnd } = opts;
    let redirected = 0;
    const step = (u) => {
      const parsed = urlMod.parse(u);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request({
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: (parsed.pathname || '/') + (parsed.search || ''),
        headers: { 'User-Agent': 'HLParkLauncher/' + (app?.getVersion ? app.getVersion() : '1.0') },
        timeout: timeoutMs,
      }, (res) => {
        const code = res.statusCode;
        if (code >= 300 && code < 400 && res.headers.location && redirected < maxRedirects) {
          redirected++;
          const next = new urlMod.URL(res.headers.location, u).href;
          res.resume();
          req.destroy();
          return step(next);
        }
        if (code < 200 || code >= 300) {
          res.resume();
          req.destroy();
          return reject(new Error('HTTP ' + code + ' for ' + u));
        }
        if (onHeaders) try { onHeaders(res); } catch {}
        if (onData) res.on('data', (c) => onData(c));
        let bufAcc = null;
        if (!onData) { bufAcc = []; res.on('data', c => bufAcc.push(c)); }
        res.on('end', () => {
          if (onEnd) try { onEnd(); } catch {}
          resolve(bufAcc ? Buffer.concat(bufAcc) : null);
        });
        res.on('error', (e) => reject(e));
      });
      req.on('timeout', () => req.destroy(new Error('Timeout ' + u)));
      req.on('error', (e) => reject(e));
      req.end();
    };
    step(urlStr);
  });
}

function fetchText(url, timeoutMs) {
  return doRequest(url, { timeoutMs }).then(buf => buf.toString('utf-8'));
}

function sha512OfFile(p) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const s = fs.createReadStream(p);
    s.on('data', d => hash.update(d));
    s.on('end', () => resolve(hash.digest('base64')));
    s.on('error', reject);
  });
}

// ---------- 下载 asar（带进度推送） ----------
function downloadFileWithProgress(urlList, destPath, expectedSize, expectedSha512) {
  // 挨个尝试 URL：下载 .pending → 完成后校验 sha512 → 通过就 rename
  return new Promise(async (resolve, reject) => {
    let lastErr = null;
    // 若已有 pending，先删（避免坏的残留）
    if (fs.existsSync(destPath)) fs.rmSync(destPath, { force: true });

    for (const url of urlList) {
      try {
        await _downloadOne(url, destPath, expectedSize);
        // 校验
        if (expectedSize && fs.statSync(destPath).size !== expectedSize) {
          throw new Error(`size mismatch: expected ${expectedSize}, actual ${fs.statSync(destPath).size}`);
        }
        if (expectedSha512) {
          const actual = await sha512OfFile(destPath);
          if (actual !== expectedSha512) throw new Error('sha512 mismatch');
        }
        return resolve(true);
      } catch (e) {
        lastErr = e;
        try { if (fs.existsSync(destPath)) fs.rmSync(destPath, { force: true }); } catch {}
      }
    }
    reject(lastErr || new Error('下载失败'));
  });

  function _downloadOne(url, dest, expected) {
    return new Promise((res, rej) => {
      const tmp = dest + '.part';
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
      const ws = fs.createWriteStream(tmp);
      let total = expected || 0;
      let transferred = 0;
      let lastPush = 0;
      let t0 = Date.now(), acc = 0;

      doRequest(url, {
        timeoutMs: 15000,
        maxRedirects: 10,
        onHeaders: (r) => {
          const cl = Number(r.headers['content-length'] || 0);
          if (cl > 0) total = cl;
        },
        onData: (chunk) => {
          ws.write(chunk);
          transferred += chunk.length;
          acc += chunk.length;
          const now = Date.now();
          if (now - lastPush > 150) {
            lastPush = now;
            const dt = Math.max(1, now - t0) / 1000;
            const bps = Math.round(acc / dt);
            sendToRenderer(getMainWindow(), 'progress', {
              percent: total ? Math.round((transferred / total) * 100) : 0,
              transferred, total, bytesPerSecond: bps,
            });
          }
        },
        onEnd: () => {
          sendToRenderer(getMainWindow(), 'progress', {
            percent: 100,
            transferred,
            total: total || transferred,
            bytesPerSecond: 0,
          });
        },
      }).then(() => {
        ws.end(() => {
          try {
            fs.renameSync(tmp, dest);
            res(true);
          } catch (e) { rej(e); }
        });
      }).catch((e) => {
        try { ws.close(); } catch {}
        rej(e);
      });
    });
  }
}

// ---------- asar 替换 ----------
function applyPendingAsar() {
  // 1. 校验 pending 是否存在
  if (!fs.existsSync(ASAR_PENDING)) throw new Error('找不到待应用的 asar：' + ASAR_PENDING);
  // 2. resources 是否可写（perMachine=false 下用户安装到 LocalAppData 一定可写）
  try { fs.accessSync(RESOURCES, fs.constants.W_OK); } catch { throw new Error('resources 目录不可写，请使用管理员权限运行登录器或重装到用户目录'); }
  // 3. 备份当前 asar（如存在）
  if (fs.existsSync(ASAR_CURRENT)) {
    if (fs.existsSync(ASAR_BACKUP)) fs.rmSync(ASAR_BACKUP, { force: true });
    fs.renameSync(ASAR_CURRENT, ASAR_BACKUP);
  }
  // 4. 应用 pending → 当前
  try {
    fs.renameSync(ASAR_PENDING, ASAR_CURRENT);
  } catch (e) {
    // 失败回滚：把 backup 恢复回去
    try { if (fs.existsSync(ASAR_BACKUP)) fs.renameSync(ASAR_BACKUP, ASAR_CURRENT); } catch {}
    throw e;
  }
  return true;
}

// ---------- 启动回滚（下次启动时如果 app.asar 损坏就从 .bak 还原） ----------
function restoreOnBootIfNeeded() {
  try {
    const curBroken = fs.existsSync(ASAR_CURRENT) === false;
    if (curBroken && fs.existsSync(ASAR_BACKUP)) {
      fs.renameSync(ASAR_BACKUP, ASAR_CURRENT);
      console.log('[AsarUpdater] 启动时检测到 app.asar 损坏，已从 .bak 还原');
    }
  } catch (e) {
    console.warn('[AsarUpdater] 启动回滚失败（可忽略）：', e.message);
  }
}
// 模块加载时即尝试回滚（注册 IPC 的 require 阶段会调用）
restoreOnBootIfNeeded();

// ---------- 对外 API：updater.cjs 会直接调用 ----------
async function check() {
  if (!app.isPackaged) {
    return { hasUpdate: false, reason: 'dev-mode' };
  }
  try {
    const cfg = await readConfig().catch(() => ({}));
    // 先用 user config 里的 GitHub 配置去尝试生成元数据 URL
    const tempUrls = buildMetaUrlsFromConfig(cfg, { version: 'latest' });
    if (!tempUrls.asarMeta || tempUrls.asarMeta.length === 0) {
      return { hasUpdate: false, reason: 'no-github-config' };
    }
    const meta = await fetchJson(tempUrls.asarMeta, 8000);
    currentMeta = meta;

    const cur = app.getVersion();
    const newer = cmpVersion(cur, meta.version) < 0;
    const okMin = meta.requiredMinVersion ? cmpVersion(cur, meta.requiredMinVersion) >= 0 : true;

    if (!newer) {
      fallbackNsisRequired = false;
      return { hasUpdate: false, reason: 'already-latest', version: meta.version };
    }
    if (!okMin) {
      fallbackNsisRequired = true;
      return { hasUpdate: true, needFullNsis: true, version: meta.version, notes: meta.notes || '' };
    }
    fallbackNsisRequired = false;
    // 自动生成完整的 URL 列表（元数据里如果已经写了 meta.asar.urls 就优先它）
    if (!meta.asar?.urls || !meta.asar.urls.length) {
      const full = buildMetaUrlsFromConfig(cfg, meta);
      meta.asar = { ...(meta.asar || {}), urls: full.asarFile };
    }
    return { hasUpdate: true, needFullNsis: false, version: meta.version, notes: meta.notes || '', asarMeta: meta.asar };
  } catch (e) {
    // asar 通道完全挂掉 → 让 updater.cjs 走 NSIS 兜底
    fallbackNsisRequired = true;
    return { hasUpdate: null, error: e.message };
  }
}

async function download() {
  if (!currentMeta?.asar) throw new Error('没有可用的 asar 元数据，请先 check()');
  if (!currentMeta.asar.urls?.length) throw new Error('asar URL 列表为空');
  const size  = currentMeta.asar.size || 0;
  const sha   = currentMeta.asar.sha512 || null;
  await downloadFileWithProgress(currentMeta.asar.urls, ASAR_PENDING, size, sha);
  return true;
}

function applyAndRestart() {
  applyPendingAsar();
  // 启动前清理一下：下次启动成功用户确认 OK 后应该删掉 .bak 释放磁盘；
  // 这里保守策略是保留一份 .bak，下次发版时会覆盖为上一版备份，最多占 20MB 可接受
  app.relaunch({ args: process.argv.slice(1).concat(['--asar-restored']) });
  app.quit(0);
  return true;
}

// ---------- IPC 直接入口（可选，单独调用 asar 更新用，updater.cjs 已经走集成分支） ----------
ipcMain.handle('asar-updater:check', async () => { try { return await check(); } catch (e) { return { success: false, error: e.message }; } });
ipcMain.handle('asar-updater:download', async () => { try { return { success: await download() }; } catch (e) { return { success: false, error: e.message }; } });
ipcMain.handle('asar-updater:restart', async () => { try { return { success: applyAndRestart() }; } catch (e) { return { success: false, error: e.message }; } });

module.exports = {
  check,
  download,
  applyAndRestart,
  isFallbackNsisRequired: () => fallbackNsisRequired,
};
