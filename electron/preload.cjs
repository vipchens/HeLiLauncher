/**
 * 预加载脚本 (preload.cjs)
 *
 * 核心安全机制：
 * - 运行在渲染进程可以访问 Node.js 的隔离上下文中
 * - 通过 contextBridge.exposeInMainWorld 安全地向前端暴露 API
 * - 前端只能调用此处暴露的方法，无法直接访问 Node.js 或文件系统
 *
 * 设计模式：门面模式（Facade）
 * - 将多个 IPC 调用封装为语义化方法
 * - 前端调用 window.electronAPI.checkPatch() 而非 ipcRenderer.invoke('patch:check')
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露给前端的 API 对象
const electronAPI = {
  // ================ 补丁更新 ================

  /**
   * 计算本地文件与远程清单的差异
   * @param {Object} manifest - 远程补丁清单
   * @param {string} clientPath - 客户端根目录
   * @returns {Promise<Object>} { toDownload, toDelete, unchanged, totalDownloadSize }
   */
  calculatePatchDiff: (manifest, clientPath) =>
    ipcRenderer.invoke('patch:calculate-diff', { manifest, clientPath }),

  /**
   * 应用补丁（替换文件 + 删除文件）
   * 进度通过 onApplyProgress 事件推送
   * @param {Array} downloadedFiles - 已下载的文件列表 [{ tempPath, targetPath }]
   * @param {Array} toDelete - 需要删除的文件路径列表
   * @param {string} clientPath - 客户端根目录
   * @returns {Promise<Object>} { success, backupPath }
   */
  applyPatches: (downloadedFiles, toDelete, clientPath) =>
    ipcRenderer.invoke('patch:apply', { downloadedFiles, toDelete, clientPath }),

  /**
   * 监听补丁应用进度事件
   * @param {Function} callback - 进度回调 ({ phase, current, total, fileName }) => void
   * @returns {Function} 取消监听函数
   */
  onApplyProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('patch:apply-progress', handler);
    return () => ipcRenderer.removeListener('patch:apply-progress', handler);
  },

  /**
   * 回滚到备份版本
   * @param {string} backupPath - 备份目录路径
   * @param {string} clientPath - 客户端根目录
   * @returns {Promise<Object>} { success }
   */
  rollback: (backupPath, clientPath) =>
    ipcRenderer.invoke('patch:rollback', { backupPath, clientPath }),

  // ================ 文件下载 ================

  /**
   * 批量下载文件（支持断点续传 + 并发控制）
   * @param {Array} files - 文件列表 [{ id, path, hash, size, url }]
   * @param {string} tempDir - 临时下载目录
   * @param {number} concurrency - 并发数
   * @returns {Promise<Object>} { success, downloadedFiles }
   *
   * 进度通过事件推送：
   *   electronAPI.onDownloadProgress((progress) => { ... })
   */
  downloadFiles: (files, tempDir, concurrency) =>
    ipcRenderer.invoke('download:batch', { files, tempDir, concurrency }),

  /**
   * 监听下载进度事件
   * @param {Function} callback - 进度回调 (progress) => void
   * @returns {Function} 取消监听函数
   */
  onDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('download:progress', handler);
    // 返回取消监听函数，组件卸载时调用
    return () => ipcRenderer.removeListener('download:progress', handler);
  },

  /**
   * 取消正在进行的下载
   */
  cancelDownload: () => ipcRenderer.invoke('download:cancel'),

  // ================ 游戏启动 ================

  /**
   * 启动游戏
   * @param {string} exePath - Wow.exe 完整路径
   * @param {string} args - 启动参数（可选）
   * @returns {Promise<Object>} { success, pid }
   */
  launchGame: (exePath, args) =>
    ipcRenderer.invoke('game:launch', { exePath, args }),

  /**
   * 准备并启动游戏（写入 realmlist.wtf 后启动）
   * @param {string} clientPath - Wow.exe 完整路径
   * @param {string} serverIp - 服务器 IP 地址
   * @returns {Promise<Object>} { success, pid?, realmlistPath?, error?, step? }
   */
  prepareAndLaunchGame: (clientPath, serverIp) =>
    ipcRenderer.invoke('game:prepare-and-launch', { clientPath, serverIp }),

  /**
   * 检测游戏是否正在运行
   * @returns {Promise<Object>} { running, pid }
   */
  isGameRunning: () => ipcRenderer.invoke('game:is-running'),

  // ================ 配置管理 ================

  /**
   * 读取本地配置文件
   * @returns {Promise<Object>} 配置对象
   */
  readConfig: () => ipcRenderer.invoke('config:read'),

  /**
   * 写入本地配置文件
   * @param {Object} config - 配置对象
   * @returns {Promise<Object>} { success }
   */
  writeConfig: (config) => ipcRenderer.invoke('config:write', { config }),

  // ================ 系统对话框 ================

  /**
   * 打开目录选择对话框
   * @returns {Promise<Object>} { canceled, path }
   */
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  /**
   * 打开文件选择对话框（用于选择 Wow.exe）
   * @returns {Promise<Object>} { canceled, path }
   */
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),

  // ================ 应用信息 ================

  /** 获取应用版本号 */
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  /** 获取应用数据目录路径（用户配置存储位置） */
  getAppDataPath: () => ipcRenderer.invoke('app:data-path'),

  // ================ 系统外壳 ================

  /**
   * 调用系统默认浏览器打开外部链接
   * 通过 IPC 转发到主进程执行（sandbox 模式下 preload 无法直接使用 shell）
   * @param {string} url - 目标URL
   * @returns {Promise<{success: boolean}>}
   */
  shellOpenExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // ================ 登录器自动更新 ================

  /**
   * 检查登录器是否有新版本
   * 结果通过 onUpdateProgress 事件推送：
   *   - updater:available  → 发现新版本
   *   - updater:not-available → 已是最新
   *   - updater:error → 检查失败
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),

  /**
   * 下载更新包
   * 进度通过 onUpdateProgress 事件推送：
   *   - updater:progress → 下载进度
   *   - updater:downloaded → 下载完成
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),

  /**
   * 退出登录器并安装更新
   * @returns {Promise<{success: boolean}>}
   */
  quitAndInstall: () => ipcRenderer.invoke('updater:install'),

  /**
   * 监听更新事件
   * @param {Function} callback - 回调 (event, data) => void
   *   event 取值：'available' | 'not-available' | 'progress' | 'downloaded' | 'error' | 'checking'
   *   data 新增字段（B 方案）：
   *     - updateType: 'asar' | 'nsis'
   *     - isAsarUpdate: true | false
   *     - releaseNotes: asar 增量备注 or electron-updater releaseNotes
   * @returns {Function} 取消监听函数
   */
  onUpdateEvent: (callback) => {
    const channels = [
      'updater:checking',
      'updater:available',
      'updater:not-available',
      'updater:progress',
      'updater:downloaded',
      'updater:error',
    ];
    const handlers = channels.map((ch) => {
      const h = (_event, data) => callback(ch.replace('updater:', ''), data || {});
      ipcRenderer.on(ch, h);
      return { ch, h };
    });
    return () => handlers.forEach(({ ch, h }) => ipcRenderer.removeListener(ch, h));
  },

  // ================ asar 增量热更新（直接调用入口，通常会被上面的 updater:check 优先选到）================
  asarUpdaterCheck: () => ipcRenderer.invoke('asar-updater:check'),
  asarUpdaterDownload: () => ipcRenderer.invoke('asar-updater:download'),
  asarUpdaterRestart: () => ipcRenderer.invoke('asar-updater:restart'),
};

// 通过 contextBridge 安全暴露到渲染进程的 window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
