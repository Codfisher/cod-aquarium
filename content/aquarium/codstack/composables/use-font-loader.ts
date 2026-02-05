import { createSharedComposable } from '@vueuse/core'
import { onBeforeUnmount, onMounted } from 'vue'

function _useFontLoader() {
  // 載入字體
  const fontHref = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@100..900&family=Orbitron:wght@400..900'
  let linkEl: HTMLLinkElement
  onMounted(() => {
    // 已經有同樣的 link 就不要重複
    const existed = Array.from(document.head.querySelectorAll('link'))
      .find((link) => link.getAttribute('href')?.includes('Orbitron:wght@400..900'))
    if (existed)
      return

    linkEl = document.createElement('link')
    linkEl.rel = 'stylesheet'
    linkEl.href = fontHref
    document.head.appendChild(linkEl)
  })

  onBeforeUnmount(() => {
    if (linkEl)
      document.head.removeChild(linkEl)
  })
}

export const useFontLoader = createSharedComposable(_useFontLoader)
