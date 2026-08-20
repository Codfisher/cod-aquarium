import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { h } from 'vue'
import TextItem from './text-item.vue'

/** Nuxt UI 由外掛全域註冊，測試環境沒有，一律用空元件頂替 */
const STUB_LIST = [
  'UButton',
  'UCollapsible',
  'UColorPicker',
  'UFormField',
  'UInput',
  'UPopover',
  'USlideover',
  'USlider',
]
const globalConfig = {
  stubs: Object.fromEntries(
    STUB_LIST.map((name) => [name, { template: '<div><slot /></div>' }]),
  ),
}

function renderTextItem(visible: boolean) {
  return render(() => h(TextItem, {
    boardOrigin: { x: 0, y: 0 },
    autoFocus: false,
    visible,
    modelValue: {
      text: '區間測試',
      x: 10,
      y: 10,
      angle: 0,
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.2,
      strokeWidth: 0,
      strokeColor: '#FFF',
      color: '#000',
      backgroundColor: '#FFF',
      backgroundOpacity: 0,
    },
  }), { global: globalConfig })
}

describe('顯示區間', () => {
  it('visible 為 true 時文字框看得到', async () => {
    const screen = renderTextItem(true)
    const box = screen.container.querySelector<HTMLElement>('.box')

    expect(box).not.toBeNull()
    expect(box!.style.display).not.toBe('none')
  })

  /**
   * 本元件是多根節點，父層下 v-show 只會靜默失效，
   * 顯示與否必須由元件自己處理
   */
  it('visible 為 false 時文字框整個藏起來', async () => {
    const screen = renderTextItem(false)
    const box = screen.container.querySelector<HTMLElement>('.box')

    expect(box).not.toBeNull()
    expect(box!.style.display).toBe('none')
  })
})

describe('focusText', () => {
  it('聚焦文字並全選內容', async () => {
    render(() => h(TextItem, {
      boardOrigin: { x: 0, y: 0 },
      // autoFocus 走的就是對外開放的 focusText
      autoFocus: true,
      modelValue: {
        text: '要被全選的字',
        x: 10,
        y: 10,
        angle: 0,
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.2,
        strokeWidth: 0,
        strokeColor: '#FFF',
        color: '#000',
        backgroundColor: '#FFF',
        backgroundOpacity: 0,
      },
    }), { global: globalConfig })

    await expect
      .poll(() => document.activeElement?.classList.contains('text'))
      .toBe(true)

    expect(window.getSelection()?.toString()).toBe('要被全選的字')
  })
})
