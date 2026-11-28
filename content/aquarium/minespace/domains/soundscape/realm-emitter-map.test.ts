import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REALM_EMITTER_MAP } from './realm-emitter-map'

/**
 * 各大場景的音源資料：只查「寫錯了也不會報錯、要走到那裡站著聽才發現」的那幾種錯
 *
 * 音檔名稱是字串，打錯字只會在主控台多一行載入失敗；id 重複的話後面那顆永遠不會載入；
 * 滿音量半徑大於可聽距離會讓衰減的分母出問題。這些都能在資料上直接查
 */

const SOUND_DIRECTORY = resolve(process.cwd(), 'content/public/minespace/sounds')
const realmEntryList = Object.entries(REALM_EMITTER_MAP)

describe('大場景的音源資料', () => {
  it('每一顆音源引用的音檔都在 public 資料夾裡', () => {
    const missingList = realmEntryList.flatMap(([realmId, definitionList]) =>
      (definitionList ?? [])
        .filter((definition) => !existsSync(resolve(SOUND_DIRECTORY, `${definition.sound}.mp3`)))
        .map((definition) => `${realmId}: ${definition.id} → ${definition.sound}`),
    )

    expect(missingList).toEqual([])
  })

  it('同一座場景裡 id 不重複', () => {
    for (const [realmId, definitionList] of realmEntryList) {
      const idList = (definitionList ?? []).map((definition) => definition.id)
      const duplicateList = idList.filter((id, index) => idList.indexOf(id) !== index)

      expect(duplicateList, realmId).toEqual([])
    }
  })

  it('音量、距離與間隔都在合理的範圍', () => {
    for (const [realmId, definitionList] of realmEntryList) {
      for (const definition of definitionList ?? []) {
        const label = `${realmId}: ${definition.id}`

        expect(definition.volume, label).toBeGreaterThan(0)
        expect(definition.volume, label).toBeLessThanOrEqual(1)
        expect(definition.maxDistance, label).toBeGreaterThan(definition.minDistance)

        if (definition.mode.type === 'interval') {
          const [min, max] = definition.mode.rangeSecond
          expect(min, label).toBeGreaterThan(0)
          expect(max, label).toBeGreaterThanOrEqual(min)
        }
      }
    }
  })

  it('音高的變化不會大到變成另一種東西：固定偏移一個八度以內、隨機範圍三個半音以內', () => {
    for (const [realmId, definitionList] of realmEntryList) {
      for (const definition of definitionList ?? []) {
        const label = `${realmId}: ${definition.id}`
        const { variation } = definition
        if (!variation)
          continue

        expect(Math.abs(variation.pitchOffsetCent ?? 0), label).toBeLessThanOrEqual(1200)
        expect(variation.pitchRangeCent ?? 0, label).toBeGreaterThanOrEqual(0)
        expect(variation.pitchRangeCent ?? 0, label).toBeLessThanOrEqual(300)
        expect(variation.volumeDropRatio ?? 0, label).toBeGreaterThanOrEqual(0)
        expect(variation.volumeDropRatio ?? 0, label).toBeLessThanOrEqual(0.6)
      }
    }
  })

  it('鳥的固定音高偏移壓在一個半音多一點以內（再多就變卡通）', () => {
    for (const [realmId, definitionList] of realmEntryList) {
      for (const definition of definitionList ?? []) {
        if (!definition.sound.startsWith('bird-'))
          continue

        expect(Math.abs(definition.variation?.pitchOffsetCent ?? 0), `${realmId}: ${definition.id}`).toBeLessThanOrEqual(120)
      }
    }
  })

  it('跟著雨雪強弱走的音源，範圍與底都說得通', () => {
    for (const [realmId, definitionList] of realmEntryList) {
      for (const definition of definitionList ?? []) {
        const { weatherGain } = definition
        if (!weatherGain)
          continue

        const label = `${realmId}: ${definition.id}`
        expect(weatherGain.levelRange[1], label).toBeGreaterThan(weatherGain.levelRange[0])
        expect(weatherGain.floor, label).toBeGreaterThanOrEqual(0)
        expect(weatherGain.floor, label).toBeLessThan(1)
      }
    }
  })

  it('只在晨昏那一小段響的音源都標成補底的，不會被神遊拿去當停留點', () => {
    for (const [realmId, definitionList] of realmEntryList) {
      for (const definition of definitionList ?? []) {
        if (definition.activeAt === 'dawn' || definition.activeAt === 'dusk' || definition.activeAt === 'twilight') {
          expect(definition.isFiller, `${realmId}: ${definition.id}`).toBe(true)
        }
      }
    }
  })
})
