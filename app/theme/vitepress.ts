/**
 * VitePress client API 的相容層（匯入路徑別名 #vp）。
 *
 * 主題元件移植自 VitePress 預設主題，原本從 'vitepress' 匯入 useData、useRoute 等；
 * 這裡以 Nuxt 的路由與 #site/data 實作同樣的介面，元件程式碼可維持原樣。
 */
import type { InjectionKey, Ref } from 'vue'
import type { ClientPageData, SiteData } from './site-data'
import type { DefaultTheme } from './types/default-theme'
import { pageLoaderMap, site, standalonePathList } from '#site/data'
import { createSharedComposable, useDark } from '@vueuse/core'
import { useNuxtApp, useRoute as useNuxtRoute, useRouter as useNuxtRouter, useState } from 'nuxt/app'
import { computed, getCurrentInstance, inject, onMounted, onUnmounted, reactive, ref } from 'vue'

export const inBrowser = typeof document !== 'undefined'

export const APPEARANCE_KEY = 'vitepress-theme-appearance'

/** 找不到對應頁面時的資料，與 VitePress 相同 */
export const notFoundPageData: ClientPageData = {
  relativePath: '404.md',
  filePath: '',
  routePath: '/404',
  title: '404',
  description: 'Not Found',
  headers: [],
  frontmatter: { sidebar: false, layout: 'page' },
  lastUpdated: 0,
  isNotFound: true,
}

/** 網址路徑對應到頁面資料的鍵，容忍尾斜線與 .html 差異；殘缺的 % 編碼視為找不到 */
export function toPageKey(path: string): string | undefined {
  let decodedPath: string
  try {
    decodedPath = decodeURI(path)
  }
  catch {
    return undefined
  }
  return [
    decodedPath,
    decodedPath.replace(/\/$/, ''),
    `${decodedPath}/`,
    decodedPath.replace(/\.html$/, ''),
  ].find((key) => key in pageLoaderMap)
}

/** 是否為 layout: false 的頁面（aquarium 各 app），進出這些頁要整頁載入 */
export function isStandalonePath(path: string): boolean {
  const key = toPageKey(path)
  return !!key && standalonePathSet.has(key)
}
const standalonePathSet = new Set(standalonePathList)

/** 已載入的頁面資料。用 useState 讓 SSR 載入的那一頁跟著 payload 到 client，首次載入不必再抓 */
function usePageDataMap() {
  return useState<Record<string, ClientPageData>>('site:page-data-map', () => ({}))
}

/** 載入該網址的頁面資料，由路由 middleware 在換頁前呼叫（見 app/middleware/site-page-data.global.ts） */
export async function loadPageData(path: string): Promise<void> {
  const key = toPageKey(path)
  if (!key)
    return

  const pageDataMap = usePageDataMap()
  if (pageDataMap.value[key])
    return

  const loadedModule = await pageLoaderMap[key]!()
  pageDataMap.value = { ...pageDataMap.value, [key]: loadedModule.default }
}

/** 從已載入的頁面資料中查網址，找不到時回傳 404 資料 */
function findPageData(pageDataMap: Record<string, ClientPageData>, path: string): ClientPageData {
  const key = toPageKey(path)
  return (key && pageDataMap[key]) || notFoundPageData
}

/** 網址路徑查已載入的頁面資料（需在 setup、plugin 或 middleware 內呼叫） */
export function getPageData(path: string): ClientPageData {
  return findPageData(usePageDataMap().value, path)
}

/** 錯誤頁（app/error.vue）provide 此鍵為 true，子元件一律取得 404 頁面資料，
 * 避免網址剛好對應到某篇文章時，版面誤渲染該頁內容
 */
export const notFoundForcedKey: InjectionKey<boolean> = Symbol('vp-not-found-forced')

/** 依當前網址取頁面資料，錯誤頁下固定回傳 404 資料 */
function usePageData() {
  const route = useNuxtRoute()
  const isNotFoundForced = getCurrentInstance() ? inject(notFoundForcedKey, false) : false
  // state 要在 setup 時取得，computed 可能在之後（脫離 Nuxt context）才被求值
  const pageDataMap = usePageDataMap()
  return computed(() => isNotFoundForced ? notFoundPageData : findPageData(pageDataMap.value, route.path))
}

export function withBase(path: string): string {
  return path
}

/** 亮暗模式在全站共用一份狀態，儲存鍵與 VitePress 相同，舊訪客的偏好設定得以沿用 */
const useSharedDark = createSharedComposable(() => useDark({
  storageKey: APPEARANCE_KEY,
  initialValue: 'auto',
  /** VueUse 預設 disableTransition 會插入再移除一段 <style> 並強制計算樣式，觸發全頁樣式重算 */
  disableTransition: false,
}))

export interface VitePressData<T = DefaultTheme.Config> {
  site: Ref<SiteData & { themeConfig: T }>;
  theme: Ref<T>;
  page: Ref<ClientPageData>;
  frontmatter: Ref<ClientPageData['frontmatter']>;
  params: Ref<ClientPageData['params']>;
  title: Ref<string>;
  description: Ref<string>;
  lang: Ref<string>;
  dir: Ref<string>;
  localeIndex: Ref<string>;
  isDark: Ref<boolean>;
  hash: Ref<string>;
}

const siteRef = ref(site)

export function useData<T = DefaultTheme.Config>(): VitePressData<T> {
  const route = useNuxtRoute()
  const page = usePageData()
  /** aquarium 各 app 頁不啟動 useDark：app 用 useColorMode 強制亮色，useDark 會依偏好把 dark class 加回去，蓋掉 app 的設定。
   * 進出 app 頁一律整頁載入，網址在頁面存活期間不會變，可以在 setup 時就決定。
   * 要在 setup 時呼叫（不能延到 computed 內），useDark 內部會註冊 onMounted
   */
  const isDark = inBrowser && !isStandalonePath(route.path) ? useSharedDark() : ref(false)

  return {
    site: siteRef as unknown as Ref<SiteData & { themeConfig: T }>,
    theme: computed(() => siteRef.value.themeConfig as unknown as T),
    page,
    frontmatter: computed(() => page.value.frontmatter),
    params: computed(() => page.value.params),
    title: computed(() => page.value.title || siteRef.value.title),
    description: computed(() => page.value.description || siteRef.value.description),
    lang: computed(() => siteRef.value.lang),
    dir: computed(() => siteRef.value.dir),
    localeIndex: computed(() => 'root'),
    isDark,
    hash: computed(() => route.hash),
  }
}

export interface VitePressRoute {
  path: string;
  data: ClientPageData;
}

/** VitePress 的 route 物件：path 與當頁資料 */
export function useRoute(): VitePressRoute {
  const route = useNuxtRoute()
  return reactive({
    path: computed(() => route.path),
    data: usePageData(),
  }) as unknown as VitePressRoute
}

export interface VitePressRouter {
  route: VitePressRoute;
  go: (href?: string) => Promise<void>;
  onAfterRouteChanged?: (to: string) => void;
}

const afterRouteChangedHandlerSet = new Set<(to: string) => void>()
let isRouterHookInstalled = false

/** VitePress 的 router：go 換頁、onAfterRouteChanged 換頁後回呼 */
export function useRouter(): VitePressRouter {
  const nuxtRouter = useNuxtRouter()
  const route = useRoute()

  if (!isRouterHookInstalled && inBrowser) {
    isRouterHookInstalled = true
    nuxtRouter.afterEach((to) => {
      afterRouteChangedHandlerSet.forEach((handler) => handler(to.fullPath))
    })
  }

  const router: VitePressRouter = {
    route,
    async go(href = inBrowser ? location.href : '/') {
      await nuxtRouter.push(href)
    },
  }

  /** 相容 router.onAfterRouteChanged = fn 的寫法 */
  let currentHandler: ((to: string) => void) | undefined
  Object.defineProperty(router, 'onAfterRouteChanged', {
    get: () => currentHandler,
    set: (handler?: (to: string) => void) => {
      if (currentHandler)
        afterRouteChangedHandlerSet.delete(currentHandler)
      currentHandler = handler
      if (handler)
        afterRouteChangedHandlerSet.add(handler)
    },
  })
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (currentHandler)
        afterRouteChangedHandlerSet.delete(currentHandler)
    })
  }

  return router
}

/** 頁面內容渲染（含換頁）後執行，主題的大綱、錨點等依此重新掃描 DOM */
export function onContentUpdated(handler: () => void) {
  if (!inBrowser)
    return

  const nuxtApp = useNuxtApp()
  onMounted(handler)
  const stopHook = nuxtApp.hook('page:finish', handler)
  onUnmounted(() => {
    stopHook()
  })
}

/** 錨點捲動時要扣掉的高度（導覽列），與 VitePress 預設相同 */
export function getScrollOffset(): number {
  const offset = siteRef.value.scrollOffset
  return typeof offset === 'number' ? offset : 134
}
