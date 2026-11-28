import { describe, expect, it } from 'vitest'
import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_VOLUME } from '../world/world-constants'
import { measureSoundClarity, OCCLUSION_FLOOR } from './sound-occlusion'

/**
 * 遮蔽：直線數方塊，加上「越過崖緣」的那條折線
 *
 * 地形是手排的一座崖：x 小於一百的那一半是十格高的台地，另一半是谷底。
 * 站在台地上往谷底聽，就是湯煙谷從台地聽熔岩湖的情形
 */

const TERRACE_TOP_Y = 12
const VALLEY_FLOOR_Y = 2

function createCliffWorld(): Uint8Array {
  const worldState = new Uint8Array(WORLD_VOLUME)
  for (let x = 60; x < 140; x++) {
    for (let z = 60; z < 140; z++) {
      const topY = x < 100 ? TERRACE_TOP_Y : VALLEY_FLOOR_Y
      for (let y = 0; y <= topY; y++) {
        worldState[coordinateToIndex(x, y, z)] = BlockId.STONE
      }
    }
  }
  return worldState
}

/** 站在台地上、離崖緣 back 格的人的耳朵 */
function createTerraceListener(back: number) {
  return { x: 99 - back, y: TERRACE_TOP_Y + 0.5 + 1.62, z: 100 }
}

/** 谷底、離崖腳 out 格的音源 */
function createValleyEmitter(out: number) {
  return { x: 100 + out, y: VALLEY_FLOOR_Y + 1.5, z: 100 }
}

describe('直線遮蔽', () => {
  const worldState = createCliffWorld()

  it('中間沒有東西就是全通', () => {
    expect(measureSoundClarity(worldState, { x: 110, y: 5, z: 100 }, { x: 130, y: 5, z: 100 })).toBe(1)
    expect(measureSoundClarity(worldState, { x: 110, y: 5, z: 100 }, { x: 110.4, y: 5, z: 100 })).toBe(1)
  })

  it('隔著整座台地壓到底噪', () => {
    const clarity = measureSoundClarity(worldState, { x: 70, y: 5, z: 100 }, { x: 110, y: 5, z: 100 })
    expect(clarity).toBeCloseTo(OCCLUSION_FLOOR)
  })

  it('站在崖頂離崖緣幾格，直線就已經鑽進崖身', () => {
    const clarity = measureSoundClarity(worldState, createTerraceListener(8), createValleyEmitter(6))
    expect(clarity).toBeLessThan(0.4)
  })
})

describe('越過崖緣', () => {
  const worldState = createCliffWorld()

  it('標了的音源從崖下傳得上來，但比直達的弱', () => {
    const listener = createTerraceListener(8)
    const emitter = createValleyEmitter(6)
    const direct = measureSoundClarity(worldState, listener, emitter)
    const carried = measureSoundClarity(worldState, listener, emitter, true)

    expect(carried).toBeGreaterThan(direct)
    expect(carried).toBeGreaterThan(0.5)
    expect(carried).toBeLessThan(0.6)
  })

  it('反過來也一樣：站在谷底聽崖頂的音源', () => {
    const listener = { x: 106, y: VALLEY_FLOOR_Y + 0.5 + 1.62, z: 100 }
    const emitter = { x: 91, y: TERRACE_TOP_Y + 1.5, z: 100 }
    expect(measureSoundClarity(worldState, listener, emitter, true))
      .toBeGreaterThan(measureSoundClarity(worldState, listener, emitter))
  })

  it('直線本來就通的時候不打折', () => {
    /** 站在崖緣探出去，直接看得到谷底 */
    const listener = { x: 100.4, y: TERRACE_TOP_Y + 0.5 + 1.62, z: 100 }
    expect(measureSoundClarity(worldState, listener, createValleyEmitter(6), true)).toBe(1)
  })

  it('頭頂有蓋的音源標了也漏不出來：折線的垂直那一段照樣數方塊', () => {
    /** 把音源埋進台地底下的一個小洞（上面壓著八格岩） */
    const cave = { x: 80, y: 3, z: 100 }
    for (let x = 78; x <= 82; x++) {
      for (let y = 2; y <= 4; y++) {
        worldState[coordinateToIndex(x, y, 100)] = BlockId.AIR
      }
    }
    const listener = { x: 86, y: TERRACE_TOP_Y + 0.5 + 1.62, z: 100 }
    expect(measureSoundClarity(worldState, listener, cave, true)).toBeLessThan(0.1)
  })

  it('高低差不大時不試折線（平地上直線就是最通的）', () => {
    const listener = { x: 70, y: TERRACE_TOP_Y + 2, z: 100 }
    const emitter = { x: 96, y: TERRACE_TOP_Y + 1.2, z: 100 }
    expect(measureSoundClarity(worldState, listener, emitter, true))
      .toBe(measureSoundClarity(worldState, listener, emitter))
  })
})
