/**
 * 配置 Store
 *
 * 管理登录器的本地配置：服务器地址、客户端路径、用户偏好设置等
 * 采用单例模式，整个应用共享同一份配置
 *
 * 存储策略：
 * - Electron 环境：通过 IPC 读写用户数据目录下的 config.json（跨设备持久化）
 * - 浏览器环境（开发降级）：使用 localStorage
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LauncherSettings } from '@/types'

// 服务器端口（固定）
const SERVER_PORT = 3000

// 独立的 asar 增量更新默认 GitHub 配置（非可选，用于类型收窄，避免 strict 模式下 DEFAULT_SETTINGS.update?.github 报错）
const DEFAULT_UPDATE_GITHUB = {
  owner: 'vipchens',
  repo: 'HeLiLauncher',
  rawBranch: 'main',
}

// 默认配置
const DEFAULT_SETTINGS: LauncherSettings = {
  serverIp: '117.72.202.12',
  clientPath: '',
  localVersion: '0.0.0',
  settings: {
    autoCheck: true,
    autoStartGame: false,
    minimizeToTray: true,
    downloadConcurrency: 4,
    maxRetry: 5,
    backupEnabled: true,
  },
  update: {
    github: DEFAULT_UPDATE_GITHUB,
  },
  lastCheckTime: null,
}

// localStorage 存储键（浏览器降级用）
const STORAGE_KEY = 'wow_launcher_settings'

/** 判断是否运行在 Electron 环境中 */
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export const useConfigStore = defineStore('config', () => {
  // ================ State ================
  const settings = ref<LauncherSettings>({ ...DEFAULT_SETTINGS })

  // ================ Getters ================
  /** 服务器完整 URL（由 IP + 固定端口拼接） */
  const serverUrl = computed(() => `http://${settings.value.serverIp}:${SERVER_PORT}`)

  /** 服务器 IP */
  const serverIp = computed(() => settings.value.serverIp)

  /** 客户端路径是否已配置 */
  const isClientPathSet = computed(() => settings.value.clientPath.length > 0)

  /** 当前本地版本号 */
  const localVersion = computed(() => settings.value.localVersion)

  // ================ Actions ================

  /**
   * 从本地加载配置
   * Electron 环境通过 IPC 读取用户数据目录的 JSON 文件
   * 浏览器环境降级使用 localStorage
   */
  async function loadSettings() {
    try {
      if (isElectron) {
        // Electron 环境：通过 IPC 读取主进程的配置文件
        const config = await window.electronAPI.readConfig()
        settings.value = {
          ...DEFAULT_SETTINGS,
          ...config,
          settings: { ...DEFAULT_SETTINGS.settings, ...(config.settings || {}) },
          update: {
            github: {
              ...DEFAULT_UPDATE_GITHUB,
              ...((config.update && config.update.github) || {}),
            },
          },
        }
      } else {
        // 浏览器降级：localStorage
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          settings.value = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            settings: { ...DEFAULT_SETTINGS.settings, ...(parsed.settings || {}) },
            update: {
              github: {
                ...DEFAULT_UPDATE_GITHUB,
                ...((parsed.update && parsed.update.github) || {}),
              },
            },
          }
        }
      }
    } catch (e) {
      console.error('[ConfigStore] Failed to load settings:', e)
    }
  }

  /**
   * 保存配置到本地
   * Electron 环境通过 IPC 写入用户数据目录的 JSON 文件
   */
  async function saveSettings() {
    try {
      if (isElectron) {
        // toRaw 去除 Vue reactive proxy，IPC 结构化克隆才能序列化
        const raw = JSON.parse(JSON.stringify(settings.value))
        await window.electronAPI.writeConfig(raw)
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
      }
    } catch (e) {
      console.error('[ConfigStore] Failed to save settings:', e)
    }
  }

  /** 更新服务器 IP */
  async function setServerIp(ip: string) {
    settings.value.serverIp = ip
    await saveSettings()
  }

  /** 更新客户端路径 */
  async function setClientPath(path: string) {
    settings.value.clientPath = path
    await saveSettings()
  }

  /** 更新本地补丁版本号 */
  async function setLocalVersion(version: string) {
    settings.value.localVersion = version
    await saveSettings()
  }

  /** 更新偏好设置 */
  async function updateSettings(partial: Partial<LauncherSettings['settings']>) {
    settings.value.settings = { ...settings.value.settings, ...partial }
    await saveSettings()
  }

  /** 更新最后检查时间 */
  async function updateCheckTime() {
    settings.value.lastCheckTime = new Date().toISOString()
    await saveSettings()
  }

  return {
    // state
    settings,
    // getters
    serverUrl,
    serverIp,
    isClientPathSet,
    localVersion,
    // actions
    loadSettings,
    saveSettings,
    setServerIp,
    setClientPath,
    setLocalVersion,
    updateSettings,
    updateCheckTime,
  }
})
