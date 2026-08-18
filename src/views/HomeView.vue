<script setup lang="ts">
/**
 * 首页 - 文章浏览器
 *
 * 从 AccountServer /api/articles 获取 Markdown 文章
 * 支持分类切换，点击文章在弹窗中渲染 Markdown 正文
 */
import { ref, onMounted, computed, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'
import * as articlesApi from '@/api/modules/articles'
import { useConfigStore } from '@/stores/config'
import type { Article } from '@/types'
import BaseDialog from '@/components/BaseDialog.vue'

const configStore = useConfigStore()

// Markdown 渲染器（启用 HTML、链接识别、GFM 表格）
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
})

// ================ 状态 ================
const articles = ref<Article[]>([])
const categories = ref<string[]>([])
const activeCategory = ref<string>('全部')
const loading = ref(false)

// 文章阅读弹窗
const readerVisible = ref(false)
const currentArticle = ref<Article | null>(null)

// ================ 计算属性 ================

/** 分类标签列表（含"全部"） */
const tabList = computed(() => ['全部', ...categories.value])

/** 当前分类下的文章列表 */
const filteredArticles = computed(() => {
  if (activeCategory.value === '全部') return articles.value
  return articles.value.filter((a) => a.category === activeCategory.value)
})

/** 置顶文章 */
const pinnedArticles = computed(() => filteredArticles.value.filter((a) => a.pinned))

/** 非置顶文章 */
const normalArticles = computed(() => filteredArticles.value.filter((a) => !a.pinned))

/** 渲染后的 HTML（图片走 CDN，标题加 id 供目录定位） */
const renderedHtml = computed(() => {
  if (!currentArticle.value?.content) return ''
  let html = md.render(currentArticle.value.content)
  // 图片路径替换：
  // - /articles/images/xxx → jsdelivr CDN（GitHub 仓库）
  // - 其他 / 开头的相对路径 → 服务器 URL 兜底
  const base = configStore.serverUrl
  const cdnBase = 'https://cdn.jsdmirror.com/gh/vipchens/heli_img@main'
  html = html.replace(/(<img[^>]+src=")(\/[^"]*)/g, (_match, prefix, url) => {
    if (url.startsWith('/articles/images/')) {
      // 去掉 /articles/images/ 前缀，拼接 CDN 地址
      return `${prefix}${cdnBase}${url.replace('/articles/images/', '/')}`
    }
    return `${prefix}${base}${url}`
  })
  // 给 h1/h2/h3/h4 标题加 id，用于目录跳转
  let counter = 0
  html = html.replace(/<(h[1-4])([^>]*)>([\s\S]*?)<\/\1>/g, (_match, tag, attrs, text) => {
    counter++
    const id = `toc-heading-${counter}`
    return `<${tag}${attrs} id="${id}">${text}</${tag}>`
  })
  return html
})

/** 章节目录（从渲染后的 HTML 提取 h1/h2/h3/h4） */
interface TocItem {
  level: number
  text: string
  id: string
}
const toc = computed<TocItem[]>(() => {
  if (!renderedHtml.value) return []
  const items: TocItem[] = []
  const regex = /<h([1-4])[^>]*id="(toc-heading-\d+)"[^>]*>([\s\S]*?)<\/h\1>/g
  let match
  while ((match = regex.exec(renderedHtml.value)) !== null) {
    const text = match[3].replace(/<[^>]+>/g, '').trim()
    if (text) items.push({ level: Number(match[1]), text, id: match[2] })
  }
  return items
})

/** 当前高亮的目录项 */
const activeHeadingId = ref('')

/** 点击目录项 → 滚动到对应标题 */
function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    activeHeadingId.value = id
  }
}

// ================ 数据加载 ================

async function loadData() {
  loading.value = true
  try {
    const res = await articlesApi.getArticles()
    if (res.success && res.data) {
      articles.value = res.data
      categories.value = [...new Set(res.data.map((a) => a.category))]
    }
  } catch (e) {
    console.error('[HomeView] Load data failed:', e)
  } finally {
    loading.value = false
  }
}

// ================ 交互 ================

/** 文章详情加载状态 */
const detailLoading = ref(false)

/** 点击文章 → 打开阅读弹窗并加载正文 */
async function openArticle(article: Article) {
  currentArticle.value = article
  activeHeadingId.value = ''
  readerVisible.value = true

  // 加载文章详情（正文）
  detailLoading.value = true
  try {
    const res = await articlesApi.getArticleDetail(article.id)
    if (res.success && res.data) {
      currentArticle.value = res.data
    }
  } catch (e) {
    console.error('[HomeView] Load article detail failed:', e)
  } finally {
    detailLoading.value = false
    // 加载完成后滚动到顶部
    nextTick(() => {
      const content = document.querySelector('.base-dialog-content')
      if (content) content.scrollTop = 0
    })
  }
}

/** 格式化日期 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onMounted(loadData)
</script>

<template>
  <div class="home-view" v-loading="loading">
    <!-- 分类标签 -->
    <div class="category-tabs">
      <button
        v-for="cat in tabList"
        :key="cat"
        class="category-tab"
        :class="{ active: activeCategory === cat }"
        @click="activeCategory = cat"
      >
        {{ cat }}
      </button>
    </div>

    <!-- 置顶文章 -->
    <div v-if="pinnedArticles.length" class="pinned-section">
      <div v-for="article in pinnedArticles" :key="article.id" class="pinned-card" @click="openArticle(article)">
        <div class="pinned-badge">
          <el-icon><Star /></el-icon>
          <span>置顶</span>
        </div>
        <div class="pinned-body">
          <h3 class="pinned-title">{{ article.title }}</h3>
          <div class="pinned-meta">
            <span class="pinned-cat">{{ article.category }}</span>
            <span class="pinned-date">{{ formatDate(article.date) }}</span>
          </div>
        </div>
        <el-icon class="pinned-arrow"><ArrowRight /></el-icon>
      </div>
    </div>

    <!-- 文章列表（非置顶文章为空时不显示） -->
    <div v-if="normalArticles.length || !pinnedArticles.length" class="info-card">
      <div class="info-card-title">
        <el-icon><Document /></el-icon>
        <span>{{ activeCategory === '全部' ? '全部文章' : activeCategory }}</span>
      </div>

      <div v-if="!normalArticles.length && !pinnedArticles.length" class="empty-state">
        <el-icon :size="40"><Document /></el-icon>
        <p>暂无文章</p>
      </div>

      <div v-else-if="normalArticles.length" class="article-list">
        <div
          v-for="article in normalArticles"
          :key="article.id"
          class="article-item"
          @click="openArticle(article)"
        >
          <span class="article-cat-tag">{{ article.category }}</span>
          <span class="article-title">{{ article.title }}</span>
          <span class="article-date">{{ formatDate(article.date) }}</span>
        </div>
      </div>
    </div>

    <!-- 文章阅读弹窗 -->
    <BaseDialog
      v-model:visible="readerVisible"
      :title="currentArticle?.title || '文章'"
      width="1024px"
    >
      <div v-if="currentArticle" class="article-reader">
        <div class="reader-meta">
          <span class="reader-cat">{{ currentArticle.category }}</span>
          <span class="reader-date">{{ formatDate(currentArticle.date) }}</span>
        </div>
        <div class="reader-body">
          <!-- 章节目录 -->
          <aside v-if="toc.length" class="reader-toc">
            <div class="toc-header">
              <el-icon><List /></el-icon>
              <span>章节目录</span>
            </div>
            <div class="toc-list">
              <div
                v-for="item in toc"
                :key="item.id"
                class="toc-item"
                :class="[`toc-level-${item.level}`, { active: activeHeadingId === item.id }]"
                @click="scrollToHeading(item.id)"
              >{{ item.text }}</div>
            </div>
          </aside>
          <!-- 正文 -->
          <div v-if="detailLoading" class="reader-loading" v-loading="true">
            <p>正在加载文章...</p>
          </div>
          <div v-else class="reader-content" v-html="renderedHtml"></div>
        </div>
      </div>
    </BaseDialog>
  </div>
</template>

<style scoped lang="scss">
.home-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 分类标签 */
.category-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.category-tab {
  padding: 8px 18px;
  background: var(--color-bg-medium);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: var(--color-text-primary);
    border-color: var(--color-text-tertiary);
  }

  &.active {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(212, 175, 55, 0.1) 100%);
    border-color: var(--color-primary);
    color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.2);
  }
}

/* 置顶文章 */
.pinned-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pinned-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: linear-gradient(135deg, var(--color-bg-medium) 0%, var(--color-bg-dark) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--content-radius);
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: rgba(255, 215, 0, 0.4);
    transform: translateX(4px);
  }
}

.pinned-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
  border-radius: 10px;
  color: #2a1f10;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;

  .el-icon { font-size: 12px; }
}

.pinned-body {
  flex: 1;
  min-width: 0;
}

.pinned-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 4px;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.2);
}

.pinned-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.pinned-arrow {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

/* 文章列表卡片 */
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  color: var(--color-text-tertiary);

  .el-icon { opacity: 0.5; }
  p { margin: 0; font-size: 14px; }
}

.article-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.article-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(255, 215, 0, 0.3);
    transform: translateX(4px);
  }
}

.article-cat-tag {
  padding: 3px 10px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  color: var(--color-primary-light);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.article-title {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-date {
  font-size: 12px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

/* 文章阅读弹窗 */
.article-reader {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reader-meta {
  display: flex;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;

  .reader-cat {
    padding: 2px 10px;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 10px;
    color: var(--color-primary-light);
    font-size: 12px;
    font-weight: 600;
  }

  .reader-date {
    color: var(--color-text-tertiary);
    font-size: 12px;
  }
}

/* 正文区：目录 + 内容 */
.reader-body {
  display: flex;
  gap: 16px;
  min-height: 0;
}

/* 章节目录 */
.reader-toc {
  width: 180px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
}

.toc-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.toc-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toc-item {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 6px;
  border-left: 2px solid transparent;
  transition: all 0.2s ease;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 215, 0, 0.08);
    color: var(--color-text-primary);
  }

  &.active {
    background: rgba(255, 215, 0, 0.12);
    color: var(--color-primary);
    border-left-color: var(--color-primary);
  }

  &.toc-level-1 {
    font-weight: 700;
    font-size: 13px;
  }

  &.toc-level-2 {
    padding-left: 18px;
  }

  &.toc-level-3 {
    padding-left: 26px;
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  &.toc-level-4 {
    padding-left: 34px;
    font-size: 11px;
    color: var(--color-text-tertiary);
  }
}

/* 正文加载中 */
.reader-loading {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

/* Markdown 渲染样式 */
.reader-content {
  flex: 1;
  min-width: 0;
  color: var(--color-text-primary);
  font-size: 14px;
  line-height: 1.8;
  user-select: text;
  -webkit-user-select: text;

  :deep(h1) {
    font-size: 22px;
    font-weight: 800;
    color: var(--color-primary);
    margin: 16px 0 12px;
    text-shadow: 0 0 8px rgba(255, 215, 0, 0.2);
    scroll-margin-top: 16px;
  }

  :deep(h2) {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-primary-light);
    margin: 14px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--color-border);
    scroll-margin-top: 16px;
  }

  :deep(h3) {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 12px 0 8px;
    scroll-margin-top: 16px;
  }

  :deep(p) {
    margin: 8px 0;
  }

  :deep(ul), :deep(ol) {
    margin: 8px 0;
    padding-left: 24px;

    li {
      margin: 4px 0;
    }
  }

  :deep(a) {
    color: #3498db;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(blockquote) {
    margin: 12px 0;
    padding: 10px 16px;
    background: var(--color-bg-light);
    border-left: 3px solid var(--color-primary-light);
    border-radius: 4px;
    color: var(--color-text-secondary);
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;

    th {
      background: var(--color-bg-light);
      color: var(--color-primary-light);
      font-weight: 700;
      padding: 10px 14px;
      border: 1px solid var(--color-border);
      text-align: left;
    }

    td {
      padding: 8px 14px;
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
    }

    tr:nth-child(even) td {
      background: rgba(0, 0, 0, 0.15);
    }
  }

  :deep(img) {
    max-width: 100%;
    border-radius: 8px;
    margin: 8px 0;
  }

  :deep(code) {
    padding: 2px 6px;
    background: var(--color-bg-dark);
    border-radius: 4px;
    font-size: 13px;
    color: var(--color-primary);
  }

  :deep(pre) {
    padding: 12px 16px;
    background: var(--color-bg-dark);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow-x: auto;

    code {
      padding: 0;
      background: none;
      color: var(--color-text-primary);
    }
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 16px 0;
  }
}
</style>
