import { lightFragment } from '@babylonjs/core/Shaders/ShadersInclude/lightFragment'
import { shadowsFragmentFunctions } from '@babylonjs/core/Shaders/ShadersInclude/shadowsFragmentFunctions'
import { describe, expect, it } from 'vitest'
import {
  CASCADED_COMPARE_TAP_PATTERN,
  CASCADED_PCF_TAP_PATTERN,
  CASCADED_PENUMBRA_DARKNESS_PATTERN,
  CASCADED_PENUMBRA_PATTERN,
  CASCADED_RANGE_CHECK_PATTERN,
  CASCADED_SEARCH_TAP_PATTERN,
} from './sun-shadow'

/**
 * 太陽陰影的捷徑靠正規式改寫 Babylon 的著色器原文
 *
 * 比不到的時候外掛安靜地不做事，畫面不會壞，只是那幾毫秒又回來了，肉眼看不出來。
 * 這裡直接拿套件裡的著色器原文比對：升級 Babylon 之後原文改了寫法，測試會先壞。
 *
 * 外掛實際比對的是「已經拆成一句一行」的文字，所以每個字串都只能落在同一句裡；
 * 原文是壓成一行的，這裡另外確認比對到的那一段中間沒有跨過分號
 */
describe('太陽陰影捷徑的比對字串', () => {
  const functionSource = shadowsFragmentFunctions.shader
  const lightSource = lightFragment.shader

  function matchList(source: string, pattern: string): string[] {
    return [...source.matchAll(new RegExp(pattern, 'g'))].map((match) => match[0])
  }

  /** 接觸硬化（分層版）這個函式在原文裡的範圍 */
  const cascadedStart = functionSource.indexOf('float computeShadowWithCSMPCSS(')
  const cascadedEnd = functionSource.indexOf('float computeShadowWithPCSS(')

  it('找得到分層版接觸硬化的函式', () => {
    expect(cascadedStart).toBeGreaterThan(-1)
    expect(cascadedEnd).toBeGreaterThan(cascadedStart)
  })

  it.each([
    ['算半影多寬', CASCADED_PENUMBRA_PATTERN],
    ['把半影調淡', CASCADED_PENUMBRA_DARKNESS_PATTERN],
    ['比較迴圈的取樣', CASCADED_COMPARE_TAP_PATTERN],
    ['遮蔽搜尋的取樣', CASCADED_SEARCH_TAP_PATTERN],
  ])('「%s」那一句只出現在分層版的接觸硬化，剛好一次', (_label, pattern) => {
    const list = matchList(functionSource, pattern)
    expect(list).toHaveLength(1)

    const index = functionSource.search(new RegExp(pattern))
    expect(index).toBeGreaterThan(cascadedStart)
    expect(index).toBeLessThan(cascadedEnd)

    /** 只有結尾那一個分號，中間沒有跨句 */
    expect(list[0]!.indexOf(';')).toBe(list[0]!.length - 1)
  })

  it('分支開在比較取樣之前、收在比較取樣之後', () => {
    const openIndex = functionSource.search(new RegExp(CASCADED_PENUMBRA_PATTERN))
    const tapIndex = functionSource.search(new RegExp(CASCADED_COMPARE_TAP_PATTERN))
    const closeIndex = functionSource.search(new RegExp(CASCADED_PENUMBRA_DARKNESS_PATTERN))
    const searchIndex = functionSource.search(new RegExp(CASCADED_SEARCH_TAP_PATTERN))

    expect(searchIndex).toBeLessThan(openIndex)
    expect(openIndex).toBeLessThan(tapIndex)
    expect(tapIndex).toBeLessThan(closeIndex)
  })

  it('分層版 PCF 的比較取樣：三乘三有四次、五乘五有九次', () => {
    const list = matchList(functionSource, CASCADED_PCF_TAP_PATTERN)
    expect(list).toHaveLength(13)
    for (const text of list) {
      expect(text.indexOf(';')).toBe(text.length - 1)
    }
  })

  it('lightFragment 裡「落在分層陰影範圍內」的判斷比對得到，而且帶得出光源編號', () => {
    /** 原文的光源編號是 {X}，Babylon 展開時換成數字 */
    const expanded = lightSource.replaceAll('{X}', '3')
    const list = [...expanded.matchAll(new RegExp(CASCADED_RANGE_CHECK_PATTERN, 'g'))]
    expect(list).toHaveLength(1)
    expect(list[0]![1]).toBe('index3')
    expect(list[0]![2]).toBe('3')
  })
})
