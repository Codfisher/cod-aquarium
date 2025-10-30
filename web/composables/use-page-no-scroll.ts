import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 強制頁面不滾動 */
export function usePageNoScroll() {
  let prevHtmlOverflow = ''
  let prevBodyOverflow = ''

  onMounted(() => {
    prevHtmlOverflow = document.documentElement.style.overflow
    prevBodyOverflow = document.body.style.overflow

    document.documentElement.style.setProperty('overflow', 'hidden', 'important')
    document.body.style.setProperty('overflow', 'hidden', 'important')
  })
  onBeforeUnmount(() => {
    document.documentElement.style.overflow = prevHtmlOverflow
    document.body.style.overflow = prevBodyOverflow
  })
}
