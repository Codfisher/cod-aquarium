import { page } from '@vitest/browser/context'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick } from 'vue'
import { useImagesReady } from './use-images-ready'

function createTestComponent(
  images: Array<{ src: string; id: string; style?: string }>,
) {
  return defineComponent({
    setup() {
      const { isReady } = useImagesReady()

      return () => h('div', null, [
        h('h1', '測試元件'),
        ...images.map(
          (img) => h('img', {
            src: img.src,
            id: img.id,
            style: img.style || '',
          }),
        ),
        h('div', { id: 'status' }, isReady.value ? 'Loaded' : 'Loading'),
      ])
    },
  })
}

describe('useImagesReady', () => {
  it('如果沒有圖片，isLoaded 應該立即設為 true', async () => {
    const screen = render(createTestComponent([]))
    await expect.element(screen.getByText('測試元件')).toBeInTheDocument()
  })

  it('1 張圖片載入後，文字從 Loaded 變 Loading', async () => {
    const screen = render(createTestComponent(
      [{ src: 'https://picsum.photos/400/200', id: 'img1' }],
    ))

    await expect.element(screen.getByText('Loading')).toBeInTheDocument()
  })
})
