/**
 * API 业务模块统一导出
 *
 * 按领域驱动设计(DDD)划分模块，每个模块对应一个业务领域：
 * - account: 账号注册/登录/状态
 * - patch: 补丁检查/清单/下载
 * - announcement: 游戏公告
 * - sponsorship: 游戏赞助
 * - recruit: 招募信息
 * - server: 服务器状态/在线玩家
 */

export * as accountApi from './modules/account'
export * as patchApi from './modules/patch'
export * as announcementApi from './modules/announcement'
export * as sponsorshipApi from './modules/sponsorship'
export * as recruitApi from './modules/recruit'
export * as serverApi from './modules/server'
export * as launcherApi from './modules/launcher'
