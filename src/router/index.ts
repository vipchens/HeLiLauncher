/**
 * 路由配置
 *
 * 采用 Vue Router 4，每个路由对应一个页面组件
 * 路由守卫可用于：登录检查、补丁检查等
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '公告', icon: 'HomeFilled' },
  },
  {
    path: '/patch',
    name: 'patch',
    component: () => import('@/views/PatchView.vue'),
    meta: { title: '补丁', icon: 'Download' },
  },
  {
    path: '/account',
    name: 'account',
    component: () => import('@/views/AccountView.vue'),
    meta: { title: '账号', icon: 'User' },
  },
  {
    path: '/online',
    name: 'online',
    component: () => import('@/views/OnlineView.vue'),
    meta: { title: '在线', icon: 'UserFilled' },
  },
  {
    path: '/sponsor',
    name: 'sponsor',
    component: () => import('@/views/SponsorView.vue'),
    meta: { title: '赞助', icon: 'GoldMedal' },
  },
  {
    path: '/equipment',
    name: 'equipment',
    component: () => import('@/views/EquipmentView.vue'),
    meta: { title: '装备方案', icon: 'Goods' },
  },
  {
    path: '/recruit',
    name: 'recruit',
    component: () => import('@/views/RecruitView.vue'),
    meta: { title: '招募', icon: 'Connection' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置', icon: 'Setting' },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
