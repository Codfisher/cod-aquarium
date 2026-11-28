import { describe, expect, it } from 'vitest'
import { TWILIGHT_STOP_HEIGHT } from '../twilight'
import {
  CLOUD_COMMON_GLSL,
  CLOUD_COMPOSITE_FRAGMENT,
  CLOUD_MARCH_FRAGMENT,
  CLOUD_REFLECTION_FRAGMENT,
  CLOUD_RESOLVE_FRAGMENT,
  CLOUD_SHADOW_FRAGMENT,
  CLOUD_UNIFORM_NAME_LIST,
} from './cloud-glsl'

/**
 * 著色器字串的靜態檢查
 *
 * 這裡編不了 GLSL，擋的是組字串時的手滑：樣板裡的數字沒換掉、括號不成對、
 * uniform 宣告了卻沒列進名單（那個 uniform 就永遠是零，而且不會報錯）
 */
const fragmentMap = {
  march: CLOUD_MARCH_FRAGMENT,
  resolve: CLOUD_RESOLVE_FRAGMENT,
  shadow: CLOUD_SHADOW_FRAGMENT,
  composite: CLOUD_COMPOSITE_FRAGMENT,
  reflection: CLOUD_REFLECTION_FRAGMENT,
}

describe('體積雲的著色器字串', () => {
  it('括號成對，樣板裡的數字都換好了', () => {
    for (const [name, source] of Object.entries(fragmentMap)) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(code.split('{').length, name).toBe(code.split('}').length)
      expect(code.split('(').length, name).toBe(code.split(')').length)
      expect(code, name).not.toContain('$')
      expect(code, name).not.toContain('undefined')
      expect(code, name).not.toContain('NaN')
    }
  })

  it('共用那一段宣告的 uniform 與名單一致', () => {
    const declaredList = [...CLOUD_COMMON_GLSL.matchAll(/uniform \w+ (\w+);/g)]
      .map((match) => match[1]!)
      .filter((name) => !name.endsWith('Sampler'))
    expect([...declaredList].sort()).toEqual([...CLOUD_UNIFORM_NAME_LIST].sort())
  })

  it('晨昏色階的高度與 CPU 那一側是同一組數字', () => {
    const readConstant = (name: string) => {
      const matched = CLOUD_COMMON_GLSL.match(new RegExp(`const float ${name} = (-?[0-9.]+);`))
      return matched ? Number(matched[1]) : Number.NaN
    }
    expect(readConstant('CLOUD_TWILIGHT_SHADOW')).toBe(TWILIGHT_STOP_HEIGHT.shadow)
    expect(readConstant('CLOUD_TWILIGHT_ROSE')).toBe(TWILIGHT_STOP_HEIGHT.rose)
    expect(readConstant('CLOUD_TWILIGHT_CRIMSON')).toBe(TWILIGHT_STOP_HEIGHT.crimson)
    expect(readConstant('CLOUD_TWILIGHT_ORANGE')).toBe(TWILIGHT_STOP_HEIGHT.orange)
    expect(readConstant('CLOUD_TWILIGHT_GOLD')).toBe(TWILIGHT_STOP_HEIGHT.gold)
  })

  it('浮點常數都帶小數點', () => {
    for (const matched of CLOUD_COMMON_GLSL.matchAll(/const float \w+ = ([^;]+);/g)) {
      expect(matched[1]).toMatch(/^-?\d+\.\d+$/)
    }
  })
})
