<script setup lang="ts">
/**
 * 登录器更新弹窗
 *
 * 状态流转：
 *   idle → checking → available → downloading → downloaded → installing
 *                     ↓ not-available
 *                     ↓ error
 *
 * 触发方式：
 *   1. App.vue 启动时自动调用 check()
 *   2. SettingsView 手动调用 check()
 */
import { ref, onBeforeUnmount } from 'vue'
import BaseDialog from './BaseDialog.vue'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

const visible = ref(false)
const state = ref<UpdateState>('idle')
const errorMsg = ref('')
const newVersion = ref('')
const releaseNotes = ref('')
const progress = ref(0)
const transferred = ref(0)
const total = ref(0)
const speed = ref(0)
const updateType = ref<'asar' | 'nsis'>('nsis')
const isAsarUpdate = ref(false)

// 是否是手动触发（手动触发时"已是最新"也弹窗，自动触发则静默）
const isManual = ref(false)

let unsub: (() => void) | null = null

function initListener() {
  if (unsub) return
  if (typeof window === 'undefined' || !window.electronAPI) return

  unsub = window.electronAPI.onUpdateEvent((event, data) => {
    switch (event) {
      case 'checking':
        state.value = 'checking'
        break
      case 'available':
        state.value = 'available'
        newVersion.value = data.version || ''
        releaseNotes.value = typeof data.releaseNotes === 'string'
          ? data.releaseNotes
          : ''
        updateType.value = data.updateType || 'nsis'
        isAsarUpdate.value = !!data.isAsarUpdate
        visible.value = true
        break
      case 'not-available':
        if (isManual.value) {
          state.value = 'idle'
          visible.value = true
        } else {
          visible.value = false
        }
        break
      case 'progress':
        state.value = 'downloading'
        progress.value = data.percent || 0
        transferred.value = data.transferred || 0
        total.value = data.total || 0
        speed.value = data.bytesPerSecond || 0
        break
      case 'downloaded':
        state.value = 'downloaded'
        progress.value = 100
        break
      case 'error':
        state.value = 'error'
        errorMsg.value = data.message || '未知错误'
        if (isManual.value) {
          visible.value = true
        }
        break
    }
  })
}

/** 检查更新 */
async function check(manual = false) {
  isManual.value = manual
  if (typeof window === 'undefined' || !window.electronAPI) {
    if (manual) {
      errorMsg.value = '当前环境不支持自动更新（非 Electron 环境）'
      state.value = 'error'
      visible.value = true
    }
    return
  }

  initListener()
  state.value = 'checking'
  if (manual) visible.value = true

  const res = await window.electronAPI.checkForUpdates()
  if (!res.success) {
    state.value = 'error'
    errorMsg.value = res.error || '检查更新失败'
    if (!manual) visible.value = false
  }
}

/** 下载更新 */
async function download() {
  state.value = 'downloading'
  progress.value = 0
  const res = await window.electronAPI.downloadUpdate()
  if (!res.success) {
    state.value = 'error'
    errorMsg.value = res.error || '下载失败'
  }
}

/** 退出并安装 */
async function install() {
  state.value = 'idle'
  visible.value = false
  await window.electronAPI.quitAndInstall()
}

/** 关闭弹窗 */
function handleClose() {
  visible.value = false
  if (state.value === 'checking' || state.value === 'error') {
    state.value = 'idle'
  }
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

// 格式化下载速度
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return bytesPerSec + ' B/s'
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s'
  return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s'
}

onBeforeUnmount(() => {
  if (unsub) unsub()
})

defineExpose({ check })
</script>

<template>
  <BaseDialog
    v-model:visible="visible"
    :title="state === 'downloading' ? '正在下载更新' : state === 'downloaded' ? '下载完成' : '检查更新'"
    width="440px"
    :close-on-overlay="state !== 'downloading'"
    :close-on-esc="state !== 'downloading'"
    :show-close="state !== 'downloading'"
    @close="handleClose"
  >
    <div class="updater-content">
      <!-- 检查中 -->
      <div v-if="state === 'checking'" class="status-box">
        <el-icon class="spin-icon" :size="40"><Loading /></el-icon>
        <p class="status-text">正在检查最新版本...</p>
      </div>

      <!-- 发现新版本 -->
      <div v-else-if="state === 'available'" class="status-box">
        <div class="version-badge">
          <span class="old-version">当前</span>
          <span class="arrow">→</span>
          <span class="new-version">v{{ newVersion }}</span>
        </div>
        <!-- 更新类型标签（B 方案 asar 增量 vs NSIS 全量） -->
        <div class="update-type-chip">
          <template v-if="isAsarUpdate">
            <span class="chip asar-chip">⚡ 增量热更新 (asar)</span>
            <span class="chip-hint">仅 3~20MB，无需管理员权限，秒级重启生效</span>
          </template>
          <template v-else>
            <span class="chip nsis-chip">🗜️ 完整安装包 (NSIS)</span>
            <span class="chip-hint">约 100~150MB 全量下载，需走完安装器流程</span>
          </template>
        </div>
        <div v-if="releaseNotes" class="release-notes">
          <div class="notes-title">更新内容</div>
          <div class="notes-body" v-html="releaseNotes"></div>
        </div>
      </div>

      <!-- 下载中 -->
      <div v-else-if="state === 'downloading'" class="status-box">
        <div class="progress-ring">
          <el-progress
            type="dashboard"
            :percentage="progress"
            :width="100"
            :stroke-width="8"
            color="#d4af37"
          >
            <template #default="{ percentage }">
              <span class="progress-num">{{ percentage }}%</span>
            </template>
          </el-progress>
        </div>
        <div class="download-info">
          <span>{{ formatSize(transferred) }} / {{ formatSize(total) }}</span>
          <span class="speed">{{ formatSpeed(speed) }}</span>
        </div>
      </div>

      <!-- 下载完成 -->
      <div v-else-if="state === 'downloaded'" class="status-box">
        <el-icon :size="48" color="#27ae60"><CircleCheckFilled /></el-icon>
        <p v-if="isAsarUpdate" class="status-text">
          增量包下载完成，点击下方按钮重启登录器即可生效（秒级完成）
        </p>
        <p v-else class="status-text">
          完整安装包下载完成，点击下方按钮重启并安装新版本
        </p>
      </div>

      <!-- 已是最新 -->
      <div v-else-if="state === 'idle' && isManual" class="status-box">
        <el-icon :size="48" color="#27ae60"><CircleCheckFilled /></el-icon>
        <p class="status-text">当前已是最新版本</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="state === 'error'" class="status-box">
        <el-icon :size="48" color="#e74c3c"><CircleCloseFilled /></el-icon>
        <p class="error-text">{{ errorMsg }}</p>
      </div>
    </div>

    <template #footer>
      <!-- 发现新版本 -->
      <div v-if="state === 'available'" class="dialog-footer">
        <button class="action-btn outline" @click="handleClose">稍后提醒</button>
        <button class="action-btn gold" @click="download">
          <el-icon><Download /></el-icon>
          <span>立即下载</span>
        </button>
      </div>

      <!-- 下载完成 -->
      <div v-else-if="state === 'downloaded'" class="dialog-footer">
        <button class="action-btn outline" @click="handleClose">稍后安装</button>
        <button class="action-btn gold" @click="install">
          <el-icon><RefreshRight /></el-icon>
          <span v-if="isAsarUpdate">⚡ 重启应用（热更）</span>
          <span v-else>重启并安装</span>
        </button>
      </div>

      <!-- 错误 / 已是最新 -->
      <div v-else-if="state === 'error' || (state === 'idle' && isManual)" class="dialog-footer">
        <button class="action-btn gold" @click="handleClose">关闭</button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped lang="scss">
.updater-content {
  min-height: 160px;
}

.status-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px 0;
  text-align: center;
}

.status-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.error-text {
  font-size: 14px;
  color: var(--color-danger);
  line-height: 1.6;
  word-break: break-all;
}

/* 版本号展示 */
.version-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 700;

  .old-version {
    color: var(--color-text-tertiary);
    font-size: 14px;
  }

  .arrow {
    color: var(--color-text-muted);
  }

  .new-version {
    color: var(--color-primary);
    text-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
  }
}

/* 更新日志 */
.release-notes {
  width: 100%;
  margin-top: 8px;
  padding: 12px 16px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  text-align: left;

  .notes-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-primary-light);
    margin-bottom: 8px;
  }

  .notes-body {
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

/* 下载进度 */
.progress-ring {
  display: flex;
  justify-content: center;
}

.progress-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
}

.download-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-tertiary);

  .speed {
    color: var(--color-info);
  }
}

/* 旋转动画 */
.spin-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  .el-icon { font-size: 16px; }

  &.gold {
    background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
    color: #2a1f10;
    box-shadow: 0 2px 8px rgba(212, 175, 55, 0.3);

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(212, 175, 55, 0.5);
    }
  }

  &.outline {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);

    &:hover {
      border-color: var(--color-text-tertiary);
      color: var(--color-text-primary);
    }
  }
}

/* ========== B 方案：更新类型标签 ========== */
.update-type-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 0 2px;
}
.update-type-chip .chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.update-type-chip .chip-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  letter-spacing: 0.5px;
}
.update-type-chip .asar-chip {
  background: linear-gradient(135deg, rgba(52,152,219,0.15), rgba(46,204,113,0.18));
  color: #16a085;
  border: 1px solid rgba(46,204,113,0.35);
}
.update-type-chip .nsis-chip {
  background: linear-gradient(135deg, rgba(241,196,15,0.15), rgba(230,126,34,0.15));
  color: var(--color-primary-dark, #b8941f);
  border: 1px solid rgba(212,175,55,0.4);
}
</style>
