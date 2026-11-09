import { useElementHover, useTransition } from '@vueuse/core'
import { useRoute } from 'vitepress'
import { computed, onMounted, shallowRef, watch } from 'vue'

/** 側欄捲軸平時透明，滑鼠移入側欄才淡入
 *
 * Chrome 只在 hover 狀態切換時重算捲軸樣式，CSS transition（含 @property 與 scrollbar-color）
 * 都會直接跳到終值、沒有中間幀；逐幀改寫側欄的行內變數才會讓捲軸跟著重繪。
 * 變數 --sidebar-thumb-opacity 由 style.css 的 .VPSidebar::-webkit-scrollbar-thumb 引用
 */
export function useSidebarScrollbarFade() {
  const route = useRoute()
  const sidebarElement = shallowRef<HTMLElement | null>(null)

  /** 首頁等版面沒有側欄，換頁後重新找 */
  function findSidebar() {
    sidebarElement.value = document.querySelector<HTMLElement>('.VPSidebar')
  }
  onMounted(findSidebar)
  watch(() => route.path, findSidebar, { flush: 'post' })

  const hovered = useElementHover(sidebarElement)
  const thumbOpacity = useTransition(
    computed(() => hovered.value ? 1 : 0),
    { duration: 300 },
  )

  watch(thumbOpacity, (value) => {
    sidebarElement.value?.style.setProperty('--sidebar-thumb-opacity', String(value))
  })
}
