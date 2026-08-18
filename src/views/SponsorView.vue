<script setup lang="ts">
/**
 * 游戏赞助页面
 *
 * 数据来源：河狸乐园赞助服务.xlsx
 * 两大区块：
 * 1. 赞助服务 — 叮号服务 + 容器，按类型分组展示
 * 2. 随缘打赏 — 快捷金额按钮 + 自定义金额输入
 *
 * 样式延续 WoW 羊皮纸主题
 */
import { ref, onMounted, computed } from 'vue'
import * as sponsorshipApi from '@/api/modules/sponsorship'
import EquipmentView from './EquipmentView.vue'


// ================ 赞助服务项 ================
interface ServiceItem {
  id: string
  category: string        // 分组：叮号 / 容器
  name: string            // 赞助内容
  amount: number          // 赞助金额
  description: string     // 说明
}

// ================ 重要须知 ================
const notices = [
  { icon: '📌', text: '申请方式：私聊 群管理【炒鸡河狸】，格式：叮号 角色名 所需套装' },
  { icon: '⏰', text: '处理时间：每日 21-23 点固定处理，其余时间随机处理' },
  { icon: '⚠', text: '新人提醒：从未玩过 WLK 的新手，不建议使用叮号服务；叮号会大幅降低游戏体验，请谨慎参与' },
  { icon: 'ℹ', text: '叮角色不提升任何专业等级，职业任务需要玩家自行做完' },
  { icon: '☠', text: '死亡骑士角色，必须自行完成新手村全部任务，解锁全部天赋点' },
]

// ================ 默认配置（来自 xlsx） ================
const defaultServices: ServiceItem[] = [
  {
    id: 'boost-70',
    category: '叮号服务',
    name: '叮70',
    amount: 100,
    description: '角色至70级，送70级装备一套（150+装等），金币500',
  },
  {
    id: 'boost-80',
    category: '叮号服务',
    name: '叮80',
    amount: 120,
    description: '角色至80级，送80级装备一套（180+装等），金币1000',
  },
  {
    id: 'boost-profession',
    category: '叮号服务',
    name: '叮专业',
    amount: 80,
    description: '指定一个已学专业熟练度至450（不含配方）',
  },
  {
    id: 'bag-36',
    category: '容器',
    name: '36格包/个',
    amount: 25,
    description: '36格大容量背包，每个角色可装备多个',
  },
]

// 打赏快捷金额
const tipPresets = [5, 10, 20, 50, 100]

// ================ 状态 ================
const services = ref<ServiceItem[]>(defaultServices)
const loading = ref(false)

// 联系GM弹窗状态
const qrDialogVisible = ref(false)
const qrInfo = ref<{
  title: string
  amount: number | string
  tip: string
} | null>(null)

// 装备方案弹窗状态
const equipDialogVisible = ref(false)
const equipDialogLevel = ref<70 | 80>(80)

// 打赏自定义金额
const customTipAmount = ref<number | ''>('')
const selectedTipPreset = ref<number | null>(null)

// ================ 按分组计算 ================
const groupedServices = computed(() => {
  const groups: Record<string, ServiceItem[]> = {}
  services.value.forEach(item => {
    if (!groups[item.category]) {
      groups[item.category] = []
    }
    groups[item.category].push(item)
  })
  return groups
})

// ================ 数据加载 ================
async function loadData() {
  loading.value = true
  try {
    const res = await sponsorshipApi.getSponsorshipPlans()
    if (res.success && res.data?.plans?.length) {
      // 后端有数据时使用后端数据
      services.value = res.data.plans.map(p => ({
        id: p.id,
        category: p.rewards[0] || '赞助服务',
        name: p.name,
        amount: p.amount,
        description: p.rewards.join('；'),
      }))
    }
  } catch {
    // 使用默认数据
  } finally {
    loading.value = false
  }
}

// ================ 交互逻辑 ================

/** 打开装备方案弹窗 */
function viewEquipment(level: 70 | 80) {
  equipDialogLevel.value = level
  equipDialogVisible.value = true
}

/** 点击赞助服务 → 弹出联系GM提示 */
function handleSponsor(item: ServiceItem) {
  qrInfo.value = {
    title: item.name,
    amount: item.amount,
    tip: `请私聊 GM【炒鸡河狸】处理赞助事宜`,
  }
  qrDialogVisible.value = true
}

/** 点击快捷打赏金额 */
function selectTipPreset(amount: number) {
  selectedTipPreset.value = amount
  customTipAmount.value = ''
}

/** 自定义金额输入时清除快捷选中 */
function onCustomInput() {
  selectedTipPreset.value = null
}

/** 确认打赏 */
function handleTip() {
  const amount = selectedTipPreset.value || customTipAmount.value
  if (!amount || amount < 1) return

  qrInfo.value = {
    title: '随缘打赏',
    amount: `¥${amount}`,
    tip: `感谢您的 ¥${amount} 打赏！请私聊 GM【炒鸡河狸】处理`,
  }
  qrDialogVisible.value = true
}

const canTip = computed(() => {
  const amount = selectedTipPreset.value || customTipAmount.value
  return amount !== '' && amount !== null && amount >= 1
})

onMounted(loadData)
</script>

<template>
  <div class="sponsor-view" v-loading="loading">
    <!-- 顶部介绍 -->
    <div class="intro-card">
      <div class="intro-icon">
        <el-icon :size="32"><GoldMedal /></el-icon>
      </div>
      <h2 class="intro-title">支持服务器</h2>
      <p class="intro-text">本服为公益私服，所有赞助款项全部用于服务器租用、带宽扩容和日常维护</p>
    </div>

    <!-- 赞助须知 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><InfoFilled /></el-icon>
        <span>赞助须知</span>
      </div>
      <div class="notice-list">
        <div v-for="(notice, i) in notices" :key="i" class="notice-item">
          <span class="notice-icon">{{ notice.icon }}</span>
          <span class="notice-text">{{ notice.text }}</span>
        </div>
      </div>
    </div>

    <!-- 赞助服务 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><Goods /></el-icon>
        <span>赞助服务</span>
      </div>

      <div v-for="(items, category) in groupedServices" :key="category" class="service-group">
        <div class="group-label">{{ category }}</div>
        <div class="service-cards">
          <div v-for="item in items" :key="item.id" class="service-card">
            <div class="card-top">
              <span class="service-name">{{ item.name }}</span>
              <span class="service-price">¥{{ item.amount }}</span>
            </div>
            <p class="service-desc">{{ item.description }}</p>
            <div class="card-actions">
              <button
                v-if="item.id === 'boost-70' || item.id === 'boost-80'"
                class="action-btn outline"
                @click="viewEquipment(item.id === 'boost-70' ? 70 : 80)"
              >
                <el-icon><View /></el-icon>
                <span>查看装备</span>
              </button>
              <button class="action-btn gold" @click="handleSponsor(item)">
                <el-icon><GoldMedal /></el-icon>
                <span>选择赞助</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 随缘打赏 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><Present /></el-icon>
        <span>随缘打赏</span>
      </div>
      <p class="section-desc">金额不限，随心支持，感谢每一份心意</p>

      <div class="tip-box">
        <div class="tip-presets">
          <button
            v-for="amount in tipPresets"
            :key="amount"
            class="tip-preset-btn"
            :class="{ active: selectedTipPreset === amount }"
            @click="selectTipPreset(amount)"
          >
            ¥{{ amount }}
          </button>
        </div>

        <div class="tip-custom">
          <span class="tip-custom-label">自定义金额</span>
          <div class="tip-input-wrapper">
            <span class="tip-currency">¥</span>
            <input
              type="number"
              v-model="customTipAmount"
              min="1"
              placeholder="输入金额"
              @input="onCustomInput"
            />
          </div>
        </div>

        <button class="action-btn danger" :disabled="!canTip" @click="handleTip">
          <el-icon><Present /></el-icon>
          <span>扫码打赏</span>
        </button>
      </div>
    </div>

    <!-- 联系GM弹窗 -->
    <div v-if="qrDialogVisible && qrInfo" class="qr-overlay" @click.self="qrDialogVisible = false">
      <div class="qr-dialog">
        <button class="qr-close" @click="qrDialogVisible = false">✕</button>
        <div class="qr-title">{{ qrInfo.title }}</div>
        <div class="qr-amount">{{ qrInfo.amount }}</div>

        <div class="qr-contact-area">
          <el-icon :size="48"><Service /></el-icon>
          <p class="qr-contact-name">炒鸡河狸</p>
        </div>

        <p class="qr-tip">{{ qrInfo.tip }}</p>
      </div>
    </div>

    <!-- 装备方案弹窗 -->
    <EquipmentView
      v-model:visible="equipDialogVisible"
      :level="equipDialogLevel"
    />
  </div>
</template>

<style scoped lang="scss">
.sponsor-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部介绍 */
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

/* 通用卡片 */
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

/* 须知 */
.notice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.notice-icon {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.notice-text {
  flex: 1;
}

/* 赞助服务 */
.service-group {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.group-label {
  display: inline-block;
  padding: 4px 14px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  color: var(--color-primary-light);
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  margin-bottom: 12px;
}

.service-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.service-card {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  transition: all 0.3s ease;
  box-sizing: border-box;

  &:hover {
    border-color: rgba(255, 215, 0, 0.3);
    transform: translateY(-2px);
  }
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.service-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
}

.service-price {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text-primary);
}

.service-desc {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

/* 通用按钮 */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  .el-icon { font-size: 15px; }

  &.gold {
    flex: 1;
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
      border-color: #3498db;
      color: #3498db;
    }
  }

  &.danger {
    padding: 14px 48px;
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    color: #fff;
    box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(231, 76, 60, 0.5);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

/* 打赏 */
.section-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  text-align: center;
  margin-bottom: 20px;
}

.tip-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.tip-presets {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.tip-preset-btn {
  min-width: 70px;
  padding: 12px 16px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text-secondary);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;

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

.tip-custom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.tip-custom-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.tip-input-wrapper {
  display: flex;
  align-items: center;
  background: var(--color-bg-light);
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  transition: all 0.3s ease;

  &:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.1);
  }

  .tip-currency {
    padding: 0 4px 0 14px;
    color: var(--color-text-tertiary);
    font-size: 16px;
  }

  input {
    width: 120px;
    padding: 12px 14px 12px 4px;
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    font-size: 16px;
    outline: none;

    &::placeholder {
      color: var(--color-text-muted);
    }

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  }
}

/* 二维码弹窗 */
.qr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.qr-dialog {
  position: relative;
  background: var(--color-bg-medium);
  border: 1px solid var(--color-border);
  border-radius: var(--content-radius);
  padding: 30px 40px;
  width: 320px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}

.qr-close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  font-size: 18px;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: var(--color-primary);
  }
}

.qr-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 6px;
}

.qr-amount {
  font-size: 28px;
  font-weight: 800;
  color: var(--color-text-primary);
  margin-bottom: 16px;
}

.qr-contact-area {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
}

.qr-contact-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-primary);
}

.qr-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

@media (max-width: 600px) {
  .service-card {
    width: 100%;
  }

  .tip-presets {
    gap: 6px;
  }

  .tip-preset-btn {
    min-width: 60px;
    padding: 10px 12px;
    font-size: 14px;
  }
}
</style>
