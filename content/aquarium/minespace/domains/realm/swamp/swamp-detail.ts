import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock } from '../../block/block-constants'
import { placeSmallBoat } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import {
  createDetailContext,
  findDetailGround,
  placeDetail,
  placeFallenLog,
  placeRockCluster,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import { isNextToWater } from '../realm-terrain-kit'
import {
  MARSH_RADIUS,
  measureMarshDistance,
  SWAMP_BOAT_POINT,
  SWAMP_CENTER,
  SWAMP_HUT_POINT,
  SWAMP_WATER_Y,
} from './swamp-layout'
import { SWAMP_REALM } from './swamp-realm'

/**
 * 千蛙沼的細節
 *
 * 只有地形 worker 用。蛙聲澤是泥、淺水與枯木，細節補的是泥灘自己的層次與住在沼裡的人：
 * 泥灘中間長出一塊一塊的草、貼水的那一圈是濕黏土；水邊的香蒲、睡蓮叢裡的蓮；
 * 躺在泥上長了苔的倒木、枯木腳邊的菇；東北大泥灘上一座捕蛙人的草寮、南側平台外一艘小舟。
 *
 * 不加燈：沼澤夜裡的光只有三座平台的紙燈，草寮是暗的。
 * 分兩段：造景零件在撒泥灘花草之前擺，地被在花草與睡蓮之後補
 */

const DETAIL_SCAN_TOP_Y = SWAMP_WATER_Y + 3

const MUD_SET: ReadonlySet<BlockId> = new Set([BlockId.DIRT, BlockId.GRASS, BlockId.CLAY])

const DETAIL_AREA = {
  minX: SWAMP_CENTER.x - MARSH_RADIUS,
  maxX: SWAMP_CENTER.x + MARSH_RADIUS,
  minZ: SWAMP_CENTER.z - MARSH_RADIUS,
  maxZ: SWAMP_CENTER.z + MARSH_RADIUS,
}

/** 這一格的四周（含斜角）有沒有水：離水兩格以上才算泥灘的「裡面」 */
function isNearWater(state: Uint8Array, x: number, z: number): boolean {
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      if (getBlock(state, x + offsetX, SWAMP_WATER_Y, z + offsetZ) === BlockId.WATER)
        return true
    }
  }
  return false
}

/**
 * 草寮
 *
 * 三格見方：四角的木樁兩格高，頂上一片深色半磚（半磚的底正好壓在樁頭上）。
 * 底下北邊一只木桶、西邊一塊坐墊、東邊一只竹簍；寮外的泥上攤著兩張網
 */
function buildHut(context: DetailContext): void {
  const { state } = context
  const { x, z } = SWAMP_HUT_POINT
  const groundY = SWAMP_WATER_Y

  for (const [offsetX, offsetZ] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    if (findDetailGround(context, x + offsetX, z + offsetZ) === null)
      return
  }
  for (const [offsetX, offsetZ] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    setBlock(state, x + offsetX, groundY + 1, z + offsetZ, BlockId.WOOD_POST)
    setBlock(state, x + offsetX, groundY + 2, z + offsetZ, BlockId.WOOD_POST)
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, x + offsetX, groundY + 3, z + offsetZ, BlockId.DARK_WOOD_SLAB)
    }
  }
  placeDetail(context, x, z - 1, BlockId.BARREL, MUD_SET)
  placeDetail(context, x - 1, z, BlockId.CUSHION, MUD_SET)
  placeDetail(context, x + 1, z, BlockId.BASKET, MUD_SET)
  placeDetail(context, x - 1, z + 2, BlockId.FISHING_NET, MUD_SET)
  placeDetail(context, x, z + 3, BlockId.FISHING_NET, MUD_SET)
  placeDetail(context, x + 2, z + 2, BlockId.CRATE, MUD_SET)
}

/**
 * 小舟
 *
 * 蛙聲澤沒有船，這一艘是潮汐磯那一艘（placeSmallBoat）借來的：船底那一層水換成木板，船身浮在水面上一格。
 * 船頭一根從水底立上來的繫船樁
 */
function buildBoat(context: DetailContext): void {
  const { state } = context
  const { x, z } = SWAMP_BOAT_POINT
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      setBlock(state, x + offsetX, SWAMP_WATER_Y, z + offsetZ, BlockId.DARK_PLANKS)
    }
  }
  placeSmallBoat(state, x, SWAMP_WATER_Y + 1, z, false)
  for (let y = SWAMP_WATER_Y - 1; y <= SWAMP_WATER_Y + 2; y++) {
    const blockId = getBlock(state, x, y, z - 3)
    if (blockId === BlockId.WATER || blockId === BlockId.AIR)
      setBlock(state, x, y, z - 3, BlockId.WOOD_POST)
  }
}

/**
 * 倒木與石
 *
 * 只躺在泥灘上：曬白的枯木頂上長苔與菇，石頭是半埋在泥裡的苔石。
 * 位置用抽的，放不下就跳過
 */
function scatterLogAndRock(context: DetailContext): void {
  const { random } = context
  let logCount = 0
  let rockCount = 0
  for (let attempt = 0; attempt < 400 && (logCount < 10 || rockCount < 8); attempt++) {
    const x = SWAMP_CENTER.x + Math.round((random() * 2 - 1) * (MARSH_RADIUS - 6))
    const z = SWAMP_CENTER.z + Math.round((random() * 2 - 1) * (MARSH_RADIUS - 6))
    const isLog = random() < 0.6
    if (measureMarshDistance(x, z) > MARSH_RADIUS - 6 || findDetailGround(context, x, z)?.blockId !== BlockId.DIRT)
      continue

    if (isLog && logCount < 10) {
      const isPlaced = placeFallenLog(context, {
        x,
        z,
        axis: random() < 0.5 ? 'x' : 'z',
        length: 3 + Math.floor(random() * 2),
        logBlockX: BlockId.DEAD_LOG_X,
        logBlockZ: BlockId.DEAD_LOG_Z,
        topList: [BlockId.MOSS_CARPET, BlockId.MOSS_CARPET, BlockId.BROWN_MUSHROOM],
        topChance: 0.6,
        groundSet: MUD_SET,
      })
      if (isPlaced)
        logCount++
    }
    else if (!isLog && rockCount < 8 && placeRockCluster(context, x, z, BlockId.MOSSY_COBBLESTONE, BlockId.MOSS_CARPET)) {
      rockCount++
    }
  }
}

/** 造景零件：枯木之後、泥灘花草之前 */
export function placeSwampSetPieceList(state: Uint8Array): void {
  const context = createDetailContext(state, SWAMP_REALM, createSeededRandom('swamp-set-piece'), DETAIL_SCAN_TOP_Y)
  buildHut(context)
  buildBoat(context)
  scatterLogAndRock(context)
}

/**
 * 泥灘的層次
 *
 * 只換頂面那一格：離水兩格以上、成片的地方長草（泥灘中間比較乾），貼水的那一圈零星換成濕黏土。
 * 排在花草之後，花草認的是泥，先換掉就長不出來了
 */
function patchMud(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (getBlock(state, x, SWAMP_WATER_Y, z) !== BlockId.DIRT)
        continue
      const aboveBlock = getBlock(state, x, SWAMP_WATER_Y + 1, z)
      /** 上面壓著實心方塊（木樁、倒木、石）的不換，草皮側面的綠邊會從底下露出來 */
      if (aboveBlock !== BlockId.AIR && !isPassableBlock(aboveBlock))
        continue

      if (isNearWater(state, x, z)) {
        /** 成段的，不是每隔幾格一點：整圈零零星星的淺色會像撒了鹽 */
        if (fbm2D(x * 0.17 - 31, z * 0.17 + 5, 2, 0.5) > 0.16 && random() < 0.8)
          setBlock(state, x, SWAMP_WATER_Y, z, BlockId.CLAY)
        continue
      }
      if (fbm2D(x * 0.13 + 7, z * 0.13 + 61, 2, 0.5) > 0.02)
        setBlock(state, x, SWAMP_WATER_Y, z, BlockId.GRASS)
    }
  }
}

/** 睡蓮叢心換幾朵蓮：只換已經有睡蓮的格子，數量不變 */
function bloomLotus(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (getBlock(state, x, SWAMP_WATER_Y + 1, z) !== BlockId.LILY_PAD)
        continue
      if (fbm2D(x * 0.1 + 41, z * 0.1 - 13, 2, 0.5) > 0.18 && random() < 0.15)
        setBlock(state, x, SWAMP_WATER_Y + 1, z, BlockId.LOTUS)
    }
  }
}

/** 地被：泥灘花草與睡蓮之後補 */
export function scatterSwampDetail(state: Uint8Array): void {
  const context = createDetailContext(state, SWAMP_REALM, createSeededRandom('swamp-detail'), DETAIL_SCAN_TOP_Y)

  patchMud(context)
  bloomLotus(context)

  /** 香蒲：泥灘貼水的那一圈，成段成段的 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 13,
    frequency: 0.14,
    threshold: -0.02,
    chance: 0.5,
    pick: () => BlockId.CATTAIL,
    groundSet: MUD_SET,
    isAllowed: (x, z, ground) => isNextToWater(state, x, ground.y, z),
  })

  /** 草塊上的蕨與零星幾朵橘花：一片褐綠裡的幾點顏色 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 47,
    frequency: 0.16,
    threshold: 0.05,
    chance: 0.4,
    pick: (random) => random() < 0.82 ? BlockId.FERN : BlockId.JUNGLE_FLOWER,
    groundSet: new Set([BlockId.GRASS]),
  })

  /** 泥上的枯枝與碎石 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 71,
    frequency: 0.2,
    threshold: 0.2,
    chance: 0.35,
    pick: (random) => random() < 0.6 ? BlockId.TWIGS : BlockId.PEBBLES,
    groundSet: MUD_SET,
  })

  /** 枯木腳邊的紅菇：只挑站在泥上的那幾棵 */
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (getBlock(state, x, SWAMP_WATER_Y + 1, z) !== BlockId.DEAD_LOG || getBlock(state, x, SWAMP_WATER_Y + 2, z) !== BlockId.DEAD_LOG)
        continue
      if (MUD_SET.has(getBlock(state, x, SWAMP_WATER_Y, z)) && context.random() < 0.6)
        scatterDetailRing(context, x, z, 1.7, 0.6, (pick) => pick() < 0.7 ? BlockId.MUSHROOM : BlockId.BROWN_MUSHROOM, MUD_SET)
    }
  }
}
