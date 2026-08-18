/**
 * 认证 Store
 *
 * 管理用户登录态：Token、用户名、账号信息
 * 采用集中式状态管理，所有页面共享登录状态
 *
 * Token 存储策略：
 * - Electron 环境：随 config.json 持久化到用户数据目录
 * - 浏览器环境：localStorage
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AccountStatus, ApiResponse, LoginResponse } from '@/types'
import * as accountApi from '@/api/modules/account'

const TOKEN_KEY = 'wow_launcher_token'
const USERNAME_KEY = 'wow_launcher_username'

export const useAuthStore = defineStore('auth', () => {
  // ================ State ================
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const username = ref<string | null>(localStorage.getItem(USERNAME_KEY))
  const accountInfo = ref<AccountStatus | null>(null)
  const loading = ref(false)

  // ================ Getters ================
  const isLoggedIn = computed(() => !!token.value)

  // ================ Actions ================

  /**
   * 登录
   * 调用后端 /api/login，存储返回的 token
   */
  async function login(user: string, pwd: string) {
    loading.value = true
    try {
      const res: ApiResponse<LoginResponse> = await accountApi.login(user, pwd)
      if (res.success && res.data) {
        token.value = res.data.token
        username.value = res.data.username
        localStorage.setItem(TOKEN_KEY, res.data.token)
        localStorage.setItem(USERNAME_KEY, res.data.username)
      }
      return res
    } finally {
      loading.value = false
    }
  }

  /**
   * 注册
   * 调用后端 /api/register
   */
  async function register(user: string, pwd: string, email?: string) {
    return accountApi.register(user, pwd, email)
  }

  /**
   * 登出
   * 调用后端 /api/logout（带 Bearer Token），清除本地登录态
   */
  async function logout() {
    try {
      await accountApi.logout()
    } catch {
      // 忽略网络错误，本地清除即可
    }
    token.value = null
    username.value = null
    accountInfo.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
  }

  /**
   * 加载账号状态信息
   * 调用后端 /api/account/status（带 Bearer Token）
   * Token 失效时自动登出
   */
  async function loadAccountInfo() {
    if (!isLoggedIn.value) return
    try {
      const res = await accountApi.getAccountStatus()
      if (res.success && res.data) {
        accountInfo.value = res.data
      } else {
        // Token 失效，清除登录态
        await logout()
      }
      return res
    } catch (e) {
      // 401 等错误，清除登录态
      await logout()
      throw e
    }
  }

  return {
    // state
    token,
    username,
    accountInfo,
    loading,
    // getters
    isLoggedIn,
    // actions
    login,
    register,
    logout,
    loadAccountInfo,
  }
})
