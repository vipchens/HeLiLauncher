/**
 * 补丁更新 Store
 *
 * 管理补丁检查、下载、应用的全流程状态
 * 状态机模型：idle → checking → hasUpdate → downloading → applying → done/error
 *
 * Electron 环境：通过 IPC 调用主进程执行文件 hash、下载、应用
 * 浏览器环境：仅支持检查版本（无法操作文件系统）
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PatchManifest, PatchDiff, DownloadProgress, ApplyProgress, PatchLogLine } from '@/types'
import * as patchApi from '@/api/modules/patch'
import { useConfigStore } from './config'

/** 补丁更新状态枚举 */
export type PatchState = 'idle' | 'checking' | 'upToDate' | 'hasUpdate' | 'downloading' | 'applying' | 'done' | 'error'

/** 判断是否运行在 Electron 环境中 */
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export const usePatchStore = defineStore('patch', () => {
  // ================ State ================
  const state = ref<PatchState>('idle')
  const remoteVersion = ref<string>('')
  const releaseDate = ref<string>('')
  const manifest = ref<PatchManifest | null>(null)
  const diff = ref<PatchDiff | null>(null)
  const progress = ref<DownloadProgress | null>(null)
  const applyProgress = ref<ApplyProgress | null>(null)
  const errorMessage = ref<string>('')
  const backupPath = ref<string>('')
  const logLines = ref<PatchLogLine[]>([])

  // ================ Getters ================
  const isUpdating = computed(() => state.value === 'downloading' || state.value === 'applying')
  const hasUpdate = computed(() => state.value === 'hasUpdate')
  const isUpToDate = computed(() => state.value === 'upToDate')

  // ================ Helpers ================

  /** 添加日志行 */
  function addLog(text: string, level: PatchLogLine['level'] = 'info') {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    logLines.value.push({ time, level, text })
  }

  // ================ Actions ================

  /**
   * 检查补丁更新
   * 1. 请求远程版本号
   * 2. 与本地版本对比
   * 3. 若有更新，获取清单并自动计算差异
   */
  async function checkUpdate() {
    const configStore = useConfigStore()
    state.value = 'checking'
    errorMessage.value = ''
    addLog('正在检查补丁更新...')

    try {
      // 步骤1: 获取远程版本号
      const versionRes = await patchApi.getPatchVersion()
      if (!versionRes.success || !versionRes.data) {
        throw new Error('获取补丁版本失败')
      }

      remoteVersion.value = versionRes.data.version
      releaseDate.value = versionRes.data.releaseDate
      addLog(`远程版本: ${remoteVersion.value}`)

      // 步骤2: 获取完整清单（不论版本是否一致，都需要校验文件 hash）
      const manifestRes = await patchApi.getManifest()
      if (!manifestRes.success || !manifestRes.data) {
        throw new Error('获取补丁清单失败')
      }

      manifest.value = manifestRes.data
      configStore.updateCheckTime()
      addLog(`补丁清单: ${manifest.value.totalFiles} 个文件, ${(manifest.value.totalSize / 1024 / 1024).toFixed(1)} MB`)

      // 步骤3: 对比本地版本
      if (configStore.localVersion !== remoteVersion.value) {
        addLog(`发现新版本: ${remoteVersion.value}`)
        state.value = 'hasUpdate'
      } else {
        addLog('版本号一致，正在校验文件完整性...')
      }

      // 步骤4: 自动计算差异（Electron 环境）
      if (isElectron && configStore.isClientPathSet) {
        await calculateDiff()

        // 版本一致时，根据文件校验结果决定最终状态
        if (configStore.localVersion === remoteVersion.value) {
          const needUpdate = diff.value && (diff.value.toDownload.length > 0 || diff.value.toDelete.length > 0)
          if (needUpdate) {
            state.value = 'hasUpdate'
            addLog(`校验完成: ${diff.value!.toDownload.length} 个文件需要修复`, 'warn')
            return { hasUpdate: true, remoteVersion: remoteVersion.value }
          } else {
            state.value = 'upToDate'
            addLog('所有文件完整无误', 'info')
            return { hasUpdate: false, remoteVersion: remoteVersion.value }
          }
        }
      } else {
        // 非 Electron 环境，仅按版本号判断
        if (configStore.localVersion === remoteVersion.value) {
          state.value = 'upToDate'
          addLog('已是最新版本', 'info')
        }
      }

      const hasUpdateResult = state.value === 'hasUpdate'
      return { hasUpdate: hasUpdateResult, remoteVersion: remoteVersion.value }
    } catch (e) {
      state.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '检查更新失败'
      addLog(`检查失败: ${errorMessage.value}`, 'error')
      throw e
    }
  }

  /**
   * 计算文件差异
   * Electron 环境：调用主进程扫描本地文件并对比 SHA-256
   */
  async function calculateDiff() {
    if (!manifest.value) return

    const configStore = useConfigStore()

    if (isElectron && configStore.isClientPathSet) {
      try {
        addLog('正在扫描本地文件...')
        const result = await window.electronAPI.calculatePatchDiff(
          JSON.parse(JSON.stringify(manifest.value)),
          configStore.settings.clientPath,
        )
        diff.value = result
        addLog(`差异: 下载 ${result.toDownload.length} 个, 删除 ${result.toDelete.length} 个, 无需更新 ${result.unchanged.length} 个`)
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : '计算差异失败'
        addLog(`差异计算失败: ${msg}`, 'error')
        throw e
      }
    } else {
      addLog('需要设置客户端路径才能计算差异', 'warn')
    }
  }

  /**
   * 开始下载补丁
   * 1. 检查游戏是否在运行
   * 2. 从 CDN 下载文件（URL 从 manifest.baseUrl 拼接）
   * 3. 应用补丁（备份→覆盖→删除）
   * 4. 更新本地版本号
   */
  async function startDownload() {
    if (!diff.value || !manifest.value) return

    const configStore = useConfigStore()

    if (!isElectron) {
      addLog('Electron 环境才能下载文件', 'warn')
      return
    }

    // 检查游戏是否在运行
    try {
      const gameStatus = await window.electronAPI.isGameRunning()
      if (gameStatus.running) {
        addLog('游戏正在运行，无法更新补丁', 'error')
        throw new Error('游戏正在运行，请先关闭游戏后再更新补丁')
      }
    } catch (e) {
      // isGameRunning 可能不可用，继续执行
      console.warn('[PatchStore] isGameRunning check failed:', e)
    }

    state.value = 'downloading'
    errorMessage.value = ''
    addLog('开始下载补丁...')

    try {
      // 构建下载文件列表
      // URL 优先从 manifest.baseUrl 拼接（直连 CDN）
      // AccountServer 静态文件兜底，作为 fallbackUrl
      const baseUrl = manifest.value.baseUrl
      const serverStaticBase = configStore.serverUrl.replace(/\/$/, '') + '/client_patch'
      const filesToDownload = diff.value.toDownload.map((f) => ({
        ...f,
        url: `${baseUrl}/${f.path}`,
        fallbackUrl: `${serverStaticBase}/${f.path}`,
      }))

      // 临时目录路径
      const appDataPath = await window.electronAPI.getAppDataPath()
      const tempDir = `${appDataPath}/patch-temp`
      const concurrency = configStore.settings.settings.downloadConcurrency || 4

      addLog(`下载目录: ${tempDir}`)
      addLog(`并发数: ${concurrency}, 文件数: ${filesToDownload.length}`)

      // 监听下载进度
      const unsubscribeProgress = window.electronAPI.onDownloadProgress((p) => {
        progress.value = p
      })

      // 执行下载
      const downloadResult = await window.electronAPI.downloadFiles(
        filesToDownload,
        tempDir,
        concurrency,
      )

      unsubscribeProgress()

      if (!downloadResult.success) {
        throw new Error(downloadResult.error || '下载失败')
      }

      addLog(`下载完成: ${downloadResult.downloadedFiles.length} 个文件`)

      // 下载完成，应用补丁
      state.value = 'applying'
      progress.value = null
      addLog('正在应用补丁...')

      // 监听应用进度
      const unsubscribeApply = window.electronAPI.onApplyProgress((p) => {
        applyProgress.value = p
        if (p.phase === 'backup') {
          addLog(`备份: ${p.fileName} (${p.current}/${p.total})`)
        } else if (p.phase === 'apply') {
          addLog(`覆盖: ${p.fileName} (${p.current}/${p.total})`)
        } else if (p.phase === 'delete') {
          addLog(`删除: ${p.fileName} (${p.current}/${p.total})`)
        }
      })

      const applyResult = await window.electronAPI.applyPatches(
        downloadResult.downloadedFiles,
        JSON.parse(JSON.stringify(diff.value.toDelete)),
        configStore.settings.clientPath,
      )

      unsubscribeApply()
      applyProgress.value = null

      if (!applyResult.success) {
        // 应用失败，保留 backupPath 供用户手动回滚
        backupPath.value = applyResult.backupPath || ''
        throw new Error(applyResult.error || '应用补丁失败')
      }

      addLog('补丁应用成功')

      // 更新本地版本号
      await configStore.setLocalVersion(remoteVersion.value)
      addLog(`本地版本已更新: ${remoteVersion.value}`)

      state.value = 'done'
      progress.value = null
    } catch (e) {
      state.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '下载失败'
      addLog(`更新失败: ${errorMessage.value}`, 'error')
      throw e
    }
  }

  /**
   * 手动回滚到备份版本
   */
  async function rollback() {
    if (!backupPath.value) {
      addLog('没有可用的备份', 'warn')
      return
    }

    const configStore = useConfigStore()

    if (!isElectron) return

    addLog(`正在回滚: ${backupPath.value}`)
    state.value = 'applying'

    try {
      const result = await window.electronAPI.rollback(backupPath.value, configStore.settings.clientPath)
      if (result.success) {
        addLog('回滚成功')
        state.value = 'idle'
        backupPath.value = ''
      } else {
        addLog(`回滚失败: ${result.error}`, 'error')
        throw new Error(result.error)
      }
    } catch (e) {
      state.value = 'error'
      addLog(`回滚失败: ${e instanceof Error ? e.message : '未知错误'}`, 'error')
      throw e
    }
  }

  /**
   * 取消更新
   */
  async function cancelUpdate() {
    if (isElectron) {
      await window.electronAPI.cancelDownload()
    }
    state.value = 'idle'
    progress.value = null
    applyProgress.value = null
    addLog('更新已取消', 'warn')
  }

  /**
   * 校验文件完整性
   * 强制扫描本地文件 hash，不依赖版本号判断
   * 即使版本号一致，如果文件被篡改/删除也能发现并修复
   */
  async function verifyIntegrity() {
    const configStore = useConfigStore()

    state.value = 'checking'
    errorMessage.value = ''
    addLog('正在校验文件完整性...')

    try {
      // 获取远程清单（不论版本号是否一致）
      const manifestRes = await patchApi.getManifest()
      if (!manifestRes.success || !manifestRes.data) {
        throw new Error('获取补丁清单失败')
      }

      manifest.value = manifestRes.data
      remoteVersion.value = manifestRes.data.version

      if (!isElectron || !configStore.isClientPathSet) {
        addLog('需要设置客户端路径才能校验', 'warn')
        state.value = 'idle'
        return
      }

      // 强制计算差异
      await calculateDiff()

      if (!diff.value) return

      const needUpdate = diff.value.toDownload.length > 0 || diff.value.toDelete.length > 0
      if (needUpdate) {
        state.value = 'hasUpdate'
        addLog(`校验完成: 发现 ${diff.value.toDownload.length} 个文件需要修复, ${diff.value.toDelete.length} 个需要删除`, 'warn')
      } else {
        state.value = 'upToDate'
        addLog('校验完成: 所有文件完整无误', 'info')
      }
    } catch (e) {
      state.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : '校验失败'
      addLog(`校验失败: ${errorMessage.value}`, 'error')
      throw e
    }
  }

  /** 重置状态 */
  function reset() {
    state.value = 'idle'
    errorMessage.value = ''
    progress.value = null
    applyProgress.value = null
    backupPath.value = ''
    logLines.value = []
  }

  return {
    // state
    state,
    remoteVersion,
    releaseDate,
    manifest,
    diff,
    progress,
    applyProgress,
    errorMessage,
    backupPath,
    logLines,
    // getters
    isUpdating,
    hasUpdate,
    isUpToDate,
    // actions
    checkUpdate,
    calculateDiff,
    verifyIntegrity,
    startDownload,
    rollback,
    cancelUpdate,
    reset,
    addLog,
  }
})
