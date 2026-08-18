<script setup lang="ts">
/**
 * App.vue - 登录器主布局
 *
 * 布局结构：
 * ┌─────────────────────────────────────┐
 * │          侧边栏  │     主内容区       │
 * │                 │                   │
 * │   (导航图标)     │   (router-view)   │
 * │                 │                   │
 * ├─────────────────┴───────────────────┤
 * │          底部启动栏                   │
 * └─────────────────────────────────────┘
 */
import { ref, onMounted } from 'vue'
import SideNav from '@/components/SideNav.vue'
import LaunchBar from '@/components/LaunchBar.vue'
import UpdaterDialog from '@/components/UpdaterDialog.vue'
import { useConfigStore } from '@/stores/config'

const updaterDialogRef = ref<InstanceType<typeof UpdaterDialog>>()

onMounted(async () => {
  // 启动时自动检查登录器更新（受用户配置控制）
  const configStore = useConfigStore()
  await configStore.loadSettings()
  if (configStore.settings.settings.autoCheck) {
    // 延迟 2 秒，避免与启动加载竞争
    setTimeout(() => {
      updaterDialogRef.value?.check(false)
    }, 2000)
  }
})
</script>

<template>
  <div class="app-layout">
    <!-- 侧边导航栏 -->
    <SideNav />

    <!-- 主内容区域 -->
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 底部启动栏 -->
    <LaunchBar />

    <!-- 登录器自动更新弹窗 -->
    <UpdaterDialog ref="updaterDialogRef" />
  </div>
</template>

<style scoped lang="scss">
.app-layout {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: 1fr var(--launchbar-height);
  height: 100vh;
  width: 100vw;
  background: var(--color-bg-dark);
}

.main-content {
  grid-row: 1;
  grid-column: 2;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
}

// 路由切换动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
