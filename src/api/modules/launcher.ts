/**
 * 登录器配置 API
 * 启动时获取服务器基础配置信息
 */

import { get } from '../client'
import type { LauncherConfig, ApiResponse } from '@/types'

/** 获取登录器初始化配置 */
export function getConfig(): Promise<ApiResponse<LauncherConfig>> {
  return get<LauncherConfig>('/api/launcher/config')
}
