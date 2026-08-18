/// <reference types="vite/client" />

/**
 * Electron 预加载脚本暴露的 API 类型声明
 * 定义 window.electronAPI 的完整接口
 */
interface ElectronAPI {
  // 补丁更新
  calculatePatchDiff(manifest: any, clientPath: string): Promise<any>
  applyPatches(downloadedFiles: any[], toDelete: string[], clientPath: string): Promise<any>
  onApplyProgress(callback: (progress: any) => void): () => void
  rollback(backupPath: string, clientPath: string): Promise<any>

  // 文件下载
  downloadFiles(files: any[], tempDir: string, concurrency: number): Promise<any>
  onDownloadProgress(callback: (progress: any) => void): () => void
  cancelDownload(): Promise<void>

  // 游戏启动
  launchGame(exePath: string, args?: string): Promise<any>
  prepareAndLaunchGame(clientPath: string, serverIp: string): Promise<any>
  isGameRunning(): Promise<any>

  // 配置管理
  readConfig(): Promise<any>
  writeConfig(config: any): Promise<any>

  // 系统对话框
  selectDirectory(): Promise<any>
  selectFile(): Promise<any>

  // 应用信息
  getAppVersion(): Promise<string>
  getAppDataPath(): Promise<string>

  // 系统外壳
  shellOpenExternal(url: string): Promise<any>

  // 登录器自动更新（asar 增量 + NSIS 全量 双链路）
  checkForUpdates(): Promise<{ success: boolean; error?: string; mode?: 'asar' | 'nsis' | 'idle' }>
  downloadUpdate(): Promise<{ success: boolean; error?: string }>
  quitAndInstall(): Promise<{ success: boolean; error?: string }>

  /**
   * 监听更新事件（updater:* 通道）
   * - available 事件会附带更新类型：
   *     updateType = 'asar' | 'nsis'
   *     isAsarUpdate = true  （⚡ 增量 asar 热更，3~20MB，秒级重启）
   *     isAsarUpdate = false （🗜️ 完整 NSIS 安装包，100~150MB，需走完安装器）
   */
  onUpdateEvent(callback: (event: UpdateEvent, data: UpdateEventData) => void): () => void

  // ================ asar-updater 直接调用入口（可选）================
  // 一般不直接调用，会通过 electronAPI.checkForUpdates() 自动选 asar/nsis 链路
  asarUpdaterCheck(): Promise<{ hasUpdate?: boolean; needFullNsis?: boolean; version?: string; error?: string }>
  asarUpdaterDownload(): Promise<{ success: boolean; error?: string }>
  asarUpdaterRestart(): Promise<{ success: boolean; error?: string }>
}

type UpdateEvent =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'progress'
  | 'downloaded'
  | 'error'

interface UpdateEventData {
  version?: string
  releaseDate?: string
  releaseNotes?: string
  message?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  /** B 方案新增：更新类型标记 */
  updateType?: 'asar' | 'nsis'
  isAsarUpdate?: boolean
}

declare const electronAPI: ElectronAPI

interface Window {
  electronAPI: ElectronAPI
}
