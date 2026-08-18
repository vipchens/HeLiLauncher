<script setup lang="ts">
/**
 * SideNav.vue - 侧边导航栏
 *
 * 图标式垂直导航，点击切换路由
 * 底部固定设置按钮
 */
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()

// 导航项配置（与路由 meta 对应）
const navItems = [
  { path: '/home', icon: 'HomeFilled', label: '公告' },
  { path: '/patch', icon: 'Download', label: '补丁' },
  { path: '/account', icon: 'User', label: '账号' },
  { path: '/online', icon: 'UserFilled', label: '在线' },
  { path: '/sponsor', icon: 'GoldMedal', label: '赞助' },
  { path: '/recruit', icon: 'Connection', label: '招募' },
]

// 当前激活的路由路径
const activePath = computed(() => route.path)
</script>

<template>
  <nav class="side-nav">
    <!-- 顶部 Logo -->
    <div class="nav-logo">
      <span class="logo-text">河狸乐园</span>
    </div>

    <!-- 导航项列表 -->
    <div class="nav-items">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: activePath === item.path }"
      >
        <el-icon :size="24">
          <component :is="item.icon" />
        </el-icon>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>

    <!-- 底部设置按钮 -->
    <div class="nav-footer">
      <router-link to="/settings" class="nav-item" :class="{ active: activePath === '/settings' }">
        <el-icon :size="24"><Setting /></el-icon>
        <span class="nav-label">设置</span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.side-nav {
  grid-row: 1 / -1;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-medium);
  border-right: 1px solid var(--color-border);
  padding: 12px 0;
}

.nav-logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  width: 36px;

  .logo-text {
    font-size: 14px;
    font-weight: bold;
    color: var(--color-primary);
    letter-spacing: 4px;
    line-height: 24px;
  }
}

.nav-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  align-items: center;
}

.nav-footer {
  width: 100%;
  display: flex;
  justify-content: center;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    background: var(--color-bg-light);
    color: var(--color-primary-light);
  }

  &.active {
    background: var(--color-bg-light);
    color: var(--color-primary);
    border-left: 3px solid var(--color-primary);
    border-radius: 0 8px 8px 0;
  }

  .nav-label {
    font-size: 11px;
    line-height: 1;
  }
}
</style>
