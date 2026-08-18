/**
 * 公告 API 模块
 */

import { get } from '../client'
import type { Announcement, ApiResponse } from '@/types'

/** 获取公告列表 */
export function getAnnouncements(): Promise<ApiResponse<Announcement[]>> {
  return get<Announcement[]>('/api/announcements')
}
