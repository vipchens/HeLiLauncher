/**
 * 登录器自动更新 IPC 模块（asar 增量 + NSIS 全量 双链路）
 *
 * 【B 方案集成】
 *  1. 先尝试 asar 增量热更新（GitHub + 免费 CDN 双链路 fallback）
 *     - 条件：config.update.github 配置了 owner/repo + 当前版本 >= asar-latest.requiredMinVersion
 *     - 优势：只有 3~20MB，比 NSIS 全量快 5~10 倍，不需要管理员权限，不需要重新走安装器
 *  2. 条件不满足 / asar 通道挂 / 版本跨度过大 → 回落到 electron-updater NSIS 全量（原有逻辑兜底）
 *
 * 事件通道（保持原样，前端 UpdaterDialog.vue 不用换监听逻辑）：
 *   updater:checking / available / not-available / progress / downloaded / error
 *   available 事件数据新增字段：
 *     - isAsarUpdate: true | false     （标记是增量 asar 还是完整 NSIS）
 *     - updateType: 'asar' | 'nsis'    （同上，前端显示标签用）
 *     - releaseNotes: asar.notes 或 electron-updater.releaseNotes
 */

const { ipcMain, app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const { readConfig } = require('./config.cjs');
const asarUpdater = require('./asar-updater.cjs');

autoUpdater.autoDownload = false;
let feedUrlInitialized = false;

/** 全局 pending：下一次 download/install 是走 asar 还是 NSIS（由 check 阶段决定） */
let pendingMode = null; // 'asar' | 'nsis' | null

// ========== 保持与 asar-updater 一致的 sendToRenderer（相同事件通道）==========
function getSender() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  return win ? win.webContents : null;
}
function sendToRenderer(channel, data) {
  const s = getSender();
  if (s) s.send(channel, data || {});
}

/** 向渲染进程发送标准化 updater:* 事件，会附加 mode 字段 */
function emit(name, extra = {}) {
  const channel = 'updater:' + name;
  const payload = { ...extra };
  if (pendingMode && (name === 'available' || name === 'downloaded')) {
    payload.updateType = pendingMode;
    payload.isAsarUpdate = pendingMode === 'asar';
  }
  sendToRenderer(channel, payload);
}

// ========== 原有 NSIS 兜底链路（electron-updater） ==========
async function initFeedUrl() {
  if (feedUrlInitialized) return;
  try {
    const config = await readConfig();
    const serverIp = config.serverIp || '117.72.202.12';
    const feedUrl = `http://${serverIp}:3000/updates/`;
    autoUpdater.setFeedURL(feedUrl);
    feedUrlInitialized = true;
    console.log('[Updater] NSIS Feed URL:', feedUrl);
  } catch (err) {
    console.warn('[Updater] NSIS feed init failed:', err.message);
  }
}

// NSIS 事件（只在 pendingMode==='nsis' 或 pendingMode==null 时才转发，避免与 asar 事件冲突）
autoUpdater.on('error', (err) => {
  if (pendingMode === 'asar') return;
  console.error('[Updater:NSIS] Error:', err.message);
  emit('error', { message: err.message });
});
autoUpdater.on('checking-for-update', () => {
  if (pendingMode === 'asar') return;
  emit('checking');
});
autoUpdater.on('update-available', (info) => {
  if (pendingMode === 'asar') return;
  pendingMode = 'nsis';
  console.log('[Updater:NSIS] available:', info.version);
  emit('available', {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
  });
});
autoUpdater.on('update-not-available', (info) => {
  if (pendingMode === 'asar') return;
  emit('not-available', { version: info?.version || app.getVersion() });
});
autoUpdater.on('download-progress', (p) => {
  if (pendingMode === 'asar') return;
  emit('progress', {
    percent: Math.round(p.percent),
    transferred: p.transferred,
    total: p.total,
    bytesPerSecond: p.bytesPerSecond,
  });
});
autoUpdater.on('update-downloaded', (info) => {
  if (pendingMode === 'asar') return;
  emit('downloaded', { version: info.version });
});

// ========== asar 检查分支 ==========
async function _tryAsarCheck() {
  emit('checking');
  const res = await asarUpdater.check();

  // asar 通道不可用 / 没配置 GitHub → 返回 false，让外层用 NSIS
  if (!res || (res.hasUpdate === null) || res.reason === 'no-github-config' || res.reason === 'dev-mode') {
    return false;
  }
  if (res.reason === 'already-latest') {
    emit('not-available', { version: res.version || app.getVersion() });
    return true; // 已经把 not-available 推给前端，整个 check 流程结束
  }
  if (res.hasUpdate && res.needFullNsis) {
    // asar 说：要更，但版本跨度过大 → 强制走 NSIS 全量
    pendingMode = 'nsis';
    return false; // 告诉外层 fallback 到 NSIS 检查
  }
  if (res.hasUpdate && !res.needFullNsis) {
    pendingMode = 'asar';
    console.log('[Updater:ASAR] available:', res.version);
    emit('available', {
      version: res.version,
      releaseDate: res.asarMeta?.releaseDate || new Date().toISOString(),
      releaseNotes: res.notes || '',
      isAsarUpdate: true,
      updateType: 'asar',
    });
    return true;
  }
  return false;
}

// ========== IPC 处理器（前端调用入口） ==========
ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) {
    return { success: false, error: '开发环境下无法检查更新，仅打包后生效' };
  }
  // 第一步：优先 asar 链路
  try {
    const handledByAsar = await _tryAsarCheck();
    if (handledByAsar) {
      return { success: true, mode: pendingMode || 'idle' };
    }
  } catch (e) {
    console.warn('[Updater] asar check 异常，回落 NSIS：', e.message);
  }
  // 第二步：fallback 走 NSIS 全量
  pendingMode = 'nsis';
  await initFeedUrl();
  try {
    autoUpdater.checkForUpdates();
    return { success: true, mode: 'nsis' };
  } catch (err) {
    emit('error', { message: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('updater:download', async () => {
  if (!app.isPackaged) {
    return { success: false, error: '开发环境下无法下载更新' };
  }
  try {
    if (pendingMode === 'asar') {
      await asarUpdater.download();
      emit('downloaded', {});
      return { success: true };
    }
    // nsis
    autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    emit('error', { message: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('updater:install', async () => {
  if (!app.isPackaged) {
    return { success: false, error: '开发环境下无法安装更新' };
  }
  try {
    if (pendingMode === 'asar') {
      asarUpdater.applyAndRestart();
      return { success: true };
    }
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (err) {
    emit('error', { message: err.message });
    return { success: false, error: err.message };
  }
});

module.exports = { initFeedUrl };
