import type { PlateSeries } from '../../site/plate-series'
import type { ThemeConfig } from '../../site/theme-config'
import type { PageData } from './types/shared'

/** 站台層級設定，欄位沿用 VitePress 的 SiteData，主題元件不需改讀法 */
export interface SiteData {
  title: string;
  description: string;
  lang: string;
  dir: string;
  base: string;
  cleanUrls: boolean;
  appearance: boolean;
  scrollOffset: number;
  locales: Record<string, never>;
  head: [];
  /** 文章清單不放這裡，由 #site/article-list 提供給文章總覽 */
  themeConfig: Omit<ThemeConfig, 'articleList'>;
}

/** 情緒分類頁送到 client 的精簡參數，完整迷因清單只在 SSR payload */
export interface ClientEmotionParams {
  emotion: string;
  label: string;
  total: number;
}

export interface ClientPageData extends PageData {
  routePath: string;
  params?: ClientEmotionParams;
  /** 主題與專欄文章才有：同系列的圖版帶資料 */
  plateSeries?: PlateSeries;
}
