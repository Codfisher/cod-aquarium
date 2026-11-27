import type { AmbientAnchorKind, AmbientSpawn } from '../../realm/realm-definition'
import type { AmbientAnchorIndex } from './ambient-anchor'
import { isIndexedAnchorKind } from './ambient-anchor'

/**
 * 環境粒子的落腳點
 *
 * 粒子出生的位置不是整片隨機撒，而是先在鏡頭四周挑出十幾個「落腳點」（花上、燈邊、水面、地面…），
 * 新的粒子從這些點附近冒出來。這支只管挑點，不碰 Babylon，Node 端可以拿真的世界資料直接驗
 * 「這座場景的這一層到底找不找得到地方生」
 */

export const MAX_SPOT_COUNT = 16
/** 挑落腳點時，隨機試幾次，試不到就算這一帶沒有 */
const SPOT_ATTEMPT_COUNT = 28

/** 沒給 reach 時的預設：撒在空中的半徑、其他錨點的搜尋半徑 */
export const DEFAULT_AIR_REACH = 11
export const DEFAULT_ANCHOR_REACH = 18

/** 地面與水面的落腳點離鏡頭的高度差上限，免得挑到遠遠的山腳或谷底 */
const SURFACE_BAND = 7
const WATER_BAND = 10
/** 樹冠（洞頂）要在頭上這個範圍內才算 */
const CANOPY_MIN_HEIGHT = 1.5
const CANOPY_MAX_HEIGHT = 22
/** 索引出來的錨點（花、燈…）離鏡頭的高度差上限 */
const INDEX_VERTICAL_REACH = 12

/** 環境粒子問世界的三個問題 */
export interface AmbientWorld {
  anchorIndex: AmbientAnchorIndex;
  /** 某格柱最上面的表面高度（世界座標，水面與樹冠也算），整根都是空的回傳 NaN */
  readSurfaceY: (blockX: number, blockZ: number) => number;
  /** 某格柱的水面高度，沒有水回傳負數 */
  readWaterY: (blockX: number, blockZ: number) => number;
}

export interface SpotCamera {
  x: number;
  y: number;
  z: number;
}

/** 這一層的搜尋半徑 */
export function getAmbientReach(spawn: AmbientSpawn): number {
  return spawn.reach ?? (spawn.anchor === 'air' ? DEFAULT_AIR_REACH : DEFAULT_ANCHOR_REACH)
}

/** 在鏡頭四周隨機試點，條件合格才收進落腳點 */
function collectSurfaceSpot(
  anchor: 'ground' | 'water' | 'canopy',
  world: AmbientWorld,
  camera: SpotCamera,
  reach: number,
  out: Float32Array,
): number {
  let found = 0

  for (let attempt = 0; attempt < SPOT_ATTEMPT_COUNT && found < MAX_SPOT_COUNT; attempt++) {
    const angle = Math.random() * Math.PI * 2
    const distance = Math.sqrt(Math.random()) * reach
    const x = camera.x + Math.cos(angle) * distance
    const z = camera.z + Math.sin(angle) * distance
    const blockX = Math.floor(x + 0.5)
    const blockZ = Math.floor(z + 0.5)
    const waterY = world.readWaterY(blockX, blockZ)
    let y: number

    if (anchor === 'water') {
      if (waterY < 0 || Math.abs(waterY - camera.y) > WATER_BAND)
        continue
      y = waterY
    }
    else {
      const surfaceY = world.readSurfaceY(blockX, blockZ)
      if (Number.isNaN(surfaceY))
        continue

      if (anchor === 'ground') {
        /** 水面不算地面；離得太高或太低的（屋頂、遠處的谷底）也不要 */
        if (waterY >= 0 || Math.abs(surfaceY - camera.y) > SURFACE_BAND)
          continue
      }
      else {
        const above = surfaceY - camera.y
        if (above < CANOPY_MIN_HEIGHT || above > CANOPY_MAX_HEIGHT)
          continue
      }
      y = surfaceY
    }

    out[found * 3] = x
    out[found * 3 + 1] = y
    out[found * 3 + 2] = z
    found++
  }

  return found
}

function collectAnchorSpot(
  anchor: AmbientAnchorKind,
  world: AmbientWorld,
  camera: SpotCamera,
  reach: number,
  out: Float32Array,
): number {
  if (anchor === 'air')
    return 0

  if (isIndexedAnchorKind(anchor))
    return world.anchorIndex.sampleNear(anchor, camera.x, camera.y, camera.z, reach, INDEX_VERTICAL_REACH, out, MAX_SPOT_COUNT)

  return collectSurfaceSpot(anchor, world, camera, reach, out)
}

/**
 * 挑出這一層此刻的落腳點，寫進 out（三個一組），回傳個數
 *
 * 主要的錨點一個都找不到就改用備案（湖邊沒有蘆葦就貼著水面）。
 * 空中（air）不需要落腳點，永遠回傳零，由出生函式直接撒在鏡頭四周
 */
export function collectAmbientSpot(
  spawn: AmbientSpawn,
  world: AmbientWorld,
  camera: SpotCamera,
  out: Float32Array,
): number {
  const reach = getAmbientReach(spawn)
  const count = collectAnchorSpot(spawn.anchor, world, camera, reach, out)
  if (count === 0 && spawn.fallback)
    return collectAnchorSpot(spawn.fallback, world, camera, reach, out)

  return count
}
