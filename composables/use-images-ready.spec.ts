import type { VNode } from 'vue'
import { page } from '@vitest/browser/context'
import { pipe, range, sample } from 'remeda'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick } from 'vue'
import { useImagesReady } from './use-images-ready'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type Images = Array<{ src: string; id?: string; style?: string }>
function createTestComponent(
  images: Images,
  slots: VNode[] = [],
) {
  return defineComponent({
    setup() {
      const {
        isReady,
        totalImages,
      } = useImagesReady()

      return () => h('div', null, [
        h('h1', '測試元件'),
        ...images.map(
          (img) => h('img', {
            src: img.src,
            id: img.id,
            style: img.style || '',
          }),
        ),
        ...slots,

        h('div', { id: 'status' }, isReady.value ? 'Ready' : 'Loading'),
        h('div', { id: 'totalImages' }, totalImages.value),
      ])
    },
  })
}

const sizeList = pipe(
  range(1, 6),
  (list) => list.map((i) => `${i * 100}`),
) as [string, string, ...string[]]

function getImageSrc(params?: { width: number; height: number }) {
  if (!params) {
    const sizes = sample(sizeList, 2)
    return `https://picsum.photos/${sizes.join('/')}`
  }

  const { width, height } = params
  return `https://picsum.photos/${width}/${height}`
}

function expectReady(screen: ReturnType<typeof render>) {
  return expect.element(screen.getByText('Ready'), {
    interval: 500,
  }).toBeInTheDocument()
}

describe('useImagesReady', () => {
  it('如果沒有圖片，isReady 應該立即設為 true', async () => {
    const screen = render(createTestComponent([]))
    await expect.element(screen.getByText('測試元件')).toBeInTheDocument()
  })

  it('1 張圖片載入後，文字從 Ready 變 Loading', async () => {
    const data = [
      { src: getImageSrc() },
    ]

    const screen = render(createTestComponent(data))
    await expect.element(screen.getByText(`${data.length}`)).toBeInTheDocument()
    await expect.element(screen.getByText('Loading')).toBeInTheDocument()

    await expectReady(screen)
  })

  it('2 張圖片載入後，文字從 Ready 變 Loading', async () => {
    const data: Images = [
      { src: getImageSrc() },
      { src: getImageSrc() },
    ]

    const screen = render(createTestComponent(data))
    await expect.element(screen.getByText(`${data.length}`)).toBeInTheDocument()
    await expect.element(screen.getByText('Loading')).toBeInTheDocument()

    await expectReady(screen)
  })

  it('hidden 的圖片會被忽略', async () => {
    const data: Images = [
      { src: getImageSrc() },
      { src: getImageSrc(), style: 'display: none;' },
      { src: getImageSrc(), style: 'visibility: hidden;' },
    ]

    const screen = render(createTestComponent(data))
    await expect.element(screen.getByText(`1`)).toBeInTheDocument()
    await expect.element(screen.getByText('Loading')).toBeInTheDocument()

    await expectReady(screen)
  })

  it('父層元素 hidden 的圖片也應被被忽略', async () => {
    const data: Images = [
      { src: getImageSrc() },
    ]

    const screen = render(createTestComponent(data, [
      h('div', { style: 'display: none;' }, [
        h('img', { src: getImageSrc() }),
      ]),
    ]))
    await expect.element(screen.getByText(`${data.length}`)).toBeInTheDocument()
    await expect.element(screen.getByText('Loading')).toBeInTheDocument()

    await expectReady(screen)
  })
})
