import { describe, expect, it } from 'vitest'
import { BlockId, isPassableBlock } from '../block/block-constants'
import { generateRealmTerrain } from '../realm/realm-terrain'
import {
  AREA_LIGHT_LIMIT,
  collectLightSourceList,
  collectPointLightList,
  POINT_LIGHT_RANGE,
} from './light-source'
import { WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/**
 * 真光的清單：燈籠照舊一格一盞，熔岩併成少數幾盞面光源
 *
 * 純資料的函式，不需要瀏覽器。看的是三件事：
 * 一、再大的熔岩湖也不超過上限；二、光源一定落在空的格子裡（不會埋進岩石）；
 * 三、燈籠那一半與原本一模一樣
 */

function createWorld(): Uint8Array {
  return new Uint8Array(WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT)
}

function setBlock(worldState: Uint8Array, x: number, y: number, z: number, blockId: BlockId): void {
  worldState[(x * WORLD_HEIGHT + y) * WORLD_SIZE + z] = blockId
}

function readBlock(worldState: Uint8Array, x: number, y: number, z: number): BlockId {
  return worldState[(x * WORLD_HEIGHT + y) * WORLD_SIZE + z]! as BlockId
}

/** 在 y 那一層鋪一片方形熔岩，底下墊石頭 */
function fillLavaLake(worldState: Uint8Array, startX: number, startZ: number, size: number, y: number): void {
  for (let x = startX; x < startX + size; x++) {
    for (let z = startZ; z < startZ + size; z++) {
      setBlock(worldState, x, y - 1, z, BlockId.STONE)
      setBlock(worldState, x, y, z, BlockId.LAVA)
    }
  }
}

function collectAreaLightList(worldState: Uint8Array, areaLightLimit?: number) {
  const sourceList = collectLightSourceList(worldState)
  return collectPointLightList(worldState, sourceList, { areaLightLimit })
    .filter((light) => light.isAreaLight)
}

describe('熔岩併成面光源', () => {
  it('一格的小池是一盞，亮度與照明半徑不低於下限', () => {
    const worldState = createWorld()
    fillLavaLake(worldState, 100, 100, 1, 10)

    const areaLightList = collectAreaLightList(worldState)
    expect(areaLightList).toHaveLength(1)
    expect(areaLightList[0]!.range).toBeGreaterThanOrEqual(POINT_LIGHT_RANGE)
    expect(areaLightList[0]!.intensityRatio).toBeGreaterThanOrEqual(0.7)
    /** 抬在液面上方 */
    expect(areaLightList[0]!.y).toBeGreaterThan(10.5)
  })

  it('八十格見方的熔岩湖不超過上限，原本的光源清單是幾百顆', () => {
    const worldState = createWorld()
    fillLavaLake(worldState, 60, 60, 80, 10)

    const sourceList = collectLightSourceList(worldState)
    expect(sourceList.filter((source) => source.isAreaLight).length).toBeGreaterThan(300)

    const areaLightList = collectAreaLightList(worldState)
    expect(areaLightList.length).toBeLessThanOrEqual(AREA_LIGHT_LIMIT)
    expect(areaLightList.length).toBeGreaterThan(4)

    /** 併得越大越亮、照得越遠，但都有上限 */
    for (const light of areaLightList) {
      expect(light.intensityRatio).toBeGreaterThan(1)
      expect(light.intensityRatio).toBeLessThanOrEqual(2.2)
      expect(light.range).toBeLessThanOrEqual(36)
      expect(light.y).toBeGreaterThan(11)
    }
  })

  it('上限可以由場景指定', () => {
    const worldState = createWorld()
    fillLavaLake(worldState, 60, 60, 80, 10)

    expect(collectAreaLightList(worldState, 4)).toHaveLength(4)
    expect(collectAreaLightList(worldState, 1)).toHaveLength(1)
  })

  it('環形的池：光源落在熔岩上方的空格，不會埋進中間那塊岩石', () => {
    const worldState = createWorld()
    fillLavaLake(worldState, 100, 100, 9, 10)
    /** 中間一根七格見方、十格高的岩柱，只留外圍一圈熔岩 */
    for (let x = 101; x < 108; x++) {
      for (let z = 101; z < 108; z++) {
        for (let y = 10; y < 20; y++) {
          setBlock(worldState, x, y, z, BlockId.STONE)
        }
      }
    }

    const areaLightList = collectAreaLightList(worldState)
    expect(areaLightList.length).toBeGreaterThanOrEqual(1)
    for (const light of areaLightList) {
      const blockId = readBlock(worldState, light.x, Math.floor(light.y + 0.5), light.z)
      expect(isPassableBlock(blockId)).toBe(true)
      expect(blockId).not.toBe(BlockId.LAVA)
    }
  })

  it('熔岩瀑布（只有側面露出）也算得到，沿著高度分段', () => {
    const worldState = createWorld()
    /** 貼著岩壁的一道兩格寬、三十格高的瀑布 */
    for (let y = 2; y < 32; y++) {
      for (let z = 100; z < 102; z++) {
        setBlock(worldState, 100, y, z, BlockId.STONE)
        setBlock(worldState, 101, y, z, BlockId.LAVA)
      }
    }

    const areaLightList = collectAreaLightList(worldState)
    expect(areaLightList.length).toBeGreaterThanOrEqual(2)
    expect(areaLightList.length).toBeLessThanOrEqual(5)
  })

  it('燈籠照舊一格一盞，位置、亮度、照明半徑與光源清單一致', () => {
    const worldState = createWorld()
    setBlock(worldState, 50, 10, 50, BlockId.LANTERN)
    setBlock(worldState, 80, 10, 50, BlockId.LANTERN)

    const sourceList = collectLightSourceList(worldState)
    const pointLightList = collectPointLightList(worldState, sourceList)
    expect(pointLightList).toHaveLength(2)
    for (const [index, light] of pointLightList.entries()) {
      const source = sourceList[index]!
      expect([light.x, light.y, light.z]).toEqual([source.x, source.y, source.z])
      expect(light.intensityRatio).toBe(source.level)
      expect(light.range).toBe(POINT_LIGHT_RANGE * source.level)
      expect(light.isAreaLight).toBe(false)
    }
  })

  it('大廳：地獄谷箱庭的熔岩從一格一盞併成個位數，其他燈一盞不少', () => {
    const worldState = createWorld()
    generateRealmTerrain('hub', worldState)

    const sourceList = collectLightSourceList(worldState)
    const pointLightList = collectPointLightList(worldState, sourceList)
    const lampSourceCount = sourceList.filter((source) => !source.isAreaLight).length
    const lavaSourceCount = sourceList.length - lampSourceCount
    const areaLightList = pointLightList.filter((light) => light.isAreaLight)

    expect(pointLightList.length - areaLightList.length).toBe(lampSourceCount)
    expect(lavaSourceCount).toBeGreaterThan(0)
    expect(areaLightList.length).toBeGreaterThan(0)
    expect(areaLightList.length).toBeLessThan(lavaSourceCount)
    expect(areaLightList.length).toBeLessThanOrEqual(AREA_LIGHT_LIMIT)
  })
})
