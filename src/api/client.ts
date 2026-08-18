/**
 * API 客户端模块
 *
 * 设计模式：采用 Repository 模式，将所有 HTTP 请求封装在统一入口
 * - HttpClient: 底层 axios 实例，负责请求/响应拦截、错误处理
 * - 各 api 子模块: 按业务领域划分（account, patch, announcement 等）
 * - 调用方只需 import 对应模块即可，无需关心 URL 拼接和错误处理
 *
 * 扩展性：新增 API 只需在对应模块中添加方法，或新建模块文件
 */

import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types'
import { useConfigStore } from '@/stores/config'

// ================ HTTP 客户端实例 ================

/** 创建带拦截器的 axios 实例 */
function createHttpClient(): AxiosInstance {
  const client = axios.create({
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  })

  // 请求拦截：自动注入服务器地址和认证 Token
  client.interceptors.request.use(
    (config) => {
      const configStore = useConfigStore()
      config.baseURL = configStore.serverUrl

      // 注入认证 Token（如果已登录）
      const token = localStorage.getItem('wow_launcher_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    (error) => Promise.reject(error),
  )

  // 响应拦截：统一错误处理
  // 返回 response.data（即后端响应体），剥离 axios 包装层
  client.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => response.data as any,
    (error) => {
      console.error('[API] Request failed:', error)
      if (error.response?.data?.message) {
        return Promise.reject(new Error(error.response.data.message))
      }
      return Promise.reject(new Error('网络请求失败，请检查网络连接'))
    },
  )

  return client
}

// 延迟初始化，确保 Pinia 已就绪
let _client: AxiosInstance | null = null
function getClient(): AxiosInstance {
  if (!_client) {
    _client = createHttpClient()
  }
  return _client
}

/** 通用 GET 请求 */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
  return getClient().get(url, { params })
}

/** 通用 POST 请求 */
export async function post<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
  return getClient().post(url, data)
}
