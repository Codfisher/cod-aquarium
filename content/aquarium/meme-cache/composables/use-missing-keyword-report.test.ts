import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useMissingKeywordReport } from './use-missing-keyword-report'

describe('useMissingKeywordReport', () => {
  const gtag = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { parent: { gtag } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    gtag.mockReset()
  })

  /** watch 不會在建立時觸發，得等關鍵字變動後再讓 debounce 走完 */
  async function typeKeyword(value: string) {
    const keyword = ref('')
    useMissingKeywordReport({ keyword, resultCount: 0, loaded: true })

    keyword.value = value
    await nextTick()
    await vi.runOnlyPendingTimersAsync()
  }

  it('0 結果的關鍵字會回報', async () => {
    await typeKeyword('火星人')

    expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'meme_not_found', { keyword: '火星人' })
  })

  // 搜尋詞要夠長，否則會先被最短長度檢查擋掉，測不到排除詞的守門
  it.each([
    '火星人 -小八',
    '-小八 火星人',
    '火星人　-小八',
    '火星人 -小八 -吉伊',
  ])('帶排除詞的搜尋不回報，0 結果可能是被自己排光的：%s', async (input) => {
    await typeKeyword(input)

    expect(gtag).not.toHaveBeenCalled()
  })

  it('詞中間的連字號不是排除詞，照常回報', async () => {
    await typeKeyword('Spider-Man')

    expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'meme_not_found', { keyword: 'Spider-Man' })
  })

  it('顏文字開頭的破折號不是排除詞，照常回報', async () => {
    await typeKeyword('火星人 -_-')

    expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'meme_not_found', { keyword: '火星人 -_-' })
  })

  it('還沒打完的 - 不會記進回報', async () => {
    await typeKeyword('火星人 -')

    expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'meme_not_found', { keyword: '火星人' })
  })

  it('多餘的空白收斂成單一空格再回報', async () => {
    await typeKeyword('火星人   外星人')

    expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'meme_not_found', { keyword: '火星人 外星人' })
  })
})
