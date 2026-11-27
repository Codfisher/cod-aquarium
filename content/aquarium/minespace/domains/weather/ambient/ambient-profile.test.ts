import { describe, expect, it } from 'vitest'
import { AMBIENT_ANCHOR_KIND_LIST, AMBIENT_PARTICLE_KIND_LIST } from '../../realm/realm-definition'
import { REALM_LIST } from '../../realm/realm-list'
import { createAmbientPhaseWeight, measureAmbientActivity, measureAmbientPhaseWeight } from './ambient-activity'
import {
  AMBIENT_MAX_CONCURRENT_COUNT,
  AMBIENT_MAX_LAYER_COUNT,
  AMBIENT_MAX_LAYER_PARTICLE_COUNT,
  measureAmbientBudget,
} from './ambient-budget'
import { AMBIENT_KIND_SPEC_MAP } from './ambient-kind-spec'
import { getPixelShapeFrameListMap } from './ambient-shape'

/**
 * 環境粒子資料的靜態檢查
 *
 * 每座大場景的清單都是手寫的資料，這裡擋的是手滑：種類或錨點打錯、數字超出範圍、
 * 超過層數與同時顆數的預算。真世界裡找不找得到落腳點要生成地形才知道，不在這裡驗
 */

const realmWithAmbientList = REALM_LIST.filter((realm) => realm.id !== 'hub')

describe('環境粒子的種類表', () => {
  it('每一種都有預設，也沒有多餘的', () => {
    expect(Object.keys(AMBIENT_KIND_SPEC_MAP).sort()).toEqual([...AMBIENT_PARTICLE_KIND_LIST].sort())
  })

  it('貼圖圖樣的每一格同寬同高、只用認得的字元', () => {
    const shapeMap = getPixelShapeFrameListMap()
    for (const kind of AMBIENT_PARTICLE_KIND_LIST) {
      const spec = AMBIENT_KIND_SPEC_MAP[kind]
      if (spec.shape === 'soft') {
        expect(spec.flap, `${kind} 柔邊貼圖不能拍翅`).toBeUndefined()
        continue
      }

      const frameList = shapeMap[spec.shape]
      expect(frameList, `${kind} 的圖樣 ${spec.shape}`).toBeDefined()
      for (const frame of frameList!) {
        expect(frame.length).toBe(frameList![0]!.length)
        for (const row of frame) {
          expect(row.length).toBe(frameList![0]![0]!.length)
          expect(row).toMatch(/^[#o.]+$/)
        }
      }
      if (spec.flap)
        expect(frameList!.length, `${kind} 拍翅至少兩格`).toBeGreaterThanOrEqual(2)
    }
  })

  it('範圍都是由小到大，拉長的種類有拉長倍率，標準混合的顏色不超過一', () => {
    for (const kind of AMBIENT_PARTICLE_KIND_LIST) {
      const spec = AMBIENT_KIND_SPEC_MAP[kind]
      expect(spec.life[0], kind).toBeGreaterThan(0)
      expect(spec.life[0], kind).toBeLessThanOrEqual(spec.life[1])
      expect(spec.size[0], kind).toBeGreaterThan(0)
      expect(spec.size[0], kind).toBeLessThanOrEqual(spec.size[1])
      expect(spec.horizontalSpeed[0], kind).toBeLessThanOrEqual(spec.horizontalSpeed[1])
      expect(spec.verticalSpeed[0], kind).toBeLessThanOrEqual(spec.verticalSpeed[1])
      if (spec.billboard === 'stretched')
        expect(spec.stretch, kind).toBeDefined()
      if (spec.blend === 'standard')
        expect([...spec.colorA, ...spec.colorB].every((value) => value <= 1), kind).toBe(true)
    }
  })
})

describe('日夜權重', () => {
  it('四段加總恆為一', () => {
    const weight = createAmbientPhaseWeight()
    for (let dayRatio = 0; dayRatio <= 1; dayRatio += 0.05) {
      for (const timeOfDay of [0.2, 0.8]) {
        measureAmbientPhaseWeight(dayRatio, timeOfDay, weight)
        expect(weight.day + weight.night + weight.dawn + weight.dusk).toBeCloseTo(1, 6)
      }
    }
  })

  it('正午與子夜各取自己那一段，清晨傍晚沒寫就取平均', () => {
    const weight = createAmbientPhaseWeight()
    const activity = { day: 1, night: 0.2 }

    measureAmbientPhaseWeight(1, 0.5, weight)
    expect(measureAmbientActivity(activity, weight)).toBeCloseTo(1)
    measureAmbientPhaseWeight(0, 0, weight)
    expect(measureAmbientActivity(activity, weight)).toBeCloseTo(0.2)
    measureAmbientPhaseWeight(0.5, 0.25, weight)
    expect(measureAmbientActivity(activity, weight)).toBeCloseTo(0.6)
  })
})

describe('各場景的環境粒子清單', () => {
  it('十八座大場景都有清單，大廳沒有', () => {
    expect(realmWithAmbientList).toHaveLength(18)
    for (const realm of REALM_LIST)
      expect(!!realm.ambientParticleList?.length, realm.id).toBe(realm.id !== 'hub')
  })

  for (const realm of realmWithAmbientList) {
    describe(realm.id, () => {
      const list = realm.ambientParticleList ?? []

      it('層數與同時顆數在預算內', () => {
        const budget = measureAmbientBudget(list)
        expect(budget.layerCount).toBeLessThanOrEqual(AMBIENT_MAX_LAYER_COUNT)
        expect(budget.peakConcurrentCount).toBeLessThanOrEqual(AMBIENT_MAX_CONCURRENT_COUNT)
      })

      it('每一層的欄位都合法', () => {
        for (const layer of list) {
          const spec = AMBIENT_KIND_SPEC_MAP[layer.kind]
          expect(AMBIENT_PARTICLE_KIND_LIST).toContain(layer.kind)
          expect(AMBIENT_ANCHOR_KIND_LIST).toContain(layer.spawn.anchor)
          if (layer.spawn.fallback) {
            expect(AMBIENT_ANCHOR_KIND_LIST).toContain(layer.spawn.fallback)
            expect(layer.spawn.fallback, `${layer.kind} 的備案不能是 air`).not.toBe('air')
          }
          expect(layer.count).toBeGreaterThan(0)
          expect(layer.count).toBeLessThanOrEqual(AMBIENT_MAX_LAYER_PARTICLE_COUNT)
          for (const value of Object.values(layer.activity)) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(1)
          }
          expect(layer.spawn.height[0]).toBeLessThanOrEqual(layer.spawn.height[1])
          if (layer.size)
            expect(layer.size[0]).toBeLessThanOrEqual(layer.size[1])
          for (const color of [layer.color, layer.colorAlt]) {
            if (!color)
              continue
            expect(color.every((value) => value >= 0 && value <= 2)).toBe(true)
            if (spec.blend === 'standard')
              expect(color.every((value) => value <= 1), `${layer.kind} 標準混合的顏色超過一`).toBe(true)
          }
        }
      })

      it('夜裡才出場的層不用會被夜色壓暗的種類（灰塵、霧與風線除外）', () => {
        for (const layer of list) {
          if (layer.activity.night <= layer.activity.day)
            continue
          const spec = AMBIENT_KIND_SPEC_MAP[layer.kind]
          if (!spec.isDimmedAtNight)
            continue
          expect(['mist', 'litter', 'dust', 'windstreak'], `${realm.id} 的 ${layer.kind}`).toContain(layer.kind)
        }
      })
    })
  }
})
