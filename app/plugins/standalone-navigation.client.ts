import { isStandalonePath, toPageKey } from '#vp'
import { defineNuxtPlugin } from 'nuxt/app'
import { START_LOCATION } from 'vue-router'

/** 進出 layout: false 的頁面（aquarium 各 app）一律整頁載入，不走 SPA 換頁。
 *
 * 這些 app 原本放在 whyframe 的 iframe 內，關掉頁面時 Babylon 引擎、全域事件、
 * useColorMode 強制的亮色設定都隨 iframe 一起消失。改成直接渲染後，
 * 用整頁載入維持同樣的隔離效果，不會把 app 的狀態帶回部落格頁
 */
export default defineNuxtPlugin({
  name: 'standalone-navigation',
  setup(nuxtApp) {
    nuxtApp.$router.beforeEach((to, from) => {
      // 首次載入不攔（404 頁的 from 同樣沒有 matched，不能用 matched 判斷）
      if (from === START_LOCATION)
        return

      // 同一頁（只差尾斜線或 hash）不需要重載
      const isSamePage = (toPageKey(to.path) ?? to.path) === (toPageKey(from.path) ?? from.path)
      if (isSamePage)
        return

      if (!isStandalonePath(from.path) && !isStandalonePath(to.path))
        return

      window.location.href = to.fullPath
      return false
    })
  },
})
