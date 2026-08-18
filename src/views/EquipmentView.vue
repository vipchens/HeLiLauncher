<script setup lang="ts">
/**
 * 叮号装备方案弹窗
 *
 * 数据来源：河狸乐园赞助服务.xlsx 的"叮70装备"和"叮80装备"子表格
 * 展示各职业/天赋的装备搭配方案，按部位横排，按天赋纵列
 *
 * 用法：
 *   <EquipmentView v-model:visible="showEquip" :level="80" />
 */
import { ref, computed, watch } from 'vue'
import BaseDialog from '@/components/BaseDialog.vue'
import equipmentData from '@/data/equipment.json'

interface Props {
  visible?: boolean
  level?: 70 | 80
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  level: 80,
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'close'): void
}>()

type Level = 70 | 80

interface Spec {
  name: string
  isDefault: boolean
}

interface Slot {
  slot: string
  items: (string | null)[]
}

// 弹窗内部的等级状态（支持在弹窗内切换70/80）
const innerLevel = ref<Level>(props.level)

watch(
  () => props.level,
  (lv) => {
    innerLevel.value = lv
  }
)

watch(
  () => props.visible,
  (v) => {
    if (v) {
      innerLevel.value = props.level
    }
  }
)

const data = computed(() => {
  return innerLevel.value === 70 ? equipmentData.level70 : equipmentData.level80
})

const specs = computed<Spec[]>(() => data.value?.specs || [])
const slots = computed<Slot[]>(() => data.value?.slots || [])

// ================== 打开装备数据库链接 ==================
async function openItemUrl(itemId: string | number) {
  const url = `https://db.nfuwow.com/80/?item=${itemId}`
  const electronAPI = (window as any).electronAPI
  if (electronAPI?.shellOpenExternal) {
    try {
      await electronAPI.shellOpenExternal(url)
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// 职业分组映射（用于表头颜色）
// 参考 WoW 官方职业配色，盗贼与德鲁伊分开
function getClassColor(specName: string): string {
  // 合并天赋：SS/FS/MS 输出
  if (/SS.*FS.*MS|SS\/FS\/MS/.test(specName)) return '#9482C9'
  if (/ZS|战士/.test(specName)) return '#C79C6E'
  if (/DK|死亡骑士/.test(specName)) return '#C41F3B'
  if (/QS|惩戒|防骑|奶骑/.test(specName)) return '#F58CBA'
  if (/LR|猎人/.test(specName)) return '#ABD473'
  if (/SM|萨满|增强|元素|奶萨/.test(specName)) return '#0070DE'
  if (/DZ|盗贼/.test(specName)) return '#FFF569'
  if (/D熊|D奶|野德|奶德|鸟德|德鲁伊/.test(specName)) return '#FF7D0A'
  if (/FS|法师/.test(specName)) return '#69CCF0'
  if (/SS|术士/.test(specName)) return '#9482C9'
  if (/MS|牧师|MS暗|MS奶/.test(specName)) return '#FFFFFF'
  return '#c4a878'
}

// 简化天赋名（去掉括号及其内容，兼容全角/半角/混合括号；去掉冗余的"输出"后缀）
function shortName(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/输出$/, '')
    .trim()
}
</script>

<template>
  <BaseDialog
    :visible="visible"
    title="叮号装备方案"
    width="1280px"
    @update:visible="(v) => emit('update:visible', v)"
    @close="emit('close')"
  >
    <!-- 内容区 -->
    <div class="equipment-view">
      <!-- 等级切换 -->
      <div class="level-switch-bar">
        <span class="level-label">选择等级</span>
        <div class="level-switch">
          <button
            :class="{ active: innerLevel === 70 }"
            @click="innerLevel = 70"
          >叮70装备</button>
          <button
            :class="{ active: innerLevel === 80 }"
            @click="innerLevel = 80"
          >叮80装备</button>
        </div>
      </div>

      <!-- 说明 -->
      <div class="info-bar">
        <span class="info-item">📋 共 {{ specs.length }} 个天赋方案</span>
        <span class="info-item">⚙️ 共 {{ slots.length }} 个装备部位</span>
        <span class="info-item legend">
          <span class="legend-dot default"></span> 默认方案
        </span>
        <span class="info-item legend">
          <span class="legend-dot optional"></span> 可选方案
        </span>
        <span class="info-item tip">💡 点击装备ID可在数据库网站查看详情</span>
      </div>

      <!-- 装备表格 -->
      <div class="table-wrapper">
        <table class="equip-table">
          <thead>
            <tr>
              <th class="slot-col" rowspan="2">部位</th>
              <th
                v-for="(spec, i) in specs"
                :key="i"
                class="spec-col"
                :class="{ 'is-default': spec.isDefault }"
              >
                <span class="spec-name" :style="{ color: getClassColor(spec.name) }">
                  {{ shortName(spec.name) }}
                </span>
                <span v-if="spec.isDefault" class="default-tag">默认</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(slot, ri) in slots" :key="ri" :class="{ 'alt-row': ri % 2 === 1 }">
              <td class="slot-name">{{ slot.slot }}</td>
              <td
                v-for="(itemId, ci) in slot.items"
                :key="ci"
                class="item-cell"
                :class="{ 'is-default': specs[ci]?.isDefault }"
              >
                <a
                  v-if="itemId"
                  class="item-id"
                  @click.stop="openItemUrl(itemId)"
                  :title="`查看物品 ${itemId} 详情`"
                >{{ itemId }}</a>
                <span v-else class="empty">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底部说明 -->
      <div class="footer-notes">
        <p>💡 装备方案仅供参考，实际以游戏内为准</p>
        <p>📌 叮号后装备自动发放到角色背包，请在游戏中查收</p>
        <p>⚠ 不同天赋的装备可能不同，请选择对应天赋方案</p>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped lang="scss">
/* ================ 等级切换栏 ================ */
.level-switch-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: rgba(61, 46, 31, 0.5);
  border: 1px solid #5a4a30;
  border-radius: 6px;
}

.level-label {
  font-size: 13px;
  font-weight: 700;
  color: #c4a878;
  letter-spacing: 1px;
}

.level-switch {
  display: flex;
  gap: 8px;

  button {
    padding: 8px 20px;
    border: 1px solid #6a5438;
    background: linear-gradient(180deg, #4d3a25 0%, #3d2e1f 100%);
    border-radius: 4px;
    color: #c4a878;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s ease;

    &.active {
      background: linear-gradient(180deg, #6d5430 0%, #5a4425 100%);
      border-color: #ffd700;
      color: #ffd700;
      text-shadow: 0 0 8px rgba(255, 215, 0, 0.4);
      box-shadow: 0 0 12px rgba(255, 215, 0, 0.2);
    }

    &:hover:not(.active) {
      border-color: #a08060;
      color: #e0d0b0;
    }
  }
}

/* ================ 信息栏 ================ */
.info-bar {
  display: flex;
  gap: 20px;
  margin-bottom: 14px;
  padding: 8px 16px;
  background: rgba(61, 46, 31, 0.4);
  border: 1px solid #5a4a30;
  border-radius: 4px;
  flex-wrap: wrap;
}

.info-item {
  font-size: 12px;
  color: #c4a878;
  display: flex;
  align-items: center;
  gap: 4px;
}

.info-item.tip {
  color: #6ab0e0;
  margin-left: auto;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;

  &.default {
    background: #ffd700;
    box-shadow: 0 0 6px rgba(255, 215, 0, 0.4);
  }

  &.optional {
    background: #5a4a30;
    border: 1px solid #6a5438;
  }
}

/* ================ 表格 ================ */
.table-wrapper {
  overflow-x: auto;
  border: 1px solid #6a5438;
  border-radius: 6px;
  background: linear-gradient(180deg, #2e2216 0%, #1a130a 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);

  &::-webkit-scrollbar {
    height: 10px;
  }
  &::-webkit-scrollbar-track {
    background: #1a130a;
  }
  &::-webkit-scrollbar-thumb {
    background: #5a4a30;
    border-radius: 5px;
    &:hover {
      background: #7a6448;
    }
  }
}

.equip-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 800px;
}

/* 表头 */
.spec-col {
  padding: 10px 8px;
  text-align: center;
  border-bottom: 2px solid #6a5438;
  border-right: 1px solid #3d2e1f;
  background: linear-gradient(180deg, #3d2e1f 0%, #2e2216 100%);
  min-width: 70px;
  position: relative;

  &.is-default {
    background: linear-gradient(180deg, #4d3a15 0%, #3d2e10 100%);
    border-bottom-color: #ffd700;
  }
}

.spec-name {
  display: block;
  font-weight: 700;
  font-size: 12px;
  text-shadow: 1px 1px 0 #000;
}

.default-tag {
  display: inline-block;
  font-size: 9px;
  color: #1a120a;
  background: #ffd700;
  padding: 1px 5px;
  border-radius: 2px;
  margin-top: 4px;
  font-weight: 700;
}

/* 部位列 */
.slot-col {
  padding: 10px 12px;
  text-align: center;
  color: #ffd700;
  font-weight: 700;
  font-size: 13px;
  border-bottom: 2px solid #6a5438;
  border-right: 2px solid #6a5438;
  background: linear-gradient(180deg, #3d2e1f 0%, #2e2216 100%);
  min-width: 60px;
  position: sticky;
  left: 0;
  z-index: 2;
}

/* 部位名（行头） */
.slot-name {
  padding: 8px 12px;
  text-align: center;
  color: #c4a878;
  font-weight: 700;
  font-size: 12px;
  border-right: 2px solid #6a5438;
  background: linear-gradient(180deg, #3d2e1f 0%, #2e2216 100%);
  position: sticky;
  left: 0;
  z-index: 1;
}

/* 数据单元格 */
.item-cell {
  padding: 6px 8px;
  text-align: center;
  border-right: 1px solid #2e2216;
  border-bottom: 1px solid #2e2216;

  &.is-default {
    background: rgba(255, 215, 0, 0.04);
  }
}

.alt-row .item-cell {
  background: rgba(0, 0, 0, 0.15);

  &.is-default {
    background: rgba(255, 215, 0, 0.06);
  }
}

.item-id {
  display: inline-block;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #e0d0b0;
  cursor: pointer;
  text-decoration: none;
  padding: 2px 6px;
  border-radius: 3px;
  border-bottom: 1px dashed transparent;
  transition: all 0.2s ease;

  &:hover {
    color: #6ab0e0;
    background: rgba(106, 176, 224, 0.1);
    border-bottom-color: #6ab0e0;
    text-shadow: 0 0 6px rgba(106, 176, 224, 0.3);
  }
}

.empty {
  color: #5a4a30;
}

/* ================ 底部说明 ================ */
.footer-notes {
  margin-top: 16px;
  padding: 14px 20px;
  background: rgba(61, 46, 31, 0.4);
  border: 1px solid #5a4a30;
  border-radius: 4px;

  p {
    color: #a08868;
    font-size: 12px;
    line-height: 1.8;
    margin: 0;
  }
  p + p {
    margin-top: 4px;
  }
}

/* ================ 响应式 ================ */
@media (max-width: 768px) {
  .level-switch-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .info-bar {
    gap: 10px;
  }

  .info-item.tip {
    margin-left: 0;
  }
}
</style>
