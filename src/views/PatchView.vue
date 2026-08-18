<script setup lang="ts">
/**
 * PatchView.vue - 客户端补丁更新页面
 *
 * 状态机：idle → checking → hasUpdate → downloading → applying → done/error
 * 用户操作：检查更新、开始更新、取消更新、手动回滚
 */

import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePatchStore } from '@/stores/patch'
import { useConfigStore } from '@/stores/config'
import * as patchApi from '@/api/modules/patch'

const patchStore = usePatchStore()
const configStore = useConfigStore()

const changelog = ref<string[]>([])
const loading = ref(false)
const showLogPanel = ref(false)
const logPanelRef = ref<HTMLElement | null>(null)

// ================ 计算属性 ================

const statusText = computed(() => {
  const map: Record<string, string> = {
    idle: '未检查',
    checking: '检查中...',
    upToDate: '已是最新版本',
    hasUpdate: '有可用更新',
    downloading: '正在下载...',
    applying: '正在应用补丁...',
    done: '更新完成',
    error: '更新失败',
  }
  return map[patchStore.state] || '未知'
})

const statusColor = computed(() => {
  const map: Record<string, string> = {
    upToDate: '#27ae60',
    hasUpdate: '#e67e22',
    downloading: '#3498db',
    applying: '#3498db',
    done: '#27ae60',
    error: '#e74c3c',
  }
  return map[patchStore.state] || '#8a7458'
})

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 格式化下载速度 */
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

// ================ 事件处理 ================

async function handleCheckUpdate() {
  loading.value = true
  try {
    await patchStore.checkUpdate()
    if (patchStore.state === 'hasUpdate') {
      ElMessage.warning(`发现新版本 v${patchStore.remoteVersion}`)
      // 拉取更新日志
      const logRes = await patchApi.getChangelog()
      if (logRes.success && logRes.data) {
        changelog.value = logRes.data.changes
      }
    } else if (patchStore.state === 'upToDate') {
      ElMessage.success('已是最新版本')
    }
  } catch {
    ElMessage.error(patchStore.errorMessage || '检查更新失败')
  } finally {
    loading.value = false
  }
}

async function handleStartUpdate() {
  // 二次确认
  try {
    await ElMessageBox.confirm(
      '更新过程中请勿打开游戏，确认开始更新？',
      '补丁更新确认',
      { confirmButtonText: '开始更新', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }

  try {
    await patchStore.startDownload()
    if (patchStore.state === 'done') {
      ElMessage.success('补丁更新完成')
      // 如果开启了自动启动游戏
      if (configStore.settings.settings.autoStartGame) {
        try {
          await ElMessageBox.confirm('更新完成，是否立即启动游戏？', '启动游戏', {
            confirmButtonText: '启动游戏',
            cancelButtonText: '稍后',
            type: 'success',
          })
          await window.electronAPI.prepareAndLaunchGame(
            configStore.settings.clientPath,
            configStore.serverIp,
          )
        } catch {
          // 用户选择稍后启动
        }
      }
    }
  } catch {
    ElMessage.error(patchStore.errorMessage || '更新失败')

    // 如果有备份路径，提示用户是否回滚
    if (patchStore.backupPath) {
      try {
        await ElMessageBox.confirm(
          '补丁应用失败，是否回滚到更新前的版本？',
          '回滚确认',
          { confirmButtonText: '回滚', cancelButtonText: '不回滚', type: 'error' },
        )
        await patchStore.rollback()
        ElMessage.success('已回滚到更新前的版本')
      } catch {
        // 用户选择不回滚
      }
    }
  }
}

async function handleCancel() {
  await patchStore.cancelUpdate()
  ElMessage.info('更新已取消')
}

async function handleRollback() {
  try {
    await ElMessageBox.confirm(
      '回滚将恢复更新前的文件，确认操作？',
      '回滚确认',
      { confirmButtonText: '确认回滚', cancelButtonText: '取消', type: 'warning' },
    )
    await patchStore.rollback()
    ElMessage.success('回滚成功')
  } catch {
    // 用户取消
  }
}

/** 切换日志面板 */
function toggleLogPanel() {
  showLogPanel.value = !showLogPanel.value
  if (showLogPanel.value) {
    nextTick(() => {
      if (logPanelRef.value) {
        logPanelRef.value.scrollTop = logPanelRef.value.scrollHeight
      }
    })
  }
}

// ================ 生命周期 ================

onMounted(() => {
  if (configStore.settings.settings.autoCheck) {
    handleCheckUpdate()
  }
})
</script>

<template>
  <div class="patch-view">
    <!-- 版本信息卡 -->
    <div class="info-card version-card">
      <div class="info-card-title">
        <el-icon><Download /></el-icon>
        <span>客户端补丁</span>
      </div>
      <div class="version-row">
        <div class="version-item">
          <span class="version-label">当前版本</span>
          <span class="version-value">v{{ configStore.localVersion }}</span>
        </div>
        <el-icon class="version-arrow"><ArrowRight /></el-icon>
        <div class="version-item">
          <span class="version-label">最新版本</span>
          <span class="version-value">{{ patchStore.remoteVersion ? 'v' + patchStore.remoteVersion : '--' }}</span>
        </div>
        <span class="status-badge" :style="{ background: statusColor + '22', color: statusColor }">
          {{ statusText }}
        </span>
      </div>
    </div>

    <!-- 更新日志 -->
    <div v-if="changelog.length" class="info-card">
      <div class="info-card-title">
        <el-icon><Document /></el-icon>
        <span>更新内容</span>
      </div>
      <ul class="changelog-list">
        <li v-for="(change, i) in changelog" :key="i">
          <span class="change-dot"></span>
          <span class="change-text">{{ change }}</span>
        </li>
      </ul>
    </div>

    <!-- 差异文件列表 -->
    <div v-if="patchStore.diff" class="info-card">
      <div class="info-card-title">
        <el-icon><Files /></el-icon>
        <span>更新文件</span>
      </div>
      <!-- 统计 -->
      <div class="diff-grid">
        <div class="diff-item download-stat">
          <span class="diff-label">需下载</span>
          <span class="diff-value">{{ patchStore.diff.toDownload.length }} 个文件</span>
          <span class="diff-sub">{{ formatSize(patchStore.diff.totalDownloadSize) }}</span>
        </div>
        <div class="diff-item delete-stat">
          <span class="diff-label">需删除</span>
          <span class="diff-value">{{ patchStore.diff.toDelete.length }} 个文件</span>
        </div>
        <div class="diff-item unchanged-stat">
          <span class="diff-label">无需更新</span>
          <span class="diff-value">{{ patchStore.diff.unchanged.length }} 个文件</span>
        </div>
      </div>

      <!-- 待下载文件列表 -->
      <div v-if="patchStore.diff.toDownload.length" class="file-list-section">
        <div class="file-list-header" @click="">
          <span class="file-list-title">待下载文件</span>
        </div>
        <div class="file-list">
          <div v-for="file in patchStore.diff.toDownload" :key="file.id" class="file-item download">
            <el-icon><Download /></el-icon>
            <span class="file-name">{{ file.path }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
          </div>
        </div>
      </div>

      <!-- 待删除文件列表 -->
      <div v-if="patchStore.diff.toDelete.length" class="file-list-section">
        <div class="file-list-header">
          <span class="file-list-title">待删除文件</span>
        </div>
        <div class="file-list">
          <div v-for="file in patchStore.diff.toDelete" :key="file.id" class="file-item delete">
            <el-icon><Delete /></el-icon>
            <span class="file-name">{{ file.path }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 下载进度 -->
    <div v-if="patchStore.state === 'downloading' && patchStore.progress" class="info-card">
      <div class="info-card-title">
        <el-icon class="spin-icon"><Loading /></el-icon>
        <span>下载进度</span>
      </div>
      <!-- 总进度 -->
      <div class="progress-bar-wrapper">
        <div class="progress-bar-track">
          <div class="progress-bar-fill download-fill" :style="{ width: Math.round(patchStore.progress.totalProgress) + '%' }"></div>
        </div>
        <span class="progress-percent">{{ Math.round(patchStore.progress.totalProgress) }}%</span>
      </div>
      <div class="progress-detail">
        <span class="progress-file">{{ patchStore.progress.fileName }}</span>
        <span class="progress-stats">
          {{ formatSize(patchStore.progress.totalDownloaded) }} / {{ formatSize(patchStore.progress.totalSize) }}
          · {{ formatSpeed(patchStore.progress.fileSpeed) }}
          · {{ patchStore.progress.completedCount }}/{{ patchStore.progress.totalCount }}
        </span>
      </div>
    </div>

    <!-- 应用进度 -->
    <div v-if="patchStore.state === 'applying' && patchStore.applyProgress" class="info-card">
      <div class="info-card-title">
        <el-icon class="spin-icon"><Loading /></el-icon>
        <span>{{ patchStore.applyProgress.phase === 'backup' ? '备份文件' : patchStore.applyProgress.phase === 'apply' ? '覆盖文件' : '删除文件' }}</span>
      </div>
      <div class="progress-bar-wrapper">
        <div class="progress-bar-track">
          <div class="progress-bar-fill apply-fill" :style="{ width: Math.round((patchStore.applyProgress.current / patchStore.applyProgress.total) * 100) + '%' }"></div>
        </div>
        <span class="progress-percent">{{ Math.round((patchStore.applyProgress.current / patchStore.applyProgress.total) * 100) }}%</span>
      </div>
      <div class="progress-detail">
        <span class="progress-file">{{ patchStore.applyProgress.fileName }}</span>
        <span class="progress-stats">{{ patchStore.applyProgress.current }} / {{ patchStore.applyProgress.total }}</span>
      </div>
    </div>

    <!-- 日志面板 -->
    <div v-if="patchStore.logLines.length" class="info-card">
      <div class="info-card-title clickable" @click="toggleLogPanel">
        <el-icon><Tickets /></el-icon>
        <span>更新日志</span>
        <el-icon class="toggle-icon" :class="{ expanded: showLogPanel }"><ArrowDown /></el-icon>
      </div>
      <div v-show="showLogPanel" ref="logPanelRef" class="log-panel">
        <div v-for="(line, i) in patchStore.logLines" :key="i" class="log-line" :class="line.level">
          <span class="log-time">{{ line.time }}</span>
          <span class="log-text">{{ line.text }}</span>
        </div>
      </div>
    </div>

    <!-- 错误信息 -->
    <div v-if="patchStore.state === 'error' && patchStore.errorMessage" class="info-card error-card">
      <div class="info-card-title">
        <el-icon color="#e74c3c"><WarningFilled /></el-icon>
        <span style="color: #e74c3c">更新失败</span>
      </div>
      <p class="error-message">{{ patchStore.errorMessage }}</p>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <!-- 检查更新 -->
      <button
        v-if="patchStore.state === 'idle' || patchStore.state === 'upToDate' || patchStore.state === 'done' || patchStore.state === 'error'"
        class="action-btn primary"
        :disabled="loading"
        @click="handleCheckUpdate"
      >
        <el-icon v-if="loading" class="spin-icon"><Loading /></el-icon>
        <el-icon v-else><Refresh /></el-icon>
        <span>{{ loading ? '检查中...' : '检查更新' }}</span>
      </button>

      <!-- 开始更新 -->
      <button
        v-if="patchStore.state === 'hasUpdate'"
        class="action-btn success"
        @click="handleStartUpdate"
      >
        <el-icon><Download /></el-icon>
        <span>开始更新</span>
      </button>

      <!-- 取消更新 -->
      <button
        v-if="patchStore.isUpdating"
        class="action-btn cancel"
        @click="handleCancel"
      >
        <el-icon><Close /></el-icon>
        <span>取消更新</span>
      </button>

      <!-- 手动回滚 -->
      <button
        v-if="patchStore.state === 'error' && patchStore.backupPath"
        class="action-btn warning"
        @click="handleRollback"
      >
        <el-icon><RefreshLeft /></el-icon>
        <span>回滚到旧版本</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.patch-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-card {
  background: var(--color-bg-medium);
  border: 1px solid var(--color-border);
  border-radius: var(--content-radius);
  padding: 24px;
}

.info-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);

  .el-icon {
    color: var(--color-primary);
    font-size: 18px;
  }

  &.clickable {
    cursor: pointer;
    user-select: none;
  }

  .toggle-icon {
    margin-left: auto;
    transition: transform 0.3s;
    color: var(--color-text-tertiary);

    &.expanded {
      transform: rotate(180deg);
    }
  }
}

/* 版本信息 */
.version-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

.version-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.version-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.version-arrow {
  font-size: 20px;
  color: var(--color-text-tertiary);
}

.status-badge {
  margin-left: auto;
  padding: 4px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
}

/* 更新日志 */
.changelog-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;

  li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: var(--color-text-secondary);
    font-size: 14px;
    line-height: 1.6;
  }
}

.change-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  flex-shrink: 0;
  margin-top: 7px;
}

.change-text {
  white-space: pre-line;
}

/* 差异统计 */
.diff-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.diff-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;

  &.download-stat {
    border-left: 3px solid #3498db;
  }

  &.delete-stat {
    border-left: 3px solid #e74c3c;
  }

  &.unchanged-stat {
    border-left: 3px solid #27ae60;
  }
}

.diff-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.diff-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.diff-sub {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* 文件列表 */
.file-list-section {
  margin-top: 12px;
}

.file-list-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.file-list-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.file-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;

  &.download {
    background: rgba(52, 152, 219, 0.08);
    color: #3498db;
  }

  &.delete {
    background: rgba(231, 76, 60, 0.08);
    color: #e74c3c;
  }

  .file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size {
    color: var(--color-text-tertiary);
    font-size: 12px;
    flex-shrink: 0;
  }
}

/* 进度条 */
.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.progress-bar-track {
  flex: 1;
  height: 20px;
  background: var(--color-bg-light);
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.progress-bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.3s ease;

  &.download-fill {
    background: linear-gradient(90deg, #3498db, #2ecc71);
  }

  &.apply-fill {
    background: linear-gradient(90deg, #e67e22, #f39c12);
  }
}

.progress-percent {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
  min-width: 40px;
  text-align: right;
}

.progress-detail {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.progress-stats {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

/* 日志面板 */
.log-panel {
  max-height: 240px;
  overflow-y: auto;
  background: var(--color-bg-dark, #1a1a1a);
  border-radius: 8px;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.log-line {
  display: flex;
  gap: 8px;
  padding: 2px 0;

  &.info .log-text {
    color: var(--color-text-secondary);
  }

  &.warn .log-text {
    color: #e67e22;
  }

  &.error .log-text {
    color: #e74c3c;
  }
}

.log-time {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.log-text {
  word-break: break-all;
}

/* 错误卡片 */
.error-card {
  border-color: rgba(231, 76, 60, 0.3);
}

.error-message {
  color: #e74c3c;
  font-size: 14px;
  margin: 0;
}

/* 按钮 */
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 32px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;

  &.primary {
    background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
    color: #2a1f10;
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.5);
    }
  }

  &.success {
    background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
    color: #fff;
    box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(39, 174, 96, 0.5);
    }
  }

  &.cancel {
    background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
    color: #fff;

    &:hover {
      transform: translateY(-2px);
    }
  }

  &.warning {
    background: linear-gradient(135deg, #e67e22 0%, #d35400 100%);
    color: #fff;

    &:hover {
      transform: translateY(-2px);
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .version-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .diff-grid {
    grid-template-columns: 1fr;
  }
}
</style>
