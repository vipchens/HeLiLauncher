/**
 * 服务器状态 API 模块
 *
 * 对接 AccountServer 已有接口：
 * - GET /api/server-status        游戏服务器在线状态（TCP 端口检测）
 * - GET /api/online-players        在线玩家简要列表
 * - GET /api/online-players-detail 在线玩家详情（含IP/坐标/延迟）
 * - GET /api/class-distribution    全服职业分布
 */

import { get } from '../client'
import type { OnlinePlayer, ClassDistribution, ApiResponse } from '@/types'

/** 游戏服务器状态 */
export interface GameServerStatus {
  online: boolean
  worldServer: boolean
  authServer: boolean
  checkedAt: string
}

/**
 * 获取游戏服务器在线状态（TCP 端口检测）
 * 检测世界服务器（8085）和认证服务器（3724）是否在线
 */
export function getServerStatus(): Promise<ApiResponse<GameServerStatus>> {
  return get<GameServerStatus>('/api/server-status')
}

/** 获取在线玩家详情列表（含IP/坐标/延迟） */
export function getOnlinePlayers(): Promise<ApiResponse<{ count: number; players: OnlinePlayer[] }>> {
  return get<{ count: number; players: OnlinePlayer[] }>('/api/online-players-detail')
}

/** 获取在线玩家简要列表（仅name/level/class/race/map） */
export function getOnlinePlayersSimple(): Promise<ApiResponse<{ count: number; players: OnlinePlayer[] }>> {
  return get<{ count: number; players: OnlinePlayer[] }>('/api/online-players')
}

/** 获取全服职业分布 */
export function getClassDistribution(): Promise<ApiResponse<ClassDistribution>> {
  return get<ClassDistribution>('/api/class-distribution')
}
