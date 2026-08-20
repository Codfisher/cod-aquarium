import type { MemeData } from '../meme/type'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { h } from 'vue'
import ImgList from './img-list.vue'

const MEME_LIST: MemeData[] = [
  { file: 'a.webp', describe: '', ocr: '', keyword: '', emotion: '', animated: true },
  { file: 'b.webp', describe: '', ocr: '', keyword: '', emotion: '' },
]

/** Nuxt UI 由外掛全域註冊，測試環境沒有，用空元件頂替 */
const globalConfig = {
  components: {
    UButton: { template: '<button />' },
    UIcon: { template: '<i />' },
  },
}

function renderList(animatedBadgeVisible?: boolean) {
  return render(() => h(ImgList, {
    list: MEME_LIST,
    ...(animatedBadgeVisible === undefined ? {} : { animatedBadgeVisible }),
  }), { global: globalConfig })
}

function queryBadgeList(container: Element) {
  return container.querySelectorAll('[aria-label="動圖"]')
}

describe('動圖標記', () => {
  it('只有動圖會標記', async () => {
    const screen = renderList()

    // 虛擬清單要等版面算完才長出項目，故用輪詢
    await expect
      .poll(() => queryBadgeList(screen.container).length)
      // 兩筆資料中只有一筆是動圖
      .toBe(1)
  })

  it('animatedBadgeVisible 為 false 時不顯示', async () => {
    const screen = renderList(false)

    // 先確定圖片有算繪出來，否則零筆是假通過
    await expect
      .poll(() => screen.container.querySelectorAll('img').length)
      .toBe(2)

    expect(queryBadgeList(screen.container)).toHaveLength(0)
  })
})
