import { isStandalonePath, loadPageData } from '#vp'
import { defineNuxtRouteMiddleware, loadPayload, preloadRouteComponents, useNuxtApp, useRouter } from 'nuxt/app'

/** 換頁前先載入目標頁的頁面資料（標題、frontmatter、更新時間），版面依此決定側欄、大綱等。
 * 每頁資料各自是一個 chunk，SSR 載入的那一頁會跟著 payload 到 client，首次載入不會多一次請求。
 *
 * 路由元件與 payload 原本要等 middleware 結束才依序下載，這裡同時發出，換頁少等兩段。
 * aquarium 等 layout: false 的頁面會整頁重載（app/plugins/standalone-navigation.client.ts），
 * 不必先下載它們很大的元件 chunk
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // 首次載入（hydration）的元件與 payload 已在 HTML 內，只有 client 換頁需要預載
  const isSpaNavigation = import.meta.client && !useNuxtApp().isHydrating && !isStandalonePath(to.path)

  await Promise.all([
    loadPageData(to.path),
    isSpaNavigation ? preloadRouteComponents(to.path, useRouter()) : undefined,
    // 預載失敗時，Nuxt 換頁時會再載一次，這裡不阻擋
    isSpaNavigation ? loadPayload(to.path).catch(() => undefined) : undefined,
  ])
})
