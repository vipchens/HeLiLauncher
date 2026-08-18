/**
 * 应用入口
 * 初始化 Vue、Pinia、Router、Element Plus
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { useConfigStore } from './stores/config'

import './assets/styles/main.scss'

const app = createApp(App)

// 注册 Pinia
const pinia = createPinia()
app.use(pinia)

// 注册路由
app.use(router)

// 注册 Element Plus
app.use(ElementPlus)

// 注册所有 Element Plus 图标为全局组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 初始化本地配置（异步，Electron 环境通过 IPC 读取文件）
const configStore = useConfigStore()
configStore.loadSettings().finally(() => {
  app.mount('#app')
})
