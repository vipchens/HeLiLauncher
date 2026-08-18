<script setup lang="ts">
/**
 * 系统设置页面
 *
 * 配置项：
 * - 服务器 IP 地址（纯 IP，不带端口，做格式校验）
 * - 游戏客户端路径（选择 Wow.exe 文件，校验路径以 Wow.exe 结尾）
 * - 自动检查更新、更新后启动游戏、最小化到托盘
 * - 下载并发数、最大重试次数、备份开关
 *
 * 所有配置保存到本地 config.json（Electron）或 localStorage（浏览器降级）
 * 软件启动时自动读取回显
 */
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useConfigStore } from '@/stores/config'
import UpdaterDialog from '@/components/UpdaterDialog.vue'

const configStore = useConfigStore()
const updaterDialogRef = ref<InstanceType<typeof UpdaterDialog>>()

// 当前登录器版本
const appVersion = ref('1.0.0')

/** 手动检查登录器更新 */
function checkForUpdates() {
  updaterDialogRef.value?.check(true)
}

// 本地表单
const form = ref({
  serverIp: '',
  clientPath: '',
  autoCheck: true,
  autoStartGame: false,
  minimizeToTray: true,
  downloadConcurrency: 4,
  maxRetry: 5,
  backupEnabled: true,
})

// 是否已完成初始化加载（避免 onMounted 回显时触发自动保存）
const initialized = ref(false)

// ================ IP 格式校验 ================
const ipError = ref('')

function validateIp(ip: string): boolean {
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const match = ip.match(ipRegex)
  if (!match) return false
  return match.slice(1).every((seg) => {
    const n = Number(seg)
    return n >= 0 && n <= 255
  })
}

function onIpInput() {
  const ip = form.value.serverIp.trim()
  if (!ip) {
    ipError.value = '请输入服务器 IP 地址'
  } else if (!validateIp(ip)) {
    ipError.value = 'IP 格式不正确，示例：117.72.202.12'
  } else {
    ipError.value = ''
  }
}

// ================ Wow.exe 路径校验 ================
const pathError = ref('')

function onPathInput() {
  const p = form.value.clientPath.trim()
  if (!p) {
    pathError.value = ''
  } else if (!p.toLowerCase().endsWith('wow.exe')) {
    pathError.value = '路径必须以 Wow.exe 结尾'
  } else {
    pathError.value = ''
  }
}

const isFormValid = computed(() => {
  return validateIp(form.value.serverIp.trim()) &&
    form.value.clientPath.trim().toLowerCase().endsWith('wow.exe')
})

// ================ 文件选择 ================
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

async function selectWowExe() {
  if (isElectron) {
    const result = await window.electronAPI.selectFile()
    if (!result.canceled && result.path) {
      form.value.clientPath = result.path
      onPathInput()
    }
  } else {
    const path = window.prompt('请输入 Wow.exe 完整路径：', form.value.clientPath)
    if (path) {
      form.value.clientPath = path
      onPathInput()
    }
  }
}

// ================ 自动保存（带防抖） ================
const savedMessage = ref('')
let saveTimer: ReturnType<typeof setTimeout> | null = null

async function autoSave() {
  // 初始化加载阶段不保存
  if (!initialized.value) return
  // 仅在表单有效时保存（IP/路径校验通过）
  if (!isFormValid.value) return

  try {
    await configStore.setServerIp(form.value.serverIp.trim())
    await configStore.setClientPath(form.value.clientPath.trim())
    await configStore.updateSettings({
      autoCheck: form.value.autoCheck,
      autoStartGame: form.value.autoStartGame,
      minimizeToTray: form.value.minimizeToTray,
      downloadConcurrency: form.value.downloadConcurrency,
      maxRetry: form.value.maxRetry,
      backupEnabled: form.value.backupEnabled,
    })
    savedMessage.value = '设置已保存'
    setTimeout(() => { savedMessage.value = '' }, 2000)
  } catch (e) {
    console.error('[SettingsView] Auto save failed:', e)
  }
}

// 深度监听表单变化，500ms 防抖后自动保存
watch(form, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(autoSave, 500)
}, { deep: true })

function handleReset() {
  form.value = {
    serverIp: '117.72.202.12',
    clientPath: '',
    autoCheck: true,
    autoStartGame: false,
    minimizeToTray: true,
    downloadConcurrency: 4,
    maxRetry: 5,
    backupEnabled: true,
  }
  ipError.value = ''
  pathError.value = ''
}

// ================ 启动时加载配置回显 ================
onMounted(async () => {
  await configStore.loadSettings()
  form.value = {
    serverIp: configStore.settings.serverIp,
    clientPath: configStore.settings.clientPath,
    autoCheck: configStore.settings.settings.autoCheck,
    autoStartGame: configStore.settings.settings.autoStartGame,
    minimizeToTray: configStore.settings.settings.minimizeToTray,
    downloadConcurrency: configStore.settings.settings.downloadConcurrency,
    maxRetry: configStore.settings.settings.maxRetry,
    backupEnabled: configStore.settings.settings.backupEnabled,
  }
  // 获取当前登录器版本号
  if (typeof window !== 'undefined' && window.electronAPI) {
    appVersion.value = await window.electronAPI.getAppVersion()
  }
  // 标记初始化完成，之后表单变化会触发自动保存
  // 用 nextTick 确保本次回显触发的 watch 不立即保存
  await nextTick()
  initialized.value = true
})
</script>

<template>
  <div class="settings-view">
    <!-- 顶部介绍 -->
    <div class="intro-card">
      <div class="intro-icon">
        <el-icon :size="32"><Setting /></el-icon>
      </div>
      <h2 class="intro-title">系统设置</h2>
      <p class="intro-text">配置服务器地址、游戏客户端路径与更新选项</p>
    </div>

    <!-- 服务器设置 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><Connection /></el-icon>
        <span>服务器设置</span>
      </div>
      <div class="form-group">
        <label class="form-label">服务器 IP 地址</label>
        <div class="input-row">
          <input
            v-model="form.serverIp"
            class="form-input"
            :class="{ error: ipError }"
            placeholder="117.72.202.12"
            @blur="onIpInput"
            @input="onIpInput"
          />
        </div>
        <p v-if="ipError" class="error-text">{{ ipError }}</p>
        <p v-else class="hint-text">输入服务器 IP 地址，无需端口（默认端口 3000）</p>
      </div>
    </div>

    <!-- 客户端设置 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><Monitor /></el-icon>
        <span>客户端设置</span>
      </div>
      <div class="form-group">
        <label class="form-label">游戏路径（Wow.exe）</label>
        <div class="input-row">
          <input
            v-model="form.clientPath"
            class="form-input"
            :class="{ error: pathError }"
            placeholder="点击右侧按钮选择 Wow.exe"
            readonly
            @input="onPathInput"
          />
          <button class="browse-btn" @click="selectWowExe">
            <el-icon><FolderOpened /></el-icon>
            <span>浏览</span>
          </button>
        </div>
        <p v-if="pathError" class="error-text">{{ pathError }}</p>
        <p v-else class="hint-text">选择游戏目录下的 Wow.exe 文件，用于启动游戏</p>
      </div>
    </div>

    <!-- 更新设置 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><Refresh /></el-icon>
        <span>更新设置</span>
      </div>
      <div class="toggle-group">
        <div class="toggle-item">
          <div class="toggle-info">
            <span class="toggle-label">自动检查更新</span>
            <span class="toggle-desc">启动时自动检查补丁更新</span>
          </div>
          <button
            class="toggle-switch"
            :class="{ on: form.autoCheck }"
            @click="form.autoCheck = !form.autoCheck"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
        <div class="toggle-item">
          <div class="toggle-info">
            <span class="toggle-label">更新后启动游戏</span>
            <span class="toggle-desc">补丁更新完成后自动启动游戏</span>
          </div>
          <button
            class="toggle-switch"
            :class="{ on: form.autoStartGame }"
            @click="form.autoStartGame = !form.autoStartGame"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
        <div class="toggle-item">
          <div class="toggle-info">
            <span class="toggle-label">最小化到托盘</span>
            <span class="toggle-desc">关闭窗口时最小化到系统托盘</span>
          </div>
          <button
            class="toggle-switch"
            :class="{ on: form.minimizeToTray }"
            @click="form.minimizeToTray = !form.minimizeToTray"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
        <!-- 补丁功能暂未启用，隐藏备份开关
        <div class="toggle-item">
          <div class="toggle-info">
            <span class="toggle-label">更新前备份</span>
            <span class="toggle-desc">应用补丁前备份原文件，支持回滚</span>
          </div>
          <button
            class="toggle-switch"
            :class="{ on: form.backupEnabled }"
            @click="form.backupEnabled = !form.backupEnabled"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
        -->
      </div>
    </div>

    <!-- 下载设置（补丁功能暂未启用，暂时隐藏）
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><Download /></el-icon>
        <span>下载设置</span>
      </div>
      <div class="form-row">
        <div class="form-group half">
          <label class="form-label">并发下载数</label>
          <div class="select-row">
            <button
              v-for="n in [1, 2, 4, 6, 8]"
              :key="n"
              class="select-btn"
              :class="{ active: form.downloadConcurrency === n }"
              @click="form.downloadConcurrency = n"
            >{{ n }}</button>
          </div>
        </div>
        <div class="form-group half">
          <label class="form-label">最大重试次数</label>
          <div class="select-row">
            <button
              v-for="n in [3, 5, 10, 0]"
              :key="n"
              class="select-btn"
              :class="{ active: form.maxRetry === n }"
              @click="form.maxRetry = n"
            >{{ n === 0 ? '无限' : n }}</button>
          </div>
        </div>
      </div>
    </div>
    -->

    <!-- 关于 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><InfoFilled /></el-icon>
        <span>关于</span>
      </div>
      <div class="about-info">
        <div class="about-item"><span>登录器版本</span><span>v{{ appVersion }}</span></div>
        <div class="about-item"><span>服务器</span><span>河狸乐园 WLK 怀旧服</span></div>
        <div class="about-item"><span>客户端版本</span><span>3.3.5a (12340)</span></div>
      </div>
      <div class="about-actions">
        <button class="action-btn gold" @click="checkForUpdates">
          <el-icon><Refresh /></el-icon>
          <span>检查登录器更新</span>
        </button>
      </div>
    </div>

    <!-- 登录器更新弹窗 -->
    <UpdaterDialog ref="updaterDialogRef" />

    <!-- 操作按钮 -->
    <div class="actions">
      <button class="action-btn outline" @click="handleReset">
        <el-icon><RefreshLeft /></el-icon>
        <span>恢复默认</span>
      </button>
    </div>

    <!-- 保存成功提示 -->
    <Transition name="toast">
      <div v-if="savedMessage" class="save-toast">
        <el-icon><CircleCheckFilled /></el-icon>
        <span>{{ savedMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ================ 顶部介绍 ================ */
.intro-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 24px;
  background: linear-gradient(135deg, var(--color-bg-medium) 0%, var(--color-bg-dark) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--content-radius);
  text-align: center;
}

.intro-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #8b7355 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2a1f10;
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
  margin-bottom: 8px;
}

.intro-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-primary);
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
}

.intro-text {
  font-size: 13px;
  color: var(--color-text-secondary);
  max-width: 500px;
}

/* ================ 通用卡片 ================ */
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
}

/* ================ 表单 ================ */
.form-group {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-bottom: 8px;
}

.input-row {
  display: flex;
  gap: 8px;
}

.form-input {
  flex: 1;
  padding: 12px 14px;
  background: var(--color-bg-light);
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.3s ease;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.1);
  }

  &.error {
    border-color: var(--color-danger);
    box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.1);
  }

  &[readonly] {
    cursor: default;
  }
}

.browse-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px;
  background: var(--color-bg-light);
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.3s ease;

  .el-icon {
    font-size: 16px;
  }

  &:hover {
    border-color: var(--color-primary);
    background: rgba(255, 215, 0, 0.08);
  }
}

.error-text {
  margin-top: 8px;
  color: var(--color-danger);
  font-size: 12px;
}

.hint-text {
  margin-top: 8px;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

/* ================ 开关 ================ */
.toggle-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(255, 215, 0, 0.2);
  }
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-label {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.toggle-desc {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-dark);
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &.on {
    background: linear-gradient(135deg, #27ae60 0%, #1e8449 100%);
    border-color: #27ae60;
    box-shadow: 0 0 8px rgba(39, 174, 96, 0.3);
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-text-secondary);
    transition: transform 0.2s ease;
  }

  &.on .toggle-knob {
    transform: translateX(20px);
    background: #fff;
  }
}

/* ================ 表单行 ================ */
.form-row {
  display: flex;
  gap: 16px;

  .half {
    flex: 1;
  }
}

.select-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.select-btn {
  padding: 10px 18px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 52px;

  &:hover {
    border-color: rgba(255, 215, 0, 0.3);
    color: var(--color-text-primary);
  }

  &.active {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(212, 175, 55, 0.1) 100%);
    border-color: var(--color-primary);
    color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.2);
  }
}

/* ================ 关于 ================ */
.about-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.about-item {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;

  span:last-child {
    color: var(--color-text-primary);
    font-weight: 600;
  }
}

.about-actions {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

/* ================ 通用按钮 ================ */
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-bottom: 20px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 32px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;

  .el-icon { font-size: 17px; }

  &.gold {
    background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
    color: #2a1f10;
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(212, 175, 55, 0.5);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &.outline {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);

    &:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
  }
}

/* ================ 保存提示 ================ */
.save-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  background: linear-gradient(135deg, #27ae60 0%, #1e8449 100%);
  border-radius: 24px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  z-index: 9999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);

  .el-icon { font-size: 16px; }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* ================ 响应式 ================ */
@media (max-width: 600px) {
  .form-row {
    flex-direction: column;
  }

  .select-btn {
    padding: 8px 14px;
    font-size: 13px;
  }

  .actions {
    flex-direction: column;
  }
}
</style>
