<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as serverApi from '@/api/modules/server'
import type { OnlinePlayer, ClassDistribution } from '@/types'

const onlinePlayers = ref<OnlinePlayer[]>([])
const classDist = ref<ClassDistribution | null>(null)
const loading = ref(false)
const lastRefresh = ref('--:--:--')
let refreshTimer: ReturnType<typeof setInterval> | null = null

function updateTime() {
  lastRefresh.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

async function loadData() {
  loading.value = true
  try {
    const [playersRes, distRes] = await Promise.all([
      serverApi.getOnlinePlayers(),
      serverApi.getClassDistribution(),
    ])

    if (playersRes.success && playersRes.data) {
      onlinePlayers.value = playersRes.data.players
    }

    if (distRes.success && distRes.data) {
      const d = distRes.data
      classDist.value = {
        total: d.total,
        alliance: { count: d.alliance.count, percentage: Number(d.alliance.percentage) },
        horde: { count: d.horde.count, percentage: Number(d.horde.percentage) },
        classes: d.classes.map((c: any) => ({
          classId: c.classId,
          className: c.className,
          count: c.count,
          percentage: Number(c.percentage),
        })),
      }
    }
  } catch (e) {
    console.error('[OnlineView] Load failed:', e)
  } finally {
    loading.value = false
    updateTime()
  }
}

onMounted(() => {
  loadData()
  refreshTimer = setInterval(loadData, 30000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="online-view">
    <!-- 职业分布 -->
    <div class="info-card" v-loading="loading">
      <div class="info-card-title">
        <el-icon><DataAnalysis /></el-icon>
        <span>全服职业占比</span>
      </div>

      <!-- 阵营对比 -->
      <div class="faction-row" v-if="classDist">
        <div class="faction-card alliance">
          <div class="faction-icon-box">
            <el-icon :size="24"><Sword /></el-icon>
          </div>
          <div class="faction-info">
            <div class="faction-name">联盟</div>
            <div class="faction-count">{{ classDist.alliance.count }}</div>
          </div>
          <div class="faction-percent">{{ classDist.alliance.percentage }}%</div>
        </div>
        <div class="faction-card horde">
          <div class="faction-icon-box">
            <el-icon :size="24"><Aim /></el-icon>
          </div>
          <div class="faction-info">
            <div class="faction-name">部落</div>
            <div class="faction-count">{{ classDist.horde.count }}</div>
          </div>
          <div class="faction-percent">{{ classDist.horde.percentage }}%</div>
        </div>
      </div>

      <!-- 总数 -->
      <div class="total-row" v-if="classDist">
        <span class="total-label">全服角色总数</span>
        <span class="total-value">{{ classDist.total }}</span>
      </div>

      <!-- 职业分布 -->
      <div class="class-grid" v-if="classDist">
        <div v-for="cls in classDist.classes" :key="cls.classId" class="class-item">
          <div class="class-header">
            <span class="class-name">{{ cls.className }}</span>
            <span class="class-percent">{{ cls.percentage }}%</span>
          </div>
          <div class="class-bar-track">
            <div class="class-bar-fill" :style="{ width: cls.percentage + '%' }"></div>
          </div>
          <span class="class-count">{{ cls.count }} 人</span>
        </div>
      </div>
    </div>

    <!-- 在线玩家列表 -->
    <div class="info-card">
      <div class="info-card-title">
        <el-icon><UserFilled /></el-icon>
        <span>在线玩家</span>
        <span class="badge">{{ onlinePlayers.length }}</span>
        <span class="refresh-hint">每30秒刷新 · {{ lastRefresh }}</span>
      </div>

      <div class="table-wrapper">
        <table class="players-table">
          <thead>
            <tr>
              <th>角色名</th>
              <th>等级</th>
              <th>职业</th>
              <th>种族</th>
              <th>地图</th>
              <th>延迟</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!onlinePlayers.length">
              <td colspan="6" class="empty-cell">暂无在线玩家</td>
            </tr>
            <tr v-for="player in onlinePlayers" :key="player.name">
              <td class="player-name">{{ player.name }}</td>
              <td class="player-level">{{ player.level }}</td>
              <td class="player-class">{{ player.class }}</td>
              <td class="player-race">{{ player.race }}</td>
              <td class="player-map">{{ player.map }}</td>
              <td class="player-latency" :class="{
                'latency-good': player.latency < 100,
                'latency-ok': player.latency >= 100 && player.latency < 200,
                'latency-bad': player.latency >= 200,
              }">{{ player.latency }}ms</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.online-view {
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

  .badge {
    padding: 2px 10px;
    background: rgba(255, 215, 0, 0.15);
    color: var(--color-primary);
    font-size: 12px;
    border-radius: 10px;
  }

  .refresh-hint {
    margin-left: auto;
    font-size: 12px;
    color: var(--color-text-tertiary);
    font-weight: 400;
  }
}

/* 阵营 */
.faction-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.faction-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-radius: 12px;
  border: 1px solid;

  &.alliance {
    background: linear-gradient(135deg, rgba(52, 152, 219, 0.1) 0%, rgba(0, 0, 0, 0.1) 100%);
    border-color: rgba(52, 152, 219, 0.3);

    .faction-icon-box { background: rgba(52, 152, 219, 0.2); color: #3498db; }
    .faction-count { color: #3498db; }
  }

  &.horde {
    background: linear-gradient(135deg, rgba(231, 76, 60, 0.1) 0%, rgba(0, 0, 0, 0.1) 100%);
    border-color: rgba(231, 76, 60, 0.3);

    .faction-icon-box { background: rgba(231, 76, 60, 0.2); color: #e74c3c; }
    .faction-count { color: #e74c3c; }
  }
}

.faction-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.faction-info {
  flex: 1;
}

.faction-name {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 2px;
}

.faction-count {
  font-size: 24px;
  font-weight: 800;
}

.faction-percent {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
}

/* 总数 */
.total-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  margin-bottom: 16px;
}

.total-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.total-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-primary);
}

/* 职业分布 */
.class-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.class-item {
  padding: 14px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.class-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.class-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.class-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary-light);
}

.class-bar-track {
  height: 6px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.class-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary-light) 0%, var(--color-primary) 100%);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.class-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

/* 表格 */
.table-wrapper {
  overflow-x: auto;
}

.players-table {
  width: 100%;
  border-collapse: collapse;

  th {
    padding: 12px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 700;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  td {
    padding: 12px 16px;
    font-size: 13px;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-light);
  }

  tr:hover td {
    background: rgba(255, 215, 0, 0.05);
  }

  tr:last-child td {
    border-bottom: none;
  }
}

.player-name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.player-level {
  color: #3498db;
  font-weight: 600;
}

.player-class {
  color: var(--color-primary-light);
}

.player-race {
  color: var(--color-text-secondary);
}

.player-map {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.latency-good { color: #27ae60; }
.latency-ok { color: #e67e22; }
.latency-bad { color: #e74c3c; }

.empty-cell {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: 30px !important;
}

@media (max-width: 768px) {
  .faction-row {
    flex-direction: column;
  }

  .class-grid {
    grid-template-columns: 1fr;
  }
}
</style>
