import { ref, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { usePagedList } from './usePagedList'

describe('usePagedList', () => {
  it('回傳第一頁資料', () => {
    const source = ref([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const { items } = usePagedList({ source, pageSize: 3 })
    expect(items.value).toEqual([1, 2, 3])
  })

  it('next 切換到下一頁', async () => {
    const source = ref([1, 2, 3, 4, 5, 6])
    const { items, next } = usePagedList({ source, pageSize: 3 })
    next()
    await nextTick()
    expect(items.value).toEqual([4, 5, 6])
  })

  it('pageCount 反應資料筆數', () => {
    const source = ref([1, 2, 3, 4, 5])
    const { pageCount } = usePagedList({ source, pageSize: 2 })
    expect(pageCount.value).toBe(3)
  })
})
