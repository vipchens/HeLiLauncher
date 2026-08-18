/**
 * 账号 API 模块
 * 对应 AccountServer 的注册/登录/账号状态接口
 *
 * 后端路由前缀: /api
 * 认证方式: Bearer Token（登录返回的 token）
 */

import { get, post } from '../client'
import type { AccountStatus, LoginResponse, CheckUsernameResponse } from '@/types'

/** 账号注册 */
export function register(username: string, password: string, email?: string) {
  return post<never>('/api/register', { username, password, email })
}

/** 账号登录 */
export function login(username: string, password: string) {
  return post<LoginResponse>('/api/login', { username, password })
}

/** 登出（需要 Bearer Token） */
export function logout() {
  return post<never>('/api/logout')
}

/** 获取账号状态（含角色列表，需要 Bearer Token） */
export function getAccountStatus() {
  return get<AccountStatus>('/api/account/status')
}

/** 修改密码（需要 Bearer Token） */
export function changePassword(oldPassword: string, newPassword: string) {
  return post<never>('/api/account/password', { oldPassword, newPassword })
}

/**
 * 检查用户名是否可用
 * 注意：此接口返回 { exists, valid, message }，不是标准 ApiResponse 格式
 */
export async function checkUsername(username: string): Promise<CheckUsernameResponse> {
  return get<CheckUsernameResponse>(`/api/check/${encodeURIComponent(username)}`) as unknown as Promise<CheckUsernameResponse>
}

/** 为指定角色开通硬核模式（需要 Bearer Token） */
export function enableHardcore(guid: number) {
  return post<never>(`/api/account/character/${guid}/enable-hardcore`)
}
