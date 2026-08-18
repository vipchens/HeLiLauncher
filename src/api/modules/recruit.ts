/**
 * 招募 API 模块
 */

import { get } from '../client'
import type { RecruitInfo, ApiResponse } from '@/types'

/** 获取招募活动信息 */
export function getRecruitInfo(): Promise<ApiResponse<RecruitInfo>> {
  return get<RecruitInfo>('/api/recruit/info')
}
