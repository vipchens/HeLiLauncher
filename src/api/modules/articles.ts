/**
 * 文章 API 模块
 *
 * 从 AccountServer 的 /api/articles 接口获取 Markdown 文章
 */

import { get } from '../client'
import type { Article, ApiResponse } from '@/types'

/** 获取文章列表（基本信息，不含正文） */
export function getArticles(category?: string): Promise<ApiResponse<Article[]>> {
  return get<Article[]>('/api/articles', category ? { category } : undefined)
}

/** 获取单篇文章详情（含正文） */
export function getArticleDetail(id: string): Promise<ApiResponse<Article>> {
  return get<Article>('/api/articles/detail', { id })
}

/** 获取所有分类 */
export function getCategories(): Promise<ApiResponse<string[]>> {
  return get<string[]>('/api/articles/categories')
}
