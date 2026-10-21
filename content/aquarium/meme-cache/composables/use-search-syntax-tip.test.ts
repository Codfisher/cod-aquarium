import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useSearchSyntaxTip } from './use-search-syntax-tip'

const DURATION = 3000

describe('useSearchSyntaxTip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(initialKeyword = '') {
    const focused = ref(false)
    const keyword = ref(initialKeyword)
    const { visible } = useSearchSyntaxTip({ focused, keyword, duration: DURATION })
    return { focused, keyword, visible }
  }

  it('聚焦且尚未輸入時浮現', async () => {
    const { focused, visible } = setup()
    // 對照：尚未聚焦時不該出現，下面的 true 才確定來自聚焦
    expect(visible.value).toBe(false)

    focused.value = true
    await nextTick()

    expect(visible.value).toBe(true)
  })

  it('一開始就聚焦也會浮現', () => {
    const { visible } = useSearchSyntaxTip({
      focused: ref(true),
      keyword: ref(''),
      duration: DURATION,
    })

    expect(visible.value).toBe(true)
  })

  it('失焦就收起', async () => {
    const { focused, visible } = setup()
    focused.value = true
    await nextTick()

    focused.value = false
    await nextTick()

    expect(visible.value).toBe(false)
  })

  it('開始打字就收起，清空後仍聚焦會再浮現', async () => {
    const { focused, keyword, visible } = setup()
    focused.value = true
    await nextTick()

    keyword.value = '貓'
    await nextTick()
    expect(visible.value).toBe(false)

    keyword.value = ''
    await nextTick()
    expect(visible.value).toBe(true)
  })

  it('已有關鍵字時聚焦不浮現', async () => {
    const { focused, visible } = setup('貓')

    focused.value = true
    await nextTick()

    expect(visible.value).toBe(false)
  })

  it('停留滿時間自動收起', async () => {
    const { focused, visible } = setup()
    focused.value = true
    await nextTick()

    vi.advanceTimersByTime(DURATION - 1)
    expect(visible.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(visible.value).toBe(false)
  })

  it('自動收起後即使仍聚焦也不會再浮現', async () => {
    const { focused, visible } = setup()
    focused.value = true
    await nextTick()
    vi.advanceTimersByTime(DURATION)

    await nextTick()

    expect(visible.value).toBe(false)
  })

  it('自動收起後失焦再聚焦會重新浮現，並重新計時', async () => {
    const { focused, visible } = setup()
    focused.value = true
    await nextTick()
    vi.advanceTimersByTime(DURATION)

    focused.value = false
    await nextTick()
    focused.value = true
    await nextTick()
    expect(visible.value).toBe(true)

    vi.advanceTimersByTime(DURATION - 1)
    expect(visible.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(visible.value).toBe(false)
  })
})
