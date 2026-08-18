/**
 * Electron 主进程入口
 *
 * 职责：
 * 1. 创建应用窗口（BrowserWindow），配置安全参数
 * 2. 系统托盘（最小化到托盘，右键菜单）
 * 3. CORS 处理（注入 Access-Control-Allow-Origin 头，解决渲染进程跨域）
 * 4. 注册所有 IPC 处理器
 * 5. 开发环境加载 Vite dev server，生产环境加载打包后的 index.html
 */

const { app, BrowserWindow, Tray, Menu, session, ipcMain, dialog, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const { readConfig } = require('./ipc/config.cjs');

// 是否为开发环境（通过环境变量判断）
const isDev = !app.isPackaged;

// 开发模式提示
if (isDev) {
  const devIp = process.env.ELECTRON_DEV_SERVER_IP;
  if (devIp) {
    console.log(`[Main] 开发模式（本地调试）→ 服务器: http://${devIp}:3000`);
  } else {
    console.log('[Main] 开发模式（生产调试）→ 服务器: http://117.72.202.12:3000');
  }
}

// 主窗口和托盘引用（防止被GC回收）
let mainWindow = null;
let tray = null;
// 是否用户主动退出（从托盘菜单选择"退出"）
let isQuitting = false;

/**
 * 创建主窗口
 * 安全配置：
 * - contextIsolation: true   渲染进程与Node.js隔离
 * - nodeIntegration: false   前端无法直接使用Node API
 * - sandbox: false           Electron 22.x 下 preload.cjs 使用 require()，需关闭沙箱
 */
// 获取图标路径（开发环境从 build/ 目录，生产环境从 extraResources 目录）
function getIconPath() {
  const devPath = path.join(__dirname, '../build/icon.ico');
  const prodPath = path.join(process.resourcesPath, 'icon.ico');
  return isDev ? devPath : prodPath;
}

function createWindow() {
  // 图标路径（不存在时使用默认图标）
  const iconPath = getIconPath();
  const iconExists = require('fs').existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: '河狸乐园登录器',
    ...(iconExists ? { icon: iconPath } : {}),
    // 隐藏原生标题栏，使用自定义标题栏（可选）
    // frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  // 移除默认菜单栏
  Menu.setApplicationMenu(null);

  // 注册 DevTools 快捷键（F12 / Ctrl+Shift+I）— 仅开发环境生效
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  // 根据环境加载不同入口
  if (isDev) {
    // 开发环境：加载 Vite dev server
    mainWindow.loadURL('http://localhost:1420');
    // 自动打开开发者工具
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载打包后的 HTML 文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 窗口关闭按钮：根据设置决定隐藏到托盘还是真正关闭
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      // 同步读取配置判断是否最小化到托盘
      let minimizeToTray = true;
      try {
        // readConfig 是 async，这里用同步方式读取文件
        const configPath = path.join(app.getPath('userData'), 'config.json');
        const raw = require('fs').readFileSync(configPath, 'utf-8');
        const config = JSON.parse(raw);
        minimizeToTray = config.settings?.minimizeToTray !== false;
      } catch {}

      if (minimizeToTray && tray) {
        e.preventDefault();
        mainWindow.hide();
        return;
      }
    }
    // 不拦截，窗口正常关闭
  });

  // 窗口关闭后清除引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 创建系统托盘
 * - 关闭窗口时最小化到托盘而非退出
 * - 右键菜单：显示窗口 / 退出
 */
function createTray() {
  const trayIconPath = getIconPath();
  const iconExists = require('fs').existsSync(trayIconPath);
  // 图标不存在时使用空白 NativeImage 作为兜底，避免 Tray 构造抛异常
  const trayIcon = iconExists ? trayIconPath : nativeImage.createEmpty();
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示登录器',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('河狸乐园登录器');
  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

/**
 * 处理 CORS 问题
 *
 * Electron 渲染进程本质是 Chromium，请求远程 API 时会遇到 CORS 限制。
 * 通过 webRequest 拦截响应头，注入 Access-Control-Allow-Origin: *
 * 这样前端 axios/fetch 可以直接请求 AccountServer API
 */
function setupCors() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    // 注入 CORS 头，允许渲染进程跨域请求
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];

    callback({ responseHeaders });
  });
}

/**
 * 注册所有 IPC 处理器
 * 各模块在各自文件中通过 ipcMain.handle 注册具体通道
 */
function registerIpcHandlers() {
  // 导入 IPC 模块（导入即注册）
  require('./ipc/index.cjs');
}

// ================ 应用生命周期 ================

// Electron 完成初始化后触发
app.whenReady().then(() => {
  // 先注册 IPC 处理器，确保前端调用时已就绪
  registerIpcHandlers();
  setupCors();
  createWindow();
  // 托盘创建失败不应影响主功能
  try {
    createTray();
  } catch (e) {
    console.error('[Main] Tray creation failed:', e.message);
  }

  // macOS 激活时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
