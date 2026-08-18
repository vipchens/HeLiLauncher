/**
 * 补丁更新 API 模块
 * 获取远程补丁版本、清单、更新日志
 * 文件下载通过 Electron IPC 执行（支持断点续传 + CDN fallback）
 */

import { get } from '../client'
import type { PatchManifest, ApiResponse } from '@/types'

/** 获取最新补丁版本号（轻量请求，用于快速检查） */
export function getPatchVersion() {
  return get<{ version: string; releaseDate: string }>('/api/client-patches/version')
}

/** 获取完整补丁清单 */
export function getManifest(): Promise<ApiResponse<PatchManifest>> {
  return get<PatchManifest>('/api/client-patches/manifest')
}

/** 获取更新日志 */
export function getChangelog() {
  return get<{ version: string; changes: string[] }>('/api/client-patches/changelog')
}
