import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { useImagesReady } from './use-images-ready'

// 輔助函式來建立一個包含圖片的測試元件
function createTestComponent(
  images: Array<{ src: string; id: string; style?: string }>,
  useComposable: () => { isLoaded: Ref<boolean> },
) {
  return defineComponent({
    setup() {
      const { isLoaded } = useComposable()
      return { isLoaded }
    },
    render() {
      return h('div', null, [
        ...images.map((img) => h('img', { src: img.src, id: img.id, style: img.style || '' })),
        h('div', { id: 'status' }, this.isLoaded ? 'Loaded' : 'Loading'),
      ])
    },
  })
}

describe('useImagesReady', () => {
  let mockContainer: HTMLDivElement

  beforeEach(() => {
    // 建立一個 DOM 元素作為掛載目標
    mockContainer = document.createElement('div')
    document.body.appendChild(mockContainer)
    vi.useFakeTimers() // 使用 Vitest 的假計時器
  })

  afterEach(() => {
    document.body.removeChild(mockContainer)
    vi.restoreAllMocks() // 清理 mock
    vi.useRealTimers() // 恢復真實計時器
  })

  it('如果沒有圖片，isLoaded 應該立即設為 true', async () => {
    const TestComponent = createTestComponent([], () => useImagesReady())
    const wrapper = mount(TestComponent, { attachTo: mockContainer })
    await nextTick() // 等待 onMounted 執行
    expect(wrapper.find('#status').text()).toBe('Loaded')
    wrapper.unmount()
  })

  it('一張圖片載入後，isLoaded 應該設為 true', async () => {
    const TestComponent = createTestComponent(
      [{ src: 'test.jpg', id: 'img1' }],
      () => useImagesReady(),
    )
    const wrapper = mount(TestComponent, { attachTo: mockContainer })

    await nextTick() // 等待 onMounted

    // 初始狀態應為 Loading
    expect(wrapper.find('#status').text()).toBe('Loading')

    // 模擬圖片載入
    const img = wrapper.find<HTMLImageElement>('#img1').element
    img.dispatchEvent(new Event('load'))

    await nextTick() // 等待事件處理和狀態更新
    expect(wrapper.find('#status').text()).toBe('Loaded')
    wrapper.unmount()
  })

  it('多張圖片載入後，isLoaded 應該設為 true', async () => {
    const TestComponent = createTestComponent(
      [
        { src: 'test1.jpg', id: 'img1' },
        { src: 'test2.jpg', id: 'img2' },
      ],
      () => useImagesReady(),
    )
    const wrapper = mount(TestComponent, { attachTo: mockContainer })
    await nextTick()

    expect(wrapper.find('#status').text()).toBe('Loading')

    const img1 = wrapper.find<HTMLImageElement>('#img1').element
    const img2 = wrapper.find<HTMLImageElement>('#img2').element

    img1.dispatchEvent(new Event('load'))
    await nextTick()
    expect(wrapper.find('#status').text()).toBe('Loading') // 只有一張載入

    img2.dispatchEvent(new Event('load'))
    await nextTick()
    expect(wrapper.find('#status').text()).toBe('Loaded') // 所有圖片載入
    wrapper.unmount()
  })

  it('應該處理圖片載入錯誤的情況', async () => {
    const TestComponent = createTestComponent(
      [
        { src: 'test1.jpg', id: 'img1' },
        { src: 'error.jpg', id: 'img2' },
      ],
      () => useImagesReady(),
    )
    const wrapper = mount(TestComponent, { attachTo: mockContainer })
    await nextTick()

    const img1 = wrapper.find<HTMLImageElement>('#img1').element
    const img2 = wrapper.find<HTMLImageElement>('#img2').element

    img1.dispatchEvent(new Event('load'))
    await nextTick()
    expect(wrapper.find('#status').text()).toBe('Loading')

    img2.dispatchEvent(new Event('error')) // 模擬錯誤
    await nextTick()
    expect(wrapper.find('#status').text()).toBe('Loaded') // 即使有錯誤，也應該完成
    wrapper.unmount()
  })

  it('應該遵守 delay 參數', async () => {
    const delay = 100
    const TestComponent = createTestComponent(
      [{ src: 'test.jpg', id: 'img1' }],
      () => useImagesReady({ delay }),
    )
    const wrapper = mount(TestComponent, { attachTo: mockContainer })
    await nextTick()

    const img = wrapper.find<HTMLImageElement>('#img1').element
    img.dispatchEvent(new Event('load'))
    await nextTick()

    expect(wrapper.find('#status').text()).toBe('Loading') // 尚未達到 delay 時間

    vi.advanceTimersByTime(delay) // 快轉時間
    await nextTick()
    expect(wrapper.find('#status').text()).toBe('Loaded')
    wrapper.unmount()
  })

  it('應該忽略不可見的圖片', async () => {
    const TestComponent = createTestComponent(
      [
        { src: 'visible.jpg', id: 'imgVisible' },
        { src: 'hidden.jpg', id: 'imgHidden', style: 'display: none;' },
      ],
      () => useImagesReady(),
    )
    const wrapper = mount(TestComponent, { attachTo: mockContainer })
    await nextTick()

    // Mock getComputedStyle for the hidden image
    const hiddenImgEl = wrapper.find<HTMLImageElement>('#imgHidden').element
    const originalGetComputedStyle = window.getComputedStyle
    window.getComputedStyle = vi.fn((el) => {
      if (el === hiddenImgEl) {
        return { display: 'none', visibility: 'visible' } as CSSStyleDeclaration
      }
      return originalGetComputedStyle(el)
    })

    expect(wrapper.find('#status').text()).toBe('Loading') // 初始

    const visibleImg = wrapper.find<HTMLImageElement>('#imgVisible').element
    visibleImg.dispatchEvent(new Event('load')) // 載入可見圖片

    await nextTick()
    // 因為隱藏圖片被忽略，所以載入可見圖片後就應該是 Loaded
    expect(wrapper.find('#status').text()).toBe('Loaded')

    window.getComputedStyle = originalGetComputedStyle // 恢復 mock
    wrapper.unmount()
  })

  it('應該使用提供的 target 元素', async () => {
    const targetDiv = document.createElement('div')
    targetDiv.innerHTML = '<img id="targetImg" src="target.jpg" />'
    mockContainer.appendChild(targetDiv) // 將目標 div 加入到掛載容器中

    const TestComponent = defineComponent({
      setup() {
        // 在這裡，我們不直接在 TestComponent 內部渲染圖片，
        // 而是讓 useImagesReady 作用於外部提供的 targetDiv
        const { isLoaded } = useImagesReady({ target: targetDiv })
        return { isLoaded }
      },
      render() {
        return h('div', { id: 'status' }, this.isLoaded ? 'Loaded' : 'Loading')
      },
    })

    const wrapper = mount(TestComponent, { attachTo: mockContainer })
    await nextTick()

    expect(wrapper.find('#status').text()).toBe('Loading')

    const targetImg = targetDiv.querySelector<HTMLImageElement>('#targetImg')!
    targetImg.dispatchEvent(new Event('load'))
    await nextTick()

    expect(wrapper.find('#status').text()).toBe('Loaded')
    wrapper.unmount()
  })

  it('在找不到 rootElement 時應處理並記錄警告', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn')
    // 建立一個沒有 $el 也沒有 vnode.el 的元件來模擬找不到 rootElement
    const TestComponent = defineComponent({
      setup() {
        // 強制 target 為 null，且元件本身也沒有 DOM 節點 (setup 中不渲染)
        // 這樣 getCurrentInstance()?.vnode?.el 和 instance?.proxy?.$el 都會是 undefined
        const { isLoaded } = useImagesReady({ target: null })
        return () => h('div', isLoaded.value ? 'Loaded' : 'Loading')
      },
    })

    // 掛載到一個分離的元素，避免影響 document.documentElement
    const detachedDiv = document.createElement('div')
    const wrapper = mount(TestComponent, { attachTo: detachedDiv })

    await nextTick() // 等待 onMounted

    expect(wrapper.text()).toBe('Loaded')
    expect(consoleWarnSpy).toHaveBeenCalledWith('[useImagesReady] no element found')

    consoleWarnSpy.mockRestore()
    wrapper.unmount()
  })

  it('應該正確處理已預先載入完成的圖片', async () => {
    // 模擬圖片已經完成載入 (例如從快取)
    const TestComponent = defineComponent({
      setup() {
        const { isLoaded } = useImagesReady()
        return { isLoaded }
      },
      render() {
        const img = h('img', { src: 'cached.jpg', id: 'imgCached' })
        // 手動設定 complete 屬性
        // 在真實瀏覽器中，如果圖片來自快取，complete 會是 true
        // 在 JSDOM 中，我們需要手動模擬
        if (img.el) {
          // @ts-expect-error 刻意修改 complete 屬性
          (img.el as HTMLImageElement).complete = true
        }
        else {
          // 如果 el 還不存在 (例如在 setup 階段)，我們需要在掛載後設定
          nextTick(() => {
            const actualImgEl = document.getElementById('imgCached') as HTMLImageElement
            if (actualImgEl) {
              Object.defineProperty(actualImgEl, 'complete', { value: true })
            }
          })
        }
        return h('div', [
          img,
          h('div', { id: 'status' }, this.isLoaded ? 'Loaded' : 'Loading'),
        ])
      },
    })

    const wrapper = mount(TestComponent, { attachTo: mockContainer })

    // 需要等待 onMounted 和可能的 nextTick (用於設定 complete)
    await nextTick()
    await nextTick() // 多一個 tick 確保 complete 屬性被處理

    // 因為圖片一開始就是 complete，所以應該立即是 Loaded
    expect(wrapper.find('#status').text()).toBe('Loaded')
    wrapper.unmount()
  })
})
