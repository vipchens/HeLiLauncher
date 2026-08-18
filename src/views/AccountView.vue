<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import * as accountApi from '@/api/modules/account'
import type { Character } from '@/types'
import BaseDialog from '@/components/BaseDialog.vue'

const authStore = useAuthStore()

const activeTab = ref<'login' | 'register'>('login')

const hardcoreConfirmVisible = ref(false)
const hardcoreTarget = ref<Character | null>(null)
const hardcoreSubmitting = ref(false)

function handleOpenHardcore(char: Character) {
  hardcoreTarget.value = char
  hardcoreConfirmVisible.value = true
}

async function handleConfirmHardcore() {
  if (!hardcoreTarget.value || hardcoreSubmitting.value) return
  hardcoreSubmitting.value = true
  try {
    const res = await accountApi.enableHardcore(hardcoreTarget.value.guid)
    if (res.success) {
      hardcoreConfirmVisible.value = false
      showResult(res.message || '已开启硬核模式，下次登录游戏后生效', 'success')
      await authStore.loadAccountInfo()
    } else {
      showResult(res.message || '开通失败', 'error')
    }
  } catch (e) {
    showResult(e instanceof Error ? e.message : '网络错误，请稍后再试', 'error')
  } finally {
    hardcoreSubmitting.value = false
  }
}

const loginForm = ref({ username: '', password: '' })
const registerForm = ref({ username: '', password: '' })
const passwordForm = ref({ oldPassword: '', newPassword: '' })

const loginLoading = ref(false)
const registerLoading = ref(false)
const passwordLoading = ref(false)

const showLoginPwd = ref(false)
const showRegisterPwd = ref(false)
const showOldPwd = ref(false)
const showNewPwd = ref(false)

const resultMessage = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let resultTimer: ReturnType<typeof setTimeout> | null = null

function showResult(text: string, type: 'success' | 'error') {
  resultMessage.value = { text, type }
  if (resultTimer) clearTimeout(resultTimer)
  resultTimer = setTimeout(() => { resultMessage.value = null }, 5000)
}

const usernameHint = ref<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })
let checkTimer: ReturnType<typeof setTimeout> | null = null

function onUsernameInput() {
  const username = registerForm.value.username.trim()
  if (!username) {
    usernameHint.value = { text: '', type: '' }
    return
  }
  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    usernameHint.value = { text: '账号名只能包含字母和数字', type: 'error' }
    return
  }
  if (username.length > 32) {
    usernameHint.value = { text: '账号名不能超过32个字符', type: 'error' }
    return
  }

  usernameHint.value = { text: '检查中...', type: '' }
  if (checkTimer) clearTimeout(checkTimer)
  checkTimer = setTimeout(async () => {
    try {
      const res = await accountApi.checkUsername(username)
      if (!res.valid) {
        usernameHint.value = { text: res.message, type: 'error' }
      } else if (res.exists) {
        usernameHint.value = { text: '账号名已存在', type: 'error' }
      } else {
        usernameHint.value = { text: '账号名可用', type: 'success' }
      }
    } catch {
      usernameHint.value = { text: '', type: '' }
    }
  }, 500)
}

const passwordHint = ref<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })

function onPasswordInput() {
  const pwd = registerForm.value.password.trim()
  if (!pwd) {
    passwordHint.value = { text: '', type: '' }
    return
  }
  if (pwd.length < 4) {
    passwordHint.value = { text: '密码至少需要4个字符', type: 'error' }
    return
  }
  if (pwd.length > 16) {
    passwordHint.value = { text: '密码不能超过16个字符', type: 'error' }
    return
  }
  if (!/^[a-zA-Z0-9]+$/.test(pwd)) {
    passwordHint.value = { text: '密码只能包含字母和数字', type: 'error' }
    return
  }
  passwordHint.value = { text: '密码格式正确', type: 'success' }
}

const newPasswordHint = ref<{ text: string; type: 'error' | 'success' | '' }>({ text: '', type: '' })

function onNewPasswordInput() {
  const pwd = passwordForm.value.newPassword.trim()
  if (!pwd) {
    newPasswordHint.value = { text: '', type: '' }
    return
  }
  if (pwd.length < 4) {
    newPasswordHint.value = { text: '密码至少需要4个字符', type: 'error' }
    return
  }
  if (pwd.length > 16) {
    newPasswordHint.value = { text: '密码不能超过16个字符', type: 'error' }
    return
  }
  if (!/^[a-zA-Z0-9]+$/.test(pwd)) {
    newPasswordHint.value = { text: '密码只能包含字母和数字', type: 'error' }
    return
  }
  newPasswordHint.value = { text: '密码格式正确', type: 'success' }
}

async function handleLogin() {
  const { username, password } = loginForm.value
  if (!username.trim() || !password.trim()) {
    showResult('请输入账号名和密码', 'error')
    return
  }

  loginLoading.value = true
  try {
    const res = await authStore.login(username, password)
    if (res.success) {
      showResult(res.message || '登录成功', 'success')
      await authStore.loadAccountInfo()
    } else {
      showResult(res.message || '登录失败', 'error')
    }
  } catch (e) {
    showResult(e instanceof Error ? e.message : '网络错误，请稍后再试', 'error')
  } finally {
    loginLoading.value = false
  }
}

async function handleRegister() {
  const { username, password } = registerForm.value
  if (!username.trim() || !password.trim()) {
    showResult('请输入账号名和密码', 'error')
    return
  }

  registerLoading.value = true
  try {
    const res = await authStore.register(username, password)
    if (res.success) {
      showResult(res.message || '注册成功', 'success')
      activeTab.value = 'login'
      loginForm.value.username = username
      loginForm.value.password = ''
      registerForm.value = { username: '', password: '' }
      usernameHint.value = { text: '', type: '' }
      passwordHint.value = { text: '', type: '' }
    } else {
      showResult(res.message || '注册失败', 'error')
    }
  } catch (e) {
    showResult(e instanceof Error ? e.message : '网络错误，请稍后再试', 'error')
  } finally {
    registerLoading.value = false
  }
}

async function handleChangePassword() {
  const { oldPassword, newPassword } = passwordForm.value
  if (!oldPassword.trim() || !newPassword.trim()) {
    showResult('请输入原密码和新密码', 'error')
    return
  }

  passwordLoading.value = true
  try {
    const res = await accountApi.changePassword(oldPassword, newPassword)
    if (res.success) {
      showResult(res.message || '密码修改成功，请重新登录', 'success')
      await authStore.logout()
      passwordForm.value = { oldPassword: '', newPassword: '' }
      newPasswordHint.value = { text: '', type: '' }
    } else {
      showResult(res.message || '修改失败', 'error')
    }
  } catch (e) {
    showResult(e instanceof Error ? e.message : '网络错误，请稍后再试', 'error')
  } finally {
    passwordLoading.value = false
  }
}

async function handleLogout() {
  await authStore.logout()
  showResult('已登出', 'success')
}

function gmLevelText(level: number): string {
  if (level === 0) return '普通玩家'
  if (level === 1) return '初级GM'
  if (level === 2) return '中级GM'
  return '管理员'
}

const characters = computed<Character[]>(() => authStore.accountInfo?.characters || [])

onMounted(() => {
  if (authStore.isLoggedIn) {
    authStore.loadAccountInfo().catch(() => {})
  }
})
</script>

<template>
  <div class="account-view">
    <!-- 未登录：登录/注册 -->
    <template v-if="!authStore.isLoggedIn">
      <div class="auth-container">
        <!-- 左侧品牌区 -->
        <div class="auth-brand">
          <div class="brand-logo">
            <span class="logo-rune">河</span>
          </div>
          <h1 class="brand-title">河狸乐园</h1>
          <p class="brand-subtitle">魔兽世界 335 怀旧服</p>
          <div class="brand-intro">
            <div class="intro-tag">WLK 公益服</div>
            <div class="intro-features">
              <div class="intro-feature">
                <el-icon><DataLine /></el-icon>
                <span>2倍经验</span>
              </div>
              <div class="intro-feature">
                <el-icon><DataAnalysis /></el-icon>
                <span>2倍专业</span>
              </div>
              <div class="intro-feature">
                <el-icon><Warning /></el-icon>
                <span>零容忍RMT/G团/外挂</span>
              </div>
              <div class="intro-feature">
                <el-icon><CopyDocument /></el-icon>
                <span>支持双开</span>
              </div>
            </div>
            <div class="intro-gifts">
              <div class="gift-item">🎁 新人赠背包</div>
              <div class="gift-item">⚔️ 永久风剑幻化</div>
              <div class="gift-item">🏪 随身商人银行</div>
              <div class="gift-item">🔥 超级炉石传送</div>
              <div class="gift-item">💪 职业Buff/世界增益</div>
              <div class="gift-item">🐎 招募送坐骑/36格包</div>
            </div>
            <p class="intro-desc">原汁原味无变态魔改，主打养老怀旧</p>
          </div>
        </div>

        <!-- 右侧表单区 -->
        <div class="auth-panel">
          <!-- Tab 切换 -->
          <div class="tab-switch">
            <button
              class="tab-switch-btn"
              :class="{ active: activeTab === 'login' }"
              @click="activeTab = 'login'"
            >
              <el-icon><UserFilled /></el-icon>
              <span>登录</span>
            </button>
            <button
              class="tab-switch-btn"
              :class="{ active: activeTab === 'register' }"
              @click="activeTab = 'register'"
            >
              <el-icon><Edit /></el-icon>
              <span>注册</span>
            </button>
            <div class="tab-indicator" :class="activeTab"></div>
          </div>

          <!-- 登录表单 -->
          <form v-if="activeTab === 'login'" class="auth-form" @submit.prevent="handleLogin">
            <div class="input-group">
              <div class="input-wrapper" :class="{ 'has-value': loginForm.username }">
                <el-icon class="input-icon"><User /></el-icon>
                <input
                  type="text"
                  v-model="loginForm.username"
                  maxlength="32"
                  placeholder="账号名"
                  autocomplete="off"
                />
              </div>
            </div>
            <div class="input-group">
              <div class="input-wrapper" :class="{ 'has-value': loginForm.password }">
                <el-icon class="input-icon"><Lock /></el-icon>
                <input
                  :type="showLoginPwd ? 'text' : 'password'"
                  v-model="loginForm.password"
                  maxlength="16"
                  placeholder="密码"
                  autocomplete="current-password"
                />
                <button type="button" class="toggle-pwd" @click="showLoginPwd = !showLoginPwd">
                  <el-icon><View v-if="!showLoginPwd" /><Hide v-else /></el-icon>
                </button>
              </div>
            </div>
            <button type="submit" class="auth-btn" :disabled="loginLoading">
              <span v-if="!loginLoading">进入艾泽拉斯</span>
              <el-icon v-else class="spin-icon"><Loading /></el-icon>
            </button>
          </form>

          <!-- 注册表单 -->
          <form v-else class="auth-form" @submit.prevent="handleRegister">
            <div class="input-group">
              <div class="input-wrapper" :class="{ 'has-value': registerForm.username, 'is-error': usernameHint.type === 'error', 'is-success': usernameHint.type === 'success' }">
                <el-icon class="input-icon"><User /></el-icon>
                <input
                  type="text"
                  v-model="registerForm.username"
                  maxlength="32"
                  placeholder="账号名（字母+数字）"
                  autocomplete="off"
                  @input="onUsernameInput"
                />
              </div>
              <div class="input-hint" v-if="usernameHint.text">
                <el-icon v-if="usernameHint.type === 'error'" class="hint-icon error"><WarningFilled /></el-icon>
                <el-icon v-else-if="usernameHint.type === 'success'" class="hint-icon success"><CircleCheckFilled /></el-icon>
                <span :class="usernameHint.type">{{ usernameHint.text }}</span>
              </div>
            </div>
            <div class="input-group">
              <div class="input-wrapper" :class="{ 'has-value': registerForm.password, 'is-error': passwordHint.type === 'error', 'is-success': passwordHint.type === 'success' }">
                <el-icon class="input-icon"><Lock /></el-icon>
                <input
                  :type="showRegisterPwd ? 'text' : 'password'"
                  v-model="registerForm.password"
                  maxlength="16"
                  placeholder="密码（4-16位字母+数字）"
                  autocomplete="new-password"
                  @input="onPasswordInput"
                />
                <button type="button" class="toggle-pwd" @click="showRegisterPwd = !showRegisterPwd">
                  <el-icon><View v-if="!showRegisterPwd" /><Hide v-else /></el-icon>
                </button>
              </div>
              <div class="input-hint" v-if="passwordHint.text">
                <el-icon v-if="passwordHint.type === 'error'" class="hint-icon error"><WarningFilled /></el-icon>
                <el-icon v-else-if="passwordHint.type === 'success'" class="hint-icon success"><CircleCheckFilled /></el-icon>
                <span :class="passwordHint.type">{{ passwordHint.text }}</span>
              </div>
            </div>
            <div class="input-group">
              <div class="input-wrapper readonly">
                <el-icon class="input-icon"><Files /></el-icon>
                <input type="text" value="巫妖王之怒 (WotLK)" disabled />
              </div>
            </div>
            <button type="submit" class="auth-btn" :disabled="registerLoading">
              <span v-if="!registerLoading">创建账号</span>
              <el-icon v-else class="spin-icon"><Loading /></el-icon>
            </button>
          </form>

          <!-- 提示 -->
          <div class="auth-tips">
            <el-icon><InfoFilled /></el-icon>
            <span>账号名和密码不区分大小写 · 4-16位字母或数字</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 已登录：账号面板 -->
    <div v-else-if="authStore.accountInfo" class="dashboard">
      <div class="dashboard-header">
        <div class="user-info">
          <div class="user-avatar">
            <span>{{ authStore.accountInfo.username?.[0]?.toUpperCase() }}</span>
          </div>
          <div class="user-meta">
            <h2>{{ authStore.accountInfo.username }}</h2>
            <span class="user-tag">{{ gmLevelText(authStore.accountInfo.gmlevel) }}</span>
          </div>
        </div>
        <button class="logout-btn" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon>
          <span>退出登录</span>
        </button>
      </div>

      <!-- 账号信息卡片 -->
      <div class="info-card">
        <div class="info-card-title">
          <el-icon><Memo /></el-icon>
          <span>账号信息</span>
        </div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">账号ID</span>
            <span class="info-value">{{ authStore.accountInfo.id }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">资料片</span>
            <span class="info-value">{{ authStore.accountInfo.expansionName }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">GM等级</span>
            <span class="info-value">{{ gmLevelText(authStore.accountInfo.gmlevel) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">注册时间</span>
            <span class="info-value">{{ authStore.accountInfo.joindate ? new Date(authStore.accountInfo.joindate).toLocaleDateString() : '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">在线状态</span>
            <span class="info-value status-row">
              <span :class="['status-dot', authStore.accountInfo.online ? 'online' : 'offline']"></span>
              {{ authStore.accountInfo.online ? '在线' : '离线' }}
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">最后登录</span>
            <span class="info-value">{{ authStore.accountInfo.lastLogin ? new Date(authStore.accountInfo.lastLogin).toLocaleDateString() : '从未登录' }}</span>
          </div>
        </div>
      </div>

      <!-- 角色列表 -->
      <div class="info-card">
        <div class="info-card-title">
          <el-icon><User /></el-icon>
          <span>服务器角色</span>
          <span class="badge">{{ characters.length }}</span>
        </div>
        <div v-if="!characters.length" class="empty-state">
          <el-icon :size="40"><User /></el-icon>
          <p>暂无角色数据</p>
        </div>
        <div v-else class="character-list">
          <div v-for="char in characters" :key="char.guid" class="character-card">
            <div class="char-header">
              <div class="char-title">
                <span class="char-name">{{ char.name }}</span>
                <span v-if="char.hardcoreStatus === 'enabled'" class="hardcore-badge hardcore-enabled">硬核</span>
                <span v-else-if="char.hardcoreStatus === 'dead'" class="hardcore-badge hardcore-dead">硬核已阵亡</span>
              </div>
              <span :class="['char-status', char.online ? 'online' : 'offline']">
                <span class="status-dot-sm"></span>
                {{ char.online ? '在线' : '离线' }}
              </span>
            </div>
            <div class="char-body">
              <div class="char-row">
                <span class="char-level">Lv.{{ char.level }}</span>
                <span class="char-class">{{ char.class }}</span>
              </div>
              <div class="char-row sub">
                <span>{{ char.race }}</span>
                <span>{{ char.gender }}</span>
              </div>
            </div>
            <div v-if="char.canEnableHardcore" class="char-action">
              <button class="action-btn outline" @click="handleOpenHardcore(char)">开通硬核模式</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 修改密码 -->
      <div class="info-card">
        <div class="info-card-title">
          <el-icon><Lock /></el-icon>
          <span>修改密码</span>
        </div>
        <form @submit.prevent="handleChangePassword" class="password-form">
          <div class="input-group">
            <div class="input-wrapper" :class="{ 'has-value': passwordForm.oldPassword }">
              <el-icon class="input-icon"><Lock /></el-icon>
              <input
                :type="showOldPwd ? 'text' : 'password'"
                v-model="passwordForm.oldPassword"
                maxlength="16"
                placeholder="原密码"
                autocomplete="current-password"
              />
              <button type="button" class="toggle-pwd" @click="showOldPwd = !showOldPwd">
                <el-icon><View v-if="!showOldPwd" /><Hide v-else /></el-icon>
              </button>
            </div>
          </div>
          <div class="input-group">
            <div class="input-wrapper" :class="{ 'has-value': passwordForm.newPassword, 'is-error': newPasswordHint.type === 'error', 'is-success': newPasswordHint.type === 'success' }">
              <el-icon class="input-icon"><Key /></el-icon>
              <input
                :type="showNewPwd ? 'text' : 'password'"
                v-model="passwordForm.newPassword"
                maxlength="16"
                placeholder="新密码（4-16位字母+数字）"
                autocomplete="new-password"
                @input="onNewPasswordInput"
              />
              <button type="button" class="toggle-pwd" @click="showNewPwd = !showNewPwd">
                <el-icon><View v-if="!showNewPwd" /><Hide v-else /></el-icon>
              </button>
            </div>
            <div class="input-hint" v-if="newPasswordHint.text">
              <el-icon v-if="newPasswordHint.type === 'error'" class="hint-icon error"><WarningFilled /></el-icon>
              <el-icon v-else-if="newPasswordHint.type === 'success'" class="hint-icon success"><CircleCheckFilled /></el-icon>
              <span :class="newPasswordHint.type">{{ newPasswordHint.text }}</span>
            </div>
          </div>
          <button type="submit" class="auth-btn secondary" :disabled="passwordLoading">
            <span v-if="!passwordLoading">确认修改</span>
            <el-icon v-else class="spin-icon"><Loading /></el-icon>
          </button>
        </form>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-else class="loading-state">
      <el-icon :size="40" class="spin-icon"><Loading /></el-icon>
      <span>加载中...</span>
    </div>

    <!-- 结果消息 -->
    <Transition name="toast">
      <div v-if="resultMessage" class="toast" :class="resultMessage.type">
        <el-icon v-if="resultMessage.type === 'success'"><CircleCheckFilled /></el-icon>
        <el-icon v-else><WarningFilled /></el-icon>
        <span>{{ resultMessage.text }}</span>
      </div>
    </Transition>

    <!-- 硬核模式确认弹窗（Teleport 到 body，位于根节点外，不影响 v-if/v-else 链） -->
    <BaseDialog
      v-model:visible="hardcoreConfirmVisible"
      title="开通硬核模式"
      width="520px"
    >
      <div class="hardcore-confirm">
        <p v-if="hardcoreTarget" class="hardcore-target">
          目标角色：<span class="target-name">{{ hardcoreTarget.name }}</span>
          <span class="target-info">（Lv.{{ hardcoreTarget.level }} · {{ hardcoreTarget.class }} · {{ hardcoreTarget.race }}）</span>
        </p>
        <div class="hardcore-rules">
          <h4>硬核模式规则</h4>
          <ul>
            <li>角色<strong class="warn">永久死亡</strong>，死后将无法复活或登录</li>
            <li>只能与<strong>硬核玩家之间交易</strong>（普通玩家无法与硬核玩家交易）</li>
            <li>只能与<strong>等级差为 5 级范围内的硬核玩家</strong>组队</li>
            <li>禁止<strong>使用拍卖行</strong>、<strong>邮箱</strong></li>
            <li>物品<strong>不会恢复</strong>，死亡后角色永久锁定</li>
            <li><strong>炉石</strong>仅保留「回家」与「记录位置」功能，传送回家 CD 与原版炉石一致（30 分钟）</li>
            <li>无法通过 <code>restbuff</code> 主动获得龙头 Buff，可前往<strong>主城被动获得</strong>世界 Buff</li>
          </ul>
        </div>
        <div class="hardcore-notice">
          <h4>说明</h4>
          <ul>
            <li>只有<strong>新建且未登录过的角色</strong>才能开启硬核模式（DK 无法开启）</li>
            <li>开通后<strong>不可逆</strong>，需在<strong>下次登录游戏</strong>后生效</li>
            <li>现阶段为测试阶段，正式奖励待稳定后公布，测试期符合要求的角色酌情补发奖励</li>
            <li>请仔细确认以上规则，一旦开通将无法撤销</li>
          </ul>
        </div>
      </div>
      <template #footer>
        <button class="action-btn outline" @click="hardcoreConfirmVisible = false">取消</button>
        <button
          class="action-btn danger"
          :disabled="hardcoreSubmitting"
          @click="handleConfirmHardcore"
        >
          <span v-if="!hardcoreSubmitting">确认开通硬核模式</span>
          <el-icon v-else class="spin-icon"><Loading /></el-icon>
        </button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped lang="scss">
.account-view {
  height: 100%;
  overflow-y: auto;
}

/* ================ 未登录页面 ================ */
.auth-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100%;
  gap: 0;
}

/* 品牌区 */
.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  background: linear-gradient(135deg, #3d2e1f 0%, #1a120a 100%);
  border-right: 1px solid rgba(255, 215, 0, 0.15);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(255, 215, 0, 0.1) 0%, transparent 60%),
      radial-gradient(ellipse at 70% 80%, rgba(139, 115, 85, 0.15) 0%, transparent 60%);
    pointer-events: none;
  }
}

.brand-logo {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #8b7355 50%, #5a4425 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 40px rgba(255, 215, 0, 0.3),
    inset 0 2px 8px rgba(255, 255, 255, 0.2),
    inset 0 -4px 12px rgba(0, 0, 0, 0.3);
  margin-bottom: 24px;
  animation: glow 3s ease-in-out infinite;
}

.logo-rune {
  font-size: 36px;
  font-weight: 900;
  color: #2a1f10;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3);
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.3), inset 0 2px 8px rgba(255, 255, 255, 0.2); }
  50% { box-shadow: 0 0 60px rgba(255, 215, 0, 0.5), inset 0 2px 8px rgba(255, 255, 255, 0.2); }
}

.brand-title {
  font-size: 32px;
  font-weight: 800;
  color: #ffd700;
  letter-spacing: 6px;
  margin: 0 0 8px;
  text-shadow:
    0 0 20px rgba(255, 215, 0, 0.4),
    2px 2px 0 rgba(0, 0, 0, 0.5);
}

.brand-subtitle {
  font-size: 14px;
  color: #b09878;
  letter-spacing: 2px;
  margin: 0 0 40px;
}

.brand-intro {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 260px;
}

.intro-tag {
  display: inline-block;
  padding: 4px 14px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 12px;
  color: #ffd700;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 2px;
}

.intro-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.intro-feature {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(255, 215, 0, 0.06);
  border: 1px solid rgba(255, 215, 0, 0.12);
  border-radius: 8px;
  color: #d4c4a0;
  font-size: 12px;
  transition: all 0.3s ease;

  .el-icon {
    font-size: 14px;
    color: #ffd700;
    flex-shrink: 0;
  }

  &:hover {
    background: rgba(255, 215, 0, 0.1);
    border-color: rgba(255, 215, 0, 0.25);
  }
}

.intro-gifts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 215, 0, 0.1);
  border-radius: 10px;
}

.gift-item {
  font-size: 12px;
  color: #c4b490;
  line-height: 1.6;
}

.intro-desc {
  font-size: 12px;
  color: #8a7458;
  text-align: center;
  margin: 0;
  line-height: 1.6;
}

/* 表单区 */
.auth-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 50px;
  background: var(--color-bg);
}

/* Tab 切换 */
.tab-switch {
  position: relative;
  display: flex;
  gap: 4px;
  margin-bottom: 36px;
  background: var(--color-bg-medium);
  border-radius: 10px;
  padding: 4px;
  border: 1px solid var(--color-border);
}

.tab-switch-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 1;

  .el-icon {
    font-size: 16px;
  }

  &.active {
    color: #ffd700;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(212, 175, 55, 0.1) 100%);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  &:hover:not(.active) {
    color: var(--color-text-primary);
  }
}

/* 表单 */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 16px;
  background: var(--color-bg-medium);
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  transition: all 0.3s ease;

  &:focus-within {
    border-color: #ffd700;
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.1), 0 0 20px rgba(255, 215, 0, 0.15);
  }

  &.is-error {
    border-color: #e74c3c;
    box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.1);
  }

  &.is-success {
    border-color: #27ae60;
    box-shadow: 0 0 0 3px rgba(39, 174, 96, 0.1);
  }

  &.readonly {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .input-icon {
    font-size: 18px;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  input {
    flex: 1;
    padding: 14px 0;
    background: transparent;
    border: none;
    outline: none;
    font-size: 15px;
    color: var(--color-text-primary);

    &::placeholder {
      color: var(--color-text-tertiary);
    }

    &:disabled {
      cursor: not-allowed;
    }
  }
}

.toggle-pwd {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: transparent;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.2s ease;

  &:hover {
    color: #ffd700;
  }

  .el-icon {
    font-size: 18px;
  }
}

.input-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-left: 4px;
  font-size: 12px;

  .hint-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .error {
    color: #e74c3c;
  }

  .success {
    color: #27ae60;
  }
}

/* 提交按钮 */
.auth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 16px;
  margin-top: 8px;
  background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
  border: none;
  border-radius: 10px;
  color: #2a1f10;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(212, 175, 55, 0.5);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.secondary {
    background: linear-gradient(135deg, #5a4a3a 0%, #3a2f25 100%);
    color: #d4c4a0;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #6a5a4a 0%, #4a3f35 100%);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    }
  }

  .spin-icon {
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-tips {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 12px 16px;
  background: rgba(255, 215, 0, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.1);
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;

  .el-icon {
    color: #ffd700;
    flex-shrink: 0;
  }
}

/* ================ 已登录页面 ================ */
.dashboard {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  background: linear-gradient(135deg, var(--color-bg-medium) 0%, var(--color-bg-light) 100%);
  border-radius: 14px;
  border: 1px solid var(--color-border);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4af37 0%, #8b7355 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 800;
  color: #2a1f10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.user-meta {
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text-primary);
  }
}

.user-tag {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 10px;
  background: rgba(255, 215, 0, 0.15);
  color: #ffd700;
  font-size: 12px;
  border-radius: 10px;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid #e74c3c;
  border-radius: 8px;
  color: #e74c3c;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  .el-icon {
    font-size: 16px;
  }

  &:hover {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    color: #fff;
    transform: translateY(-1px);
  }
}

/* 信息卡片 */
.info-card {
  background: var(--color-bg-medium);
  border: 1px solid var(--color-border);
  border-radius: 14px;
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
    color: #ffd700;
    font-size: 18px;
  }

  .badge {
    margin-left: auto;
    padding: 2px 10px;
    background: rgba(255, 215, 0, 0.15);
    color: #ffd700;
    font-size: 12px;
    border-radius: 10px;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: var(--color-bg-light);
  border-radius: 10px;
  border: 1px solid var(--color-border);
}

.info-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.info-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);

  &.status-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

/* 状态点 */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.online {
    background: #27ae60;
    box-shadow: 0 0 8px rgba(39, 174, 96, 0.6);
    animation: pulse 2s ease-in-out infinite;
  }

  &.offline {
    background: #6a5a4a;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 角色列表 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  color: var(--color-text-tertiary);

  .el-icon {
    opacity: 0.5;
  }

  p {
    margin: 0;
    font-size: 14px;
  }
}

.character-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.character-card {
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 16px;
  transition: all 0.3s ease;

  &:hover {
    border-color: rgba(255, 215, 0, 0.3);
    transform: translateY(-2px);
  }
}

.char-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.char-name {
  font-size: 16px;
  font-weight: 700;
  color: #ffd700;
}

.char-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 10px;

  &.online {
    background: rgba(39, 174, 96, 0.15);
    color: #27ae60;
  }

  &.offline {
    background: rgba(106, 90, 74, 0.2);
    color: var(--color-text-tertiary);
  }
}

.status-dot-sm {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.char-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.char-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);

  &.sub {
    font-size: 12px;
    color: var(--color-text-tertiary);
  }
}

.char-level {
  color: #6ab0e0;
  font-weight: 600;
}

.char-class {
  color: #d4af37;
}

/* 硬核徽章 */
.char-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.hardcore-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  border-width: 1px;
  border-style: solid;
  flex-shrink: 0;

  &.hardcore-enabled {
    background: rgba(231, 76, 60, 0.2);
    color: #e74c3c;
    border-color: rgba(231, 76, 60, 0.3);
  }

  &.hardcore-dead {
    background: rgba(106, 90, 74, 0.2);
    color: #8a7458;
    border-color: rgba(106, 90, 74, 0.3);
  }
}

/* 角色卡操作区 */
.char-action {
  margin-top: 12px;
  display: flex;
}

/* 按钮通用风格（与全局 action-btn 一致） */
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;

  &.outline {
    background: transparent;
    color: #d4af37;
    border: 1.5px solid rgba(255, 215, 0, 0.4);

    &:hover {
      background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(212, 175, 55, 0.1) 100%);
      border-color: #ffd700;
      color: #ffd700;
      transform: translateY(-1px);
    }
  }

  &.danger {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    color: #fff;
    box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(231, 76, 60, 0.5);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .spin-icon {
    animation: spin 0.8s linear infinite;
  }
}

/* 硬核模式确认弹窗内容 */
.hardcore-confirm {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.hardcore-target {
  margin: 0;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  border-left: 3px solid #e74c3c;

  .target-name {
    color: #ffd700;
    font-weight: 700;
  }

  .target-info {
    color: var(--color-text-tertiary);
    font-size: 12px;
    margin-left: 4px;
  }
}

.hardcore-rules,
.hardcore-notice {
  h4 {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--color-text-primary);
  }

  ul {
    margin: 0;
    padding-left: 18px;

    li {
      margin-bottom: 4px;

      .warn {
        color: #e74c3c;
        font-weight: 700;
      }

      strong {
        color: var(--color-text-primary);
      }
    }
  }
}

.hardcore-notice {
  padding: 12px;
  background: rgba(255, 215, 0, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.12);
  border-radius: 8px;
}

/* 修改密码 */
.password-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Toast 消息 — z-index 必须高于 BaseDialog 遮罩（9999）否则会被遮挡 */
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  z-index: 99999;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);

  &.success {
    background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
    color: #fff;
  }

  &.error {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    color: #fff;
  }
}

.toast-enter-active {
  animation: toastIn 0.3s ease;
}

.toast-leave-active {
  animation: toastOut 0.3s ease;
}

@keyframes toastIn {
  from { opacity: 0; transform: translate(-50%, -20px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translate(-50%, 0); }
  to { opacity: 0; transform: translate(-50%, -20px); }
}

/* 加载 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--color-text-tertiary);

  .spin-icon {
    animation: spin 0.8s linear infinite;
  }
}

/* 响应式 */
@media (max-width: 720px) {
  .auth-container {
    grid-template-columns: 1fr;
  }

  .auth-brand {
    padding: 40px 20px;
    gap: 16px;
  }

  .brand-intro {
    max-width: none;
  }

  .intro-features {
    grid-template-columns: 1fr 1fr;
  }

  .auth-panel {
    padding: 40px 24px;
  }

  .dashboard-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
}
</style>
