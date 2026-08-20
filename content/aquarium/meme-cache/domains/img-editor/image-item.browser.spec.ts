import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { h } from 'vue'
import ImageItem from './image-item.vue'

/** Nuxt UI 由外掛全域註冊，測試環境沒有，一律用空元件頂替 */
const STUB_LIST = ['UButton', 'UFormField', 'UInput', 'USlideover', 'USlider', 'USwitch']
const globalConfig = {
  stubs: Object.fromEntries(
    STUB_LIST.map((name) => [name, { template: '<div><slot /></div>' }]),
  ),
}

/** 1x1 透明 png，避免測試依賴外部檔案 */
const BLANK_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function renderImageItem(visible: boolean) {
  return render(() => h(ImageItem, {
    boardOrigin: { x: 0, y: 0 },
    visible,
    modelValue: {
      url: BLANK_IMAGE,
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      angle: 0,
    },
  }), { global: globalConfig })
}

describe('顯示區間', () => {
  it('visible 為 true 時圖片看得到', async () => {
    const screen = renderImageItem(true)
    const box = screen.container.querySelector<HTMLElement>('.box')

    expect(box).not.toBeNull()
    expect(box!.style.display).not.toBe('none')
  })

  it('visible 為 false 時整張藏起來', async () => {
    const screen = renderImageItem(false)
    const box = screen.container.querySelector<HTMLElement>('.box')

    expect(box).not.toBeNull()
    expect(box!.style.display).toBe('none')
  })
})
