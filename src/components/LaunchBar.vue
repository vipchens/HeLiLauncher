<script setup lang="ts">
/**
 * LaunchBar.vue - 底部启动栏
 *
 * 始终可见的核心操作区：
 * - 左侧：服务器状态指示灯、在线人数
 * - 右侧：启动游戏按钮
 *
 * 启动游戏逻辑：
 * 1. 检查客户端路径是否有效
 * 2. 调用 Electron 主进程 child_process.spawn 启动 Wow.exe
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { usePatchStore } from '@/stores/patch'
import * as serverApi from '@/api/modules/server'

const configStore = useConfigStore()
const patchStore = usePatchStore()
const router = useRouter()

// 服务器状态
const serverOnline = ref(false)
const onlineCount = ref(0)
const checking = ref(false)
const launching = ref(false)

// 服务器状态文本
const serverStatusText = computed(() => {
  return serverOnline.value ? '服务器在线' : '服务器离线'
})

/** 获取服务器状态和在线人数（showLoading 控制是否显示加载状态） */
async function fetchServerStatus(showLoading = false) {
  if (showLoading) checking.value = true
  try {
    const [statusResult, playersResult] = await Promise.allSettled([
      serverApi.getServerStatus(),
      serverApi.getOnlinePlayers(),
    ])

    // 服务器在线状态（TCP 端口检测）
    if (statusResult.status === 'fulfilled' && statusResult.value.success && statusResult.value.data) {
      serverOnline.value = statusResult.value.data.online
    } else {
      serverOnline.value = false
    }

    // 在线人数
    if (playersResult.status === 'fulfilled' && playersResult.value.success && playersResult.value.data) {
      onlineCount.value = playersResult.value.data.count
    } else {
      onlineCount.value = 0
    }
  } catch {
    serverOnline.value = false
    onlineCount.value = 0
  } finally {
    if (showLoading) checking.value = false
  }
}

/** 启动游戏 */
async function launchGame() {
  // 检查1: 客户端路径
  if (!configStore.isClientPathSet) {
    ElMessage.warning('请先在设置中配置游戏客户端路径（选择 Wow.exe）')
    return
  }

  // 检查2: 准备 realmlist.wtf 并启动游戏
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI
  if (!isElectron) {
    ElMessage.info('游戏启动功能需要 Electron 环境')
    return
  }

  launching.value = true

  // 检查3: 客户端补丁校验（版本检查 + 文件 hash 校验）
  try {
    const { hasUpdate } = await patchStore.checkUpdate()
    if (hasUpdate) {
      launching.value = false
      const msg = patchStore.diff && patchStore.diff.toDownload.length > 0
        ? `检测到客户端需要更新（${patchStore.diff.toDownload.length} 个文件需要修复），建议更新后再启动游戏。是否前往更新？`
        : `检测到客户端有新版本（v${patchStore.remoteVersion}），建议更新后再启动游戏。是否前往更新？`
      try {
        await ElMessageBox.confirm(msg, '客户端需要更新', {
          confirmButtonText: '前往更新',
          cancelButtonText: '跳过更新直接启动',
          type: 'warning',
        })
        router.push('/patch')
        return
      } catch {
        // 用户选择跳过，继续启动游戏
        launching.value = true
      }
    }
  } catch {
    // 补丁检查失败不阻塞启动
    console.warn('[LaunchBar] 补丁检查失败，跳过')
  }

  try {
    const result = await window.electronAPI.prepareAndLaunchGame(
      configStore.settings.clientPath,
      configStore.serverIp,
    )

    if (result.success) {
      ElMessage.success('游戏已启动')
      // 启动后可选最小化到托盘
      if (configStore.settings.settings.minimizeToTray) {
        // TODO: 调用窗口最小化
      }
    } else {
      // 根据失败步骤给出明确的错误提示
      const stepText: Record<string, string> = {
        'validate': '路径校验失败',
        'check-exe': '文件检查失败',
        'mkdir': '目录创建失败',
        'write-realmlist': '写入 realmlist 失败',
        'launch': '启动失败',
      }
      const prefix = result.step ? (stepText[result.step] || '启动失败') : '启动失败'
      ElMessage.error(`${prefix}：${result.error || '未知错误'}`)
    }
  } catch (e) {
    ElMessage.error('启动游戏异常：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    launching.value = false
  }
}

// 定时器引用
let statusTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // 启动时获取一次（显示加载状态）
  fetchServerStatus(true)
  // 之后每10秒刷新一次（不显示加载状态，避免按钮频繁闪烁）
  statusTimer = setInterval(() => fetchServerStatus(false), 10000)
})

onUnmounted(() => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
})
</script>

<template>
  <div class="launch-bar">
    <!-- 左侧状态信息 -->
    <div class="status-section">
      <div class="status-item">
        <span class="status-dot" :class="serverOnline ? 'online' : 'offline'"></span>
        <span class="status-text">{{ serverStatusText }}</span>
      </div>
      <el-divider direction="vertical" />
      <div class="status-item">
        <el-icon><UserFilled /></el-icon>
        <span class="status-text">在线 {{ onlineCount }} 人</span>
      </div>
    </div>

    <!-- 右侧启动按钮 -->
    <div class="launch-section">
      <button
        class="launch-btn"
        :disabled="checking || launching"
        @click="launchGame"
      >
        <el-icon v-if="checking || launching" class="spin-icon"><Loading /></el-icon>
        <el-icon v-else><VideoPlay /></el-icon>
        <span>{{ launching ? '启动中...' : '启动游戏' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.launch-bar {
  grid-row: 2;
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--color-bg-medium);
  border-top: 1px solid var(--color-border);
}

.status-section {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;

    &.online {
      background: var(--color-success);
      box-shadow: 0 0 6px var(--color-success);
    }

    &.offline {
      background: var(--color-danger);
    }
  }
}

.launch-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 40px;
  background: linear-gradient(135deg, #27ae60 0%, #1e8449 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);

  .el-icon {
    font-size: 18px;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(39, 174, 96, 0.5);
    background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
