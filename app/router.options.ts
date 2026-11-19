import type { RouterConfig } from 'nuxt/schema'
import type { RouteLocationNormalized } from 'vue-router'
import { useNuxtApp } from 'nuxt/app'
import { START_LOCATION } from 'vue-router'
import { consumeSmoothScrollRequest, getHashScrollPosition } from './theme/scroll'

type ScrollPosition = ScrollToOptions | false

function isSamePath(to: RouteLocationNormalized, from: RouteLocationNormalized) {
  return to.path.replace(/\/$/, '') === from.path.replace(/\/$/, '')
}

/** 換頁後的捲動位置：返回上一頁還原原位置；有 hash 捲到錨點並扣掉導覽列高度；其餘回頂端 */
function getPosition(to: RouteLocationNormalized, savedPosition: ScrollToOptions | null, isSmooth: boolean): ScrollPosition {
  if (savedPosition)
    return savedPosition
  if (to.hash)
    return getHashScrollPosition(to.hash, isSmooth) ?? { left: 0, top: 0 }
  return { left: 0, top: 0 }
}

/** 錨點捲動規則同 VitePress（router.js 的 scrollTo），而非瀏覽器原生的貼齊頂端 */
export default {
  scrollBehavior(to, from, savedPosition) {
    const isSmooth = consumeSmoothScrollRequest()

    if (isSamePath(to, from) && from !== START_LOCATION) {
      if (to.hash)
        return getHashScrollPosition(to.hash, isSmooth) ?? false
      if (from.hash)
        return savedPosition ?? { left: 0, top: 0 }
      return false
    }

    /** 首次載入時內容已由 SSR 渲染，可直接計算 */
    if (from === START_LOCATION)
      return getPosition(to, savedPosition, false)

    /** 等新頁面渲染完才計算錨點位置 */
    const nuxtApp = useNuxtApp()
    return new Promise<ScrollPosition>((resolve) => {
      nuxtApp.hooks.hookOnce('page:loading:end', () => {
        requestAnimationFrame(() => {
          if (nuxtApp.$router.currentRoute.value.fullPath !== to.fullPath) {
            resolve(false)
            return
          }
          resolve(getPosition(to, savedPosition, isSmooth))
        })
      })
    })
  },
} satisfies RouterConfig
