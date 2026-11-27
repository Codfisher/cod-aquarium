import type { PasturePaddock } from './pasture-layout'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { fillBox, plantWithStack } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { fillHeightStep } from '../realm-terrain-kit'
import {
  measurePastureHeight,
  measureValleyRadius,
  PASTURE_GROUND_Y,
  PASTURE_OUTER_RADIUS,
  PASTURE_PORTAL_POINT,
  PASTURE_REALM_CENTER,
  PASTURE_SLOW_RADIUS,
  SHEEP_PADDOCK,
  SIDE_PADDOCK_LIST,
} from './pasture-layout'
import { PASTURE_REALM } from './pasture-realm'

/**
 * 羊鳴谷的地形
 *
 * 只有地形 worker 用。整片照牧野（buildPastureGarden）放大：草地、一圈一圈的柵欄（每圈留一道門）、
 * 角落的乾草堆、木板圍的飲水槽，草被羊啃得稀稀的，只剩高草與蒲公英。
 * 牧野只有一圈柵欄；這裡谷底一大圈放羊，東西兩頭坡腳各一小圈，
 * 兩側的坡上幾道長柵欄順著坡往上爬，把山坡隔成一塊一塊的草場。
 *
 * 順序：地面 → 柵欄 → 乾草與水槽 → 花草 → 傳送門（門洞前後與木牌前面的花草由它清掉）
 */

/** 牧野撒草的機率；放羊那一圈裡被啃得更稀 */
const PLANT_CHANCE = 0.3
const GRAZED_PLANT_CHANCE = 0.18

/** 牧野的草：七成高草、三成蒲公英 */
const TALL_GRASS_SHARE = 0.7

/**
 * 坡上的長柵欄（起訖兩點，世界座標）
 *
 * 從谷底那幾圈柵欄的角往坡上拉，把兩側的山坡隔成一塊一塊；
 * 每隔一段留一個兩格的缺口，人走得過去，不必繞
 */
const SLOPE_FENCE_LIST = [
  { fromX: SHEEP_PADDOCK.centerX - 14, fromZ: SHEEP_PADDOCK.centerZ + 15, toX: SHEEP_PADDOCK.centerX - 14, toZ: SHEEP_PADDOCK.centerZ + 62 },
  { fromX: SHEEP_PADDOCK.centerX + 14, fromZ: SHEEP_PADDOCK.centerZ + 15, toX: SHEEP_PADDOCK.centerX + 14, toZ: SHEEP_PADDOCK.centerZ + 62 },
  { fromX: SHEEP_PADDOCK.centerX - 15, fromZ: SHEEP_PADDOCK.centerZ + 40, toX: SHEEP_PADDOCK.centerX - 64, toZ: SHEEP_PADDOCK.centerZ + 40 },
  { fromX: PASTURE_REALM_CENTER.x + 24, fromZ: PASTURE_REALM_CENTER.z - 12, toX: PASTURE_REALM_CENTER.x + 24, toZ: PASTURE_REALM_CENTER.z - 66 },
  { fromX: PASTURE_REALM_CENTER.x - 22, fromZ: PASTURE_REALM_CENTER.z - 12, toX: PASTURE_REALM_CENTER.x - 22, toZ: PASTURE_REALM_CENTER.z - 66 },
  { fromX: PASTURE_REALM_CENTER.x + 25, fromZ: PASTURE_REALM_CENTER.z - 36, toX: PASTURE_REALM_CENTER.x + 72, toZ: PASTURE_REALM_CENTER.z - 36 },
] as const

/** 長柵欄每隔幾格留一個缺口、缺口幾格寬 */
const SLOPE_FENCE_GAP_SPACING = 18
const SLOPE_FENCE_GAP_WIDTH = 2

/** 地面，回傳每一格的地表高度 */
function shapeTerrain(state: Uint8Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  /** 先算整張高度圖，填成相鄰兩格最多差一格，人才走得上每一道坡 */
  const heightMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      heightMap[x * WORLD_SIZE + z] = measurePastureHeight(x, z)
    }
  }
  fillHeightStep(heightMap)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      /** 山頂後面：碰撞照算、不畫，由布景的地面平面代替 */
      if (measureValleyRadius(x, z) >= PASTURE_OUTER_RADIUS) {
        for (let y = 1; y < PASTURE_GROUND_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, PASTURE_GROUND_Y, z, BlockId.LAKE_BED)
        groundTopMap[x * WORLD_SIZE + z] = PASTURE_GROUND_Y
        continue
      }

      const topY = PASTURE_GROUND_Y + heightMap[x * WORLD_SIZE + z]!
      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, BlockId.GRASS)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }

  return groundTopMap
}

/** 在這一格的地面上立一根柵欄，已經有東西就讓開 */
function placeFencePost(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number): void {
  const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
  if (getBlock(state, x, groundY, z) === BlockId.AIR) {
    setBlock(state, x, groundY, z, BlockId.FENCE)
  }
}

/** 一圈柵欄，opening 那一邊的正中留一道門 */
function placePaddockFence(state: Uint8Array, groundTopMap: Uint8Array, paddock: PasturePaddock): void {
  const { centerX, centerZ, halfSizeX, halfSizeZ, opening } = paddock
  const minX = centerX - halfSizeX
  const maxX = centerX + halfSizeX
  const minZ = centerZ - halfSizeZ
  const maxZ = centerZ + halfSizeZ

  for (let x = minX; x <= maxX; x++) {
    const isGate = Math.abs(x - centerX) <= opening.halfWidth
    if (!(isGate && opening.side === 'north'))
      placeFencePost(state, groundTopMap, x, minZ)
    if (!(isGate && opening.side === 'south'))
      placeFencePost(state, groundTopMap, x, maxZ)
  }
  for (let z = minZ + 1; z < maxZ; z++) {
    const isGate = Math.abs(z - centerZ) <= opening.halfWidth
    if (!(isGate && opening.side === 'west'))
      placeFencePost(state, groundTopMap, minX, z)
    if (!(isGate && opening.side === 'east'))
      placeFencePost(state, groundTopMap, maxX, z)
  }
}

/** 坡上的長柵欄：沿直線一格一格立，每隔一段留缺口，過了外圍就停 */
function placeSlopeFenceList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const fence of SLOPE_FENCE_LIST) {
    const length = Math.max(Math.abs(fence.toX - fence.fromX), Math.abs(fence.toZ - fence.fromZ))
    for (let step = 0; step <= length; step++) {
      const x = Math.round(fence.fromX + ((fence.toX - fence.fromX) * step) / length)
      const z = Math.round(fence.fromZ + ((fence.toZ - fence.fromZ) * step) / length)
      if (measureValleyRadius(x, z) > PASTURE_OUTER_RADIUS - 8)
        break
      if (step % SLOPE_FENCE_GAP_SPACING >= SLOPE_FENCE_GAP_SPACING - SLOPE_FENCE_GAP_WIDTH)
        continue
      placeFencePost(state, groundTopMap, x, z)
    }
  }
}

/**
 * 乾草堆
 *
 * 牧野的擺法：靠柵欄的角落兩捆並排、其中一捆上面再疊一捆。
 * corner 是柵欄裡面那一格的角落（往內一格），along 是兩捆並排的方向
 */
function placeHayStack(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number, alongX: number, alongZ: number): void {
  for (const [index, cell] of [{ x, z }, { x: x + alongX, z: z + alongZ }].entries()) {
    const groundY = groundTopMap[cell.x * WORLD_SIZE + cell.z]! + 1
    if (getBlock(state, cell.x, groundY, cell.z) !== BlockId.AIR)
      continue
    setBlock(state, cell.x, groundY, cell.z, BlockId.HAY)
    if (index === 0) {
      setBlock(state, cell.x, groundY + 1, cell.z, BlockId.HAY)
    }
  }
}

/**
 * 飲水槽
 *
 * 牧野是一座三格見方的木板槽。這裡照它的尺寸，槽邊一圈木板、正中一格水，
 * 水面比槽邊低半格多，從旁邊看得到裡面有水。整座要落在平地上
 */
function placeTrough(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number): void {
  const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      if (groundTopMap[(x + offsetX) * WORLD_SIZE + z + offsetZ]! + 1 !== groundY)
        return
    }
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, x + offsetX, groundY, z + offsetZ, BlockId.PLANKS)
    }
  }
  setBlock(state, x, groundY - 1, z, BlockId.PLANKS)
  setBlock(state, x, groundY, z, BlockId.WATER)
}

/**
 * 柵欄裡的乾草與水槽
 *
 * 放羊那一圈：乾草堆與水槽都貼著柵欄裡面（羊走動的範圍比柵欄縮四格，不會爬上去），
 * 西北角一堆乾草、東南角一座水槽，與牧野同一個對角；東北角再一堆。
 * 兩頭的小草場各一堆乾草、一座水槽
 */
function placeFarmPropList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { centerX, centerZ, halfSizeX, halfSizeZ } = SHEEP_PADDOCK
  placeHayStack(state, groundTopMap, centerX - halfSizeX + 1, centerZ - halfSizeZ + 3, 0, 1)
  placeHayStack(state, groundTopMap, centerX + halfSizeX - 1, centerZ - halfSizeZ + 4, 0, 1)
  placeTrough(state, groundTopMap, centerX + halfSizeX - 2, centerZ + halfSizeZ - 2)

  for (const paddock of SIDE_PADDOCK_LIST) {
    const minX = paddock.centerX - paddock.halfSizeX
    const minZ = paddock.centerZ - paddock.halfSizeZ
    placeHayStack(state, groundTopMap, minX + 2, minZ + 2, 1, 0)
    placeTrough(state, groundTopMap, paddock.centerX + paddock.halfSizeX - 3, paddock.centerZ + paddock.halfSizeZ - 3)
  }

  /** 坡上零星幾堆，像是從谷底扛上去餵的 */
  const random = createSeededRandom('pasture-hay')
  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 30 + random() * (PASTURE_SLOW_RADIUS - 24)
    const x = Math.round(PASTURE_REALM_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(PASTURE_REALM_CENTER.z + Math.sin(angle) * radius)
    const isAlongX = random() < 0.5
    if (Math.hypot(x - PASTURE_PORTAL_POINT.x, z - PASTURE_PORTAL_POINT.z) < 10)
      continue
    const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
    const nextX = x + (isAlongX ? 1 : 0)
    const nextZ = z + (isAlongX ? 0 : 1)
    if (groundTopMap[nextX * WORLD_SIZE + nextZ]! + 1 !== groundY)
      continue
    placeHayStack(state, groundTopMap, x, z, nextX - x, nextZ - z)
  }
}

/** 這一格是不是在放羊那一圈裡 */
function isInSheepPaddock(x: number, z: number): boolean {
  return Math.abs(x - SHEEP_PADDOCK.centerX) < SHEEP_PADDOCK.halfSizeX
    && Math.abs(z - SHEEP_PADDOCK.centerZ) < SHEEP_PADDOCK.halfSizeZ
}

/** 被啃過的草：牧野的比例，放羊那一圈裡更稀 */
function scatterGrassList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('pasture-plant')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const roll = random()
      const isTallGrass = random() < TALL_GRASS_SHARE
      if (roll > (isInSheepPaddock(x, z) ? GRAZED_PLANT_CHANCE : PLANT_CHANCE))
        continue
      if (measureValleyRadius(x, z) >= PASTURE_OUTER_RADIUS)
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      plantWithStack(state, x, groundY, z, isTallGrass ? BlockId.TALL_GRASS : BlockId.FLOWER_DANDELION, random)
    }
  }
}

/** 生成整座羊鳴谷 */
export function generatePastureWorld(state: Uint8Array): void {
  const groundTopMap = shapeTerrain(state)
  for (const paddock of [SHEEP_PADDOCK, ...SIDE_PADDOCK_LIST]) {
    placePaddockFence(state, groundTopMap, paddock)
  }
  placeSlopeFenceList(state, groundTopMap)
  placeFarmPropList(state, groundTopMap)
  scatterGrassList(state, groundTopMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of PASTURE_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
