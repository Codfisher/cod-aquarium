import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId, isWaterBlock } from '../../block/block-constants'
import { placeSmallBoat } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import {
  createDetailContext,
  findDetailGround,
  placeDetail,
  placeSignpost,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import {
  CAVE_BOAT_POINT,
  CAVE_CAMP_POINT,
  CAVE_FLOOR_Y,
  CAVE_GROUND_Y,
  CAVE_LAKE_ROCK_POINT,
  GROTTO_CENTER,
  GROTTO_RADIUS_X,
  HALL_CENTER,
  HALL_RADIUS_X,
  HALL_RADIUS_Z,
  measureHallDistance,
  UNDERGROUND_LAKE_CENTER,
  UNDERGROUND_LAKE_RADIUS,
} from './cave-layout'
import { CAVE_REALM } from './cave-realm'

/**
 * 地底洞窟的細節
 *
 * 只有地形 worker 用。岩響窟是水滴、礦脈與幾盞燈，細節補的是「水滴了很久」與「有人下來挖過」：
 * 鐘乳石垂下來的尖、洞頂低處零星的小鐘乳石、湖邊潮濕處的苔與褐菇、地上成堆的碎石；
 * 湖裡幾顆出水的岩、岸邊浮著的一艘舊舟；大廳東北燈籠下的礦工舊營地，礦脈底下躺著的鎬。
 *
 * 整座洞只畫貼著空氣的那一層岩，看得到的方塊才一萬五千格，所以這一層很省：
 * 幾乎全是交叉立板與貼地的平板，整格的方塊只有營地與湖裡那十幾顆。不加任何會亮的東西
 */

/**
 * 找地面時從這一層往下找
 *
 * 洞底最多隆起兩格；從隆起的最高處再上一格往下找，找到的才是地面而不是洞頂。
 * 洞頂壓到這一層的地方（矮通道的邊）會被當成「頂上有東西」而跳過，正好
 */
const DETAIL_SCAN_TOP_Y = CAVE_FLOOR_Y + 3

const FLOOR_SET: ReadonlySet<BlockId> = new Set([BlockId.STONE, BlockId.GRAVEL, BlockId.COBBLESTONE, BlockId.MOSSY_COBBLESTONE])
const ORE_SET: ReadonlySet<BlockId> = new Set([BlockId.COAL_ORE, BlockId.IRON_ORE, BlockId.COPPER_ORE, BlockId.GOLD_ORE])
/** 鐘乳石垂下來的尖最低到哪：離地至少留三格，人走過去頭上是空的 */
const TIP_CLEARANCE = 3

const HALL_AREA = {
  minX: HALL_CENTER.x - HALL_RADIUS_X - 2,
  maxX: HALL_CENTER.x + HALL_RADIUS_X + 2,
  minZ: HALL_CENTER.z - HALL_RADIUS_Z - 2,
  maxZ: HALL_CENTER.z + HALL_RADIUS_Z + 2,
}

function measureLakeDistance(x: number, z: number): number {
  return Math.hypot(x - UNDERGROUND_LAKE_CENTER.x, z - UNDERGROUND_LAKE_CENTER.z)
}

/**
 * 礦工的舊營地
 *
 * 兩張鋪蓋（榻榻米薄墊）、一口木箱、一只木桶、一座工作檯，中間一圈小石圍著一截燒黑的木頭（不發光），
 * 鎬躺在鋪蓋旁。燈是原本就掛在那裡的那一盞，營地是衝著它紮的
 */
function buildCamp(context: DetailContext): void {
  const { x, z } = CAVE_CAMP_POINT
  if (placeDetail(context, x, z, BlockId.CHARRED_LOG_X, FLOOR_SET) !== null) {
    for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      placeDetail(context, x + offsetX, z + offsetZ, BlockId.SMALL_ROCK, FLOOR_SET)
    }
  }
  placeDetail(context, x - 3, z - 1, BlockId.TATAMI_MAT, FLOOR_SET)
  placeDetail(context, x - 3, z, BlockId.TATAMI_MAT, FLOOR_SET)
  placeDetail(context, x - 3, z + 1, BlockId.TOOL_PICKAXE, FLOOR_SET)
  placeDetail(context, x + 2, z - 2, BlockId.CRATE, FLOOR_SET)
  placeDetail(context, x + 3, z - 2, BlockId.BARREL, FLOOR_SET)
  placeDetail(context, x + 3, z - 1, BlockId.BASKET, FLOOR_SET)
  placeDetail(context, x - 1, z - 3, BlockId.WORKBENCH, FLOOR_SET)
  placeDetail(context, x + 2, z + 2, BlockId.TOOL_PICKAXE, FLOOR_SET)
}

/**
 * 湖邊的舊舟
 *
 * 潮汐磯那一艘（placeSmallBoat）：船底那一層水換成木板，船身浮在水面上一格。
 * 整艘要落在水裡才放，碰到岸就不放（岸線吃噪音）
 */
function buildBoat(context: DetailContext): void {
  const { state } = context
  const { x, z } = CAVE_BOAT_POINT
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      if (!isWaterBlock(getBlock(state, x + offsetX, CAVE_FLOOR_Y, z + offsetZ)) || getBlock(state, x + offsetX, CAVE_GROUND_Y, z + offsetZ) !== BlockId.AIR)
        return
    }
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      setBlock(state, x + offsetX, CAVE_FLOOR_Y, z + offsetZ, BlockId.DARK_PLANKS)
    }
  }
  placeSmallBoat(state, x, CAVE_GROUND_Y, z, false)
}

/** 一顆從湖底立上來的岩，只疊在水裡 */
function placeLakeRock(state: Uint8Array, x: number, z: number, topY: number, blockId: BlockId): void {
  if (!isWaterBlock(getBlock(state, x, CAVE_FLOOR_Y, z)))
    return
  for (let y = CAVE_FLOOR_Y - 3; y <= topY; y++) {
    const current = getBlock(state, x, y, z)
    if (isWaterBlock(current) || current === BlockId.AIR)
      setBlock(state, x, y, z, blockId)
  }
}

/** 湖心岩：一高兩低，最高那顆出水兩格、頂上長苔 */
function buildLakeRock(state: Uint8Array): void {
  const { x, z } = CAVE_LAKE_ROCK_POINT
  placeLakeRock(state, x, z, CAVE_FLOOR_Y + 2, BlockId.MOSSY_COBBLESTONE)
  if (getBlock(state, x, CAVE_FLOOR_Y + 2, z) === BlockId.MOSSY_COBBLESTONE)
    setBlock(state, x, CAVE_FLOOR_Y + 3, z, BlockId.MOSS_CARPET)
  placeLakeRock(state, x + 1, z, CAVE_FLOOR_Y + 1, BlockId.COBBLESTONE)
  placeLakeRock(state, x, z + 1, CAVE_FLOOR_Y + 1, BlockId.MOSSY_COBBLESTONE)
  placeLakeRock(state, x - 1, z + 1, CAVE_FLOOR_Y, BlockId.COBBLESTONE)
  placeLakeRock(state, x + 3, z - 2, CAVE_FLOOR_Y + 1, BlockId.COBBLESTONE)
}

/**
 * 鐘乳石的尖
 *
 * 兩種地方長：原本那些圓石鐘乳石的最底下接一截尖的（一根石柱才有收尾），
 * 以及洞頂不高的地方零星垂一兩格小的。都留著人頭上的三格淨空
 */
function hangStalactite(context: DetailContext): void {
  const { state, random } = context
  for (let x = HALL_AREA.minX; x <= HALL_AREA.maxX; x++) {
    for (let z = HALL_AREA.minZ; z <= HALL_AREA.maxZ; z++) {
      if (measureHallDistance(x, z) >= 0.97)
        continue

      /** 從地面往上找到洞頂（第一格實心），中途遇到水或地面上的東西就照樣往上 */
      let floorY = -1
      for (let y = DETAIL_SCAN_TOP_Y; y >= CAVE_FLOOR_Y - 3; y--) {
        const blockId = getBlock(state, x, y, z)
        if (blockId !== BlockId.AIR && !isWaterBlock(blockId) && blockId !== BlockId.LAKE_BED) {
          floorY = y
          break
        }
        if (isWaterBlock(blockId)) {
          floorY = y
          break
        }
      }
      if (floorY < 0)
        continue

      let ceilingY = -1
      for (let y = floorY + 1; y < floorY + 30; y++) {
        const blockId = getBlock(state, x, y, z)
        if (blockId !== BlockId.AIR) {
          ceilingY = y
          break
        }
      }
      if (ceilingY < 0 || ceilingY - floorY - 1 <= TIP_CLEARANCE)
        continue

      const ceilingBlock = getBlock(state, x, ceilingY, z)
      const isHangingColumn = ceilingBlock === BlockId.COBBLESTONE && getBlock(state, x, ceilingY + 1, z) === BlockId.COBBLESTONE
      const isRock = ceilingBlock === BlockId.STONE || ceilingBlock === BlockId.COBBLESTONE
      if (!isRock)
        continue
      if (isHangingColumn ? random() < 0.85 : random() < 0.035) {
        setBlock(state, x, ceilingY - 1, z, BlockId.STALACTITE)
      }
    }
  }
}

/** 礦脈底下的碎石與鎬：礦在牆腳的那幾處，地上一把鎬（全洞最多四把），其餘只有碎石 */
function dressOreVein(context: DetailContext): void {
  const { state, random } = context
  let pickaxeCount = 0
  for (let x = HALL_AREA.minX; x <= HALL_AREA.maxX; x++) {
    for (let z = HALL_AREA.minZ; z <= HALL_AREA.maxZ; z++) {
      for (let y = CAVE_FLOOR_Y + 1; y <= CAVE_FLOOR_Y + 4; y++) {
        if (!ORE_SET.has(getBlock(state, x, y, z)))
          continue
        for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ground = findDetailGround(context, x + offsetX, z + offsetZ)
          if (!ground || !FLOOR_SET.has(ground.blockId))
            continue
          if (pickaxeCount < 4 && random() < 0.3) {
            setBlock(state, x + offsetX, ground.y + 1, z + offsetZ, BlockId.TOOL_PICKAXE)
            pickaxeCount++
          }
          else if (random() < 0.6) {
            setBlock(state, x + offsetX, ground.y + 1, z + offsetZ, BlockId.PEBBLES)
          }
        }
      }
    }
  }
}

/** 石筍、礦與燈籠之後、門框之前 */
export function decorateCaveDetail(state: Uint8Array): void {
  const context = createDetailContext(state, CAVE_REALM, createSeededRandom('cave-detail'), DETAIL_SCAN_TOP_Y)

  buildCamp(context)
  buildBoat(context)
  buildLakeRock(state)
  hangStalactite(context)
  dressOreVein(context)

  /** 前室往通道的口立一根路標：往裡走就是大廳 */
  placeSignpost(context, GROTTO_CENTER.x - GROTTO_RADIUS_X + 3, GROTTO_CENTER.z + 3, 'z')

  /** 湖邊潮濕的那一圈：苔毯鋪在岩上，褐菇成叢 */
  scatterDetailCluster(context, {
    ...HALL_AREA,
    noiseOffset: 15,
    frequency: 0.18,
    threshold: -0.05,
    chance: 0.4,
    pick: (random) => random() < 0.8 ? BlockId.MOSS_CARPET : BlockId.BROWN_MUSHROOM,
    groundSet: FLOOR_SET,
    isAllowed: (x, z) => {
      const distance = measureLakeDistance(x, z)
      return distance > UNDERGROUND_LAKE_RADIUS - 2 && distance < UNDERGROUND_LAKE_RADIUS + 6
    },
  })

  /** 大廳地上成堆的碎石與小石：從洞頂掉下來的 */
  scatterDetailCluster(context, {
    ...HALL_AREA,
    noiseOffset: 49,
    frequency: 0.19,
    threshold: 0.3,
    chance: 0.36,
    pick: (random) => random() < 0.78 ? BlockId.PEBBLES : BlockId.SMALL_ROCK,
    groundSet: FLOOR_SET,
    isAllowed: (x, z) => measureHallDistance(x, z) < 0.95,
  })

  /** 幾叢離湖遠的褐菇：洞裡暗的角落 */
  scatterDetailCluster(context, {
    ...HALL_AREA,
    noiseOffset: 83,
    frequency: 0.15,
    threshold: 0.42,
    chance: 0.4,
    pick: () => BlockId.BROWN_MUSHROOM,
    groundSet: FLOOR_SET,
    isAllowed: (x, z) => measureHallDistance(x, z) < 0.95,
  })

  /** 營地四周的碎石與掉在地上的枯枝（燒火剩的） */
  scatterDetailRing(context, CAVE_CAMP_POINT.x, CAVE_CAMP_POINT.z, 4, 0.3, (random) => random() < 0.6 ? BlockId.PEBBLES : BlockId.TWIGS, FLOOR_SET)
}
