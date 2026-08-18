/**
 * 全局类型定义
 * 定义登录器各模块的数据结构，确保类型安全
 */

// ================ 服务器配置 ================

/** 登录器初始化配置（启动时第一个请求获取） */
export interface LauncherConfig {
  serverName: string
  serverVersion: string
  realmlist: string
  launcherVersion: string
  patchVersion: string
  minClientVersion: string
  maintenance: boolean
  maintenanceMessage: string
  features: {
    registration: boolean
    sponsorship: boolean
    recruit: boolean
  }
  cdnUrl: string | null
}

// ================ 公告 ================

/** 公告类型 */
export type AnnouncementType = 'info' | 'event' | 'maintenance' | 'update'

/** 公告条目 */
export interface Announcement {
  id: number
  title: string
  content: string
  type: AnnouncementType
  pinned: boolean
  imageUrl: string | null
  createdAt: string
  expireAt: string | null
}

// ================ 文章 ================

/** 文章条目（来自 AccountServer Markdown 文件） */
export interface Article {
  id: string                 // "分类/文件名.md"
  category: string           // 分类名（目录名）
  filename: string           // 文件名
  title: string              // 标题（来自 frontmatter）
  date: string               // 发布日期
  pinned: boolean            // 是否置顶
  order: number              // 排序权重
  content?: string           // Markdown 正文（列表接口不含，详情接口返回）
  updatedAt: string          // 文件修改时间
}

// ================ 补丁更新 ================

/** 补丁文件操作类型 */
export type PatchAction = 'update' | 'delete'

/** 补丁清单中的单个文件条目 */
export interface PatchFile {
  id: string
  path: string
  hash: string
  size: number
  action: PatchAction
  version: string
}

/** 完整的补丁清单 */
export interface PatchManifest {
  version: string
  releaseDate: string
  totalFiles: number
  totalSize: number
  minimumClientVersion: string
  baseUrl: string
  baseVersion: string
  files: PatchFile[]
}

/** 本地与远程文件差异对比结果 */
export interface PatchDiff {
  toDownload: PatchFile[]
  toDelete: PatchFile[]
  unchanged: PatchFile[]
  totalDownloadSize: number
}

/** 更新进度信息（通过事件推送） */
export interface DownloadProgress {
  fileId: string
  fileName: string
  fileProgress: number
  fileSpeed: number
  totalProgress: number
  totalDownloaded: number
  totalSize: number
  completedCount: number
  totalCount: number
}

/** 补丁应用进度信息 */
export interface ApplyProgress {
  phase: 'backup' | 'apply' | 'delete' | 'cleanup'
  current: number
  total: number
  fileName: string
}

/** 日志行 */
export interface PatchLogLine {
  time: string
  level: 'info' | 'warn' | 'error'
  text: string
}

// ================ 账号 ================

/** 登录响应数据 */
export interface LoginResponse {
  token: string
  accountId: number
  username: string
  expiresAt: number
}

/** 用户名检查响应 */
export interface CheckUsernameResponse {
  exists: boolean
  valid: boolean
  message: string
}

/** 角色硬核模式状态 */
export type HardcoreStatus = 'none' | 'enabled' | 'dead'

/** 角色信息 */
export interface Character {
  guid: number
  name: string
  level: number
  class: string
  race: string
  gender: string
  map: string
  online: boolean
  /** 当前硬核模式状态：未开通 / 已开通未阵亡 / 已阵亡 */
  hardcoreStatus: HardcoreStatus
  /** 是否可开通硬核模式（服务端计算，前端仅消费） */
  canEnableHardcore: boolean
}

/** 账号状态信息 */
export interface AccountStatus {
  id: number
  username: string
  expansion: number
  expansionName: string
  joindate: string
  online: boolean
  lastLogin: string | null
  gmlevel: number
  characters: Character[]
}

// ================ 在线玩家 ================

/** 在线玩家详情（/api/online-players-detail 返回） */
export interface OnlinePlayer {
  name: string
  level: number
  class: string
  race: string
  map: string
  x: number
  y: number
  z: number
  latency: number
  accountId: number
}

/** 职业分布条目 */
export interface ClassDistributionItem {
  classId: number
  className: string
  count: number
  percentage: number
}

/** 职业分布统计 */
export interface ClassDistribution {
  total: number
  alliance: { count: number; percentage: number }
  horde: { count: number; percentage: number }
  classes: ClassDistributionItem[]
}

// ================ 赞助 ================

/** 赞助档位 */
export interface SponsorshipPlan {
  id: string
  name: string
  amount: number
  rewards: string[]
  qrcodeUrl: string
  popular?: boolean
}

/** 随缘打赏配置 */
export interface TipConfig {
  minAmount: number
  presetAmounts: number[]
  qrcodeUrl: string
}

/** 赞助配置 */
export interface SponsorshipConfig {
  plans: SponsorshipPlan[]
  tip: TipConfig
  paymentMethods: string[]
  contact: string
}

// ================ 招募 ================

/** 招募奖励条件 */
export interface RecruitReward {
  target: 'recruiter' | 'recruitee'
  condition: string
  reward: string
}

/** 招募活动信息 */
export interface RecruitInfo {
  title: string
  description: string
  rewards: RecruitReward[]
  startDate: string
  endDate: string
  isActive: boolean
}

// ================ 本地配置 ================

/** 登录器本地设置（存储在客户端本地） */
export interface LauncherSettings {
  serverIp: string
  clientPath: string
  localVersion: string
  settings: {
    autoCheck: boolean
    autoStartGame: boolean
    minimizeToTray: boolean
    downloadConcurrency: number
    maxRetry: number
    backupEnabled: boolean
  }
  /** asar 增量热更新的 GitHub 仓库配置（首次启动由 DEFAULT_CONFIG 兜底注入，即使本地老 config.json 缺失也不影响） */
  update?: {
    github?: {
      owner: string
      repo: string
      rawBranch: string
    }
  }
  lastCheckTime: string | null
}

// ================ API 统一响应 ================

/** 统一API响应格式 */
export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
  timestamp?: string
}
