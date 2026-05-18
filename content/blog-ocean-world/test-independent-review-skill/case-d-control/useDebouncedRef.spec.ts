import { effect } from '@vue/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedRef } from './useDebouncedRef'

describe('useDebouncedRef', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('初始值立即可讀', () => {
    const value = useDebouncedRef('init', 300)
    expect(value.value).toBe('init')
  })

  it('賦值後延遲指定毫秒才更新', () => {
    const value = useDebouncedRef('init', 300)
    value.value = 'next'
    expect(value.value).toBe('init')
    vi.advanceTimersByTime(299)
    expect(value.value).toBe('init')
    vi.advanceTimersByTime(1)
    expect(value.value).toBe('next')
  })

  it('連續賦值只保留最後一次', () => {
    const value = useDebouncedRef('init', 300)
    value.value = 'a'
    vi.advanceTimersByTime(100)
    value.value = 'b'
    vi.advanceTimersByTime(100)
    value.value = 'c'
    vi.advanceTimersByTime(300)
    expect(value.value).toBe('c')
  })

  it('觸發依賴 effect 重跑', () => {
    const value = useDebouncedRef(0, 100)
    const spy = vi.fn(() => value.value)
    effect(spy)
    expect(spy).toHaveBeenCalledTimes(1)

    value.value = 1
    vi.advanceTimersByTime(100)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('delayMs 預設 300', () => {
    const value = useDebouncedRef('init')
    value.value = 'next'
    vi.advanceTimersByTime(299)
    expect(value.value).toBe('init')
    vi.advanceTimersByTime(1)
    expect(value.value).toBe('next')
  })
})
