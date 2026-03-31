import { createSharedComposable } from '@vueuse/core'
import { onBeforeUnmount, onMounted } from 'vue'

function _useFontLoader() {
  const fontHref = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Noto+Sans+TC:wght@100..900&display=swap'
  let linkElement: HTMLLinkElement
  onMounted(() => {
    const existed = Array.from(document.head.querySelectorAll('link'))
      .find((link) => link.getAttribute('href')?.includes('Orbitron'))
    if (existed)
      return

    linkElement = document.createElement('link')
    linkElement.rel = 'stylesheet'
    linkElement.href = fontHref
    document.head.appendChild(linkElement)
  })

  onBeforeUnmount(() => {
    if (linkElement)
      document.head.removeChild(linkElement)
  })
}

export const useFontLoader = createSharedComposable(_useFontLoader)
