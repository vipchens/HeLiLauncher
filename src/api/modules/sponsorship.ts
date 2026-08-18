/**
 * 赞助 API 模块
 */

import { get } from '../client'
import type { SponsorshipConfig, ApiResponse } from '@/types'

/** 获取赞助档位列表 */
export function getSponsorshipPlans(): Promise<ApiResponse<SponsorshipConfig>> {
  return get<SponsorshipConfig>('/api/sponsorship/plans')
}
