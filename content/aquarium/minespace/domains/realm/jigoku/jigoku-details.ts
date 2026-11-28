import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getNoisyDistance } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { clearPlantArea, isFreeArea, isFreeGround, placeCairn, placePostWithTop, putProp } from '../realm-prop-kit'
import {
  CAIRN_FIELD,
  EGG_STALL_POINT,
  FOOT_BATH_RECT,
  HOT_POOL_LIST,
  JIGOKU_CENTER,
  JIGOKU_FLOOR_Y,
  JIGOKU_FOOT_Y,
  STEAM_VENT_LIST,
} from './jigoku-layout'

/**
 * 湯煙谷的細節小景
 *
 * 只有地形 worker 用，排在枯木與花草之後、傳送門之前。全在南邊那一彎台地上（腳底 JIGOKU_FOOT_Y），
 * 是整片熔岩湖前面那一層人的尺度：泉與噴氣孔四周一圈一圈結出來的硫磺華（薄殼與小塊）、
 * 泉邊的告示木牌與界樁、鳥居前賣溫泉蛋的小攤與一把朱紅的野點傘、有頂的足湯，
 * 以及東邊木棧南側的賽之河原（一片積石與一尊石地藏）。
 *
 * 不加光源：整座火口的真光是照著預算排的（見 jigoku-layout 的 LAVA_LIGHT_POINT_LIST），這裡的東西都不發光
 */

/** 台地上擺得下東西的地面 */
const FLOOR_SET = new Set([BlockId.STONE, BlockId.GRAVEL, BlockId.COBBLESTONE, BlockId.SANDSTONE, BlockId.OBSIDIAN_BRICKS, BlockId.BASALT])

/** 硫磺華從泉緣往外結多遠（格），泥池只有一半 */
const CRUST_REACH = 4.5

/** 泉緣那一圈黏土與砂岩有多寬：硫磺華從這外面開始結（見 placeHotPool） */
const POOL_RIM_WIDTH = 1

/**
 * 傘與足湯木頂的柱高（格）
 *
 * 頂是半磚，佔那一格的下半格。柱子只有兩格的話，頂的底面離地一格半，人（一格八）走得過去卻幾乎擦到頭，
 * 神遊的走路檢查也會把它算成撞頭。三格高，頂的底面離地兩格半
 */
const CANOPY_POST_HEIGHT = 3

/** 賽之河原的積石有幾堆 */
const CAIRN_COUNT = 16

/** 鋪一片硫磺華：這一格是空的谷底才鋪 */
function layCrust(state: Uint8Array, x: number, z: number, blockId: BlockId = BlockId.SULPHUR_CRUST): boolean {
  if (!FLOOR_SET.has(getBlock(state, x, JIGOKU_FLOOR_Y, z)) || getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
    return false
  setBlock(state, x, JIGOKU_FOOT_Y, z, blockId)
  return true
}

/**
 * 泉邊的硫磺華
 *
 * 熱泉外緣往外四格半，靠泉的那一圈幾乎鋪滿，越往外越碎；再乘一層噪音，結成一瓣一瓣而不是一個圓環。
 * 靠泉最近的那一圈偶爾結成一小坨。泥池不出硫磺，只在池邊留一圈窄的
 */
function crustHotPoolList(state: Uint8Array, random: () => number): void {
  for (const pool of HOT_POOL_LIST) {
    const reach = pool.kind === 'spring' ? CRUST_REACH : CRUST_REACH / 2
    const limit = Math.ceil(pool.radius + POOL_RIM_WIDTH + reach + 2)
    for (let offsetX = -limit; offsetX <= limit; offsetX++) {
      for (let offsetZ = -limit; offsetZ <= limit; offsetZ++) {
        const roll = random()
        const x = pool.x + offsetX
        const z = pool.z + offsetZ
        const gap = getNoisyDistance(x, z, pool.x, pool.z, 0.3, 1.2) - pool.radius - POOL_RIM_WIDTH
        if (gap <= 0 || gap > reach)
          continue
        const ratio = gap / reach
        const patch = fbm2D(x * 0.33 + pool.x, z * 0.33 - pool.z, 2, 0.5)
        if (roll > 0.92 - ratio * 0.7 + patch * 0.35)
          continue
        layCrust(state, x, z, ratio < 0.4 && roll < 0.07 ? BlockId.SULPHUR_LUMP : BlockId.SULPHUR_CRUST)
      }
    }
  }
}

/** 噴氣孔四周：孔緣那圈石頭外面一圈碎碎的硫磺華，孔邊兩三坨硫磺塊 */
function crustSteamVentList(state: Uint8Array, random: () => number): void {
  for (const vent of STEAM_VENT_LIST) {
    for (let offsetX = -4; offsetX <= 4; offsetX++) {
      for (let offsetZ = -4; offsetZ <= 4; offsetZ++) {
        const roll = random()
        const distance = Math.hypot(offsetX, offsetZ)
        if (distance < 1.9 || distance > 4.2 || roll > 0.62 - (distance - 1.9) * 0.2)
          continue
        layCrust(state, vent.x + offsetX, vent.z + offsetZ, distance < 2.6 && roll < 0.12 ? BlockId.SULPHUR_LUMP : BlockId.SULPHUR_CRUST)
      }
    }
  }
}

/**
 * 泉邊的告示與界樁
 *
 * 每一池熱泉朝中軸那一側立一塊木牌：一根樁頂一片雨戶板，
 * 前後各一根矮樁。木牌只是擺設，不寫字：從木棧上看過去，知道那一池不能下去
 */
function placeWarningSignList(state: Uint8Array): void {
  for (const pool of HOT_POOL_LIST) {
    if (pool.kind !== 'spring')
      continue
    const inward = pool.x > JIGOKU_CENTER.x ? -1 : 1
    const signX = pool.x + inward * Math.round(pool.radius + POOL_RIM_WIDTH + 2)
    for (const offsetZ of [-2, 2]) {
      if (isFreeGround(state, signX, JIGOKU_FOOT_Y, pool.z + offsetZ, FLOOR_SET))
        putProp(state, signX, JIGOKU_FOOT_Y, pool.z + offsetZ, BlockId.WOOD_POST)
    }
    if (isFreeGround(state, signX, JIGOKU_FOOT_Y, pool.z, FLOOR_SET))
      placePostWithTop(state, signX, JIGOKU_FOOT_Y, pool.z, 1, BlockId.WOOD_POST, BlockId.STORM_PANEL_Z)
  }
}

/**
 * 溫泉蛋的小攤
 *
 * 三格高的柱子撐一把三格見方的朱紅野點傘；傘下一張朝東（對著木棧）的長凳、
 * 一口架在圓石上的蒸鍋、一簍蛋、一個水桶。攤子西南幾格就是一個噴氣孔，蛋是借它的熱氣蒸的
 */
function placeEggStall(state: Uint8Array): void {
  const { x, z } = EGG_STALL_POINT
  if (!isFreeArea(state, x - 1, z - 1, x + 1, z + 1, JIGOKU_FOOT_Y, FLOOR_SET))
    return
  clearPlantArea(state, x - 1, z - 1, x + 1, z + 1, JIGOKU_FOOT_Y)

  for (let level = 0; level < CANOPY_POST_HEIGHT; level++) {
    setBlock(state, x, JIGOKU_FOOT_Y + level, z, BlockId.WOOD_POST)
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, x + offsetX, JIGOKU_FOOT_Y + CANOPY_POST_HEIGHT, z + offsetZ, BlockId.PARASOL)
    }
  }
  setBlock(state, x - 1, JIGOKU_FOOT_Y, z, BlockId.WOOD_STAIRS_WEST)
  setBlock(state, x - 1, JIGOKU_FOOT_Y, z + 1, BlockId.WOOD_STAIRS_WEST)
  setBlock(state, x + 1, JIGOKU_FOOT_Y, z - 1, BlockId.COBBLESTONE)
  setBlock(state, x + 1, JIGOKU_FOOT_Y + 1, z - 1, BlockId.CAULDRON)
  setBlock(state, x + 1, JIGOKU_FOOT_Y, z + 1, BlockId.BASKET)
  setBlock(state, x, JIGOKU_FOOT_Y, z - 1, BlockId.BARREL)
}

/**
 * 足湯
 *
 * 木板圍一圈池緣，中間一道一格深的熱水、黏土底；四角各一根三格高的柱子，撐一片深色木半磚的頂。
 * 池緣上兩個坐墊，池邊一個木桶與一塊告示
 */
function placeFootBath(state: Uint8Array): void {
  const { minX, maxX, minZ, maxZ } = FOOT_BATH_RECT
  if (!isFreeArea(state, minX - 1, minZ - 1, maxX + 1, maxZ + 1, JIGOKU_FOOT_Y, FLOOR_SET))
    return
  clearPlantArea(state, minX - 1, minZ - 1, maxX + 1, maxZ + 1, JIGOKU_FOOT_Y)

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const isRim = x === minX || x === maxX || z === minZ || z === maxZ
      setBlock(state, x, JIGOKU_FLOOR_Y, z, isRim ? BlockId.PLANKS : BlockId.WATER)
      if (!isRim)
        setBlock(state, x, JIGOKU_FLOOR_Y - 1, z, BlockId.CLAY)
      setBlock(state, x, JIGOKU_FOOT_Y + CANOPY_POST_HEIGHT, z, BlockId.DARK_WOOD_SLAB)
    }
  }
  for (const x of [minX, maxX]) {
    for (const z of [minZ, maxZ]) {
      for (let level = 0; level < CANOPY_POST_HEIGHT; level++) {
        setBlock(state, x, JIGOKU_FOOT_Y + level, z, BlockId.WOOD_POST)
      }
    }
  }
  setBlock(state, minX + 1, JIGOKU_FOOT_Y, minZ, BlockId.CUSHION)
  setBlock(state, maxX - 2, JIGOKU_FOOT_Y, maxZ, BlockId.CUSHION)
  setBlock(state, maxX + 1, JIGOKU_FOOT_Y, minZ, BlockId.BARREL)
  setBlock(state, minX - 1, JIGOKU_FOOT_Y, maxZ, BlockId.BASKET)
}

/**
 * 賽之河原
 *
 * 東邊木棧南側的一片地上，十來堆積石（一格圓石頂一片半磚，幾堆高一格），
 * 正中一尊石地藏：石磚的座、石頭的身、一片半磚當笠，腳前一盆花
 */
function placeCairnField(state: Uint8Array, random: () => number): void {
  const { x: centerX, z: centerZ, radius } = CAIRN_FIELD

  if (isFreeGround(state, centerX, JIGOKU_FOOT_Y, centerZ, FLOOR_SET)) {
    putProp(state, centerX, JIGOKU_FOOT_Y, centerZ, BlockId.STONE_BRICKS)
    setBlock(state, centerX, JIGOKU_FOOT_Y + 1, centerZ, BlockId.STONE)
    setBlock(state, centerX, JIGOKU_FOOT_Y + 2, centerZ, BlockId.STONE_SLAB)
    if (isFreeGround(state, centerX, JIGOKU_FOOT_Y, centerZ + 1, FLOOR_SET))
      putProp(state, centerX, JIGOKU_FOOT_Y, centerZ + 1, BlockId.FLOWER_POT)
  }

  let cairnCount = 0
  for (let attempt = 0; attempt < 120 && cairnCount < CAIRN_COUNT; attempt++) {
    const angle = random() * Math.PI * 2
    const distance = 1.6 + random() * (radius - 1.6)
    const x = Math.round(centerX + Math.cos(angle) * distance)
    const z = Math.round(centerZ + Math.sin(angle) * distance)
    const height = random() < 0.25 ? 2 : 1
    const blockId = random() < 0.3 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE
    if (!isFreeGround(state, x, JIGOKU_FOOT_Y, z, FLOOR_SET))
      continue
    /** 兩堆不貼在一起：四方相鄰的格子都還空著 */
    const hasNeighbour = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) => {
      const neighbour = getBlock(state, x + offsetX!, JIGOKU_FOOT_Y, z + offsetZ!)
      return neighbour === BlockId.COBBLESTONE || neighbour === BlockId.MOSSY_COBBLESTONE || neighbour === BlockId.STONE_BRICKS
    })
    if (hasNeighbour)
      continue
    if (placeCairn(state, x, JIGOKU_FOOT_Y, z, height, blockId))
      cairnCount++
  }

  /** 積石之間散幾顆小石 */
  for (let offsetX = -radius; offsetX <= radius; offsetX++) {
    for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
      const roll = random()
      if (Math.hypot(offsetX, offsetZ) > radius || roll > 0.1)
        continue
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      if (isFreeGround(state, x, JIGOKU_FOOT_Y, z, FLOOR_SET) && getBlock(state, x, JIGOKU_FOOT_Y, z) === BlockId.AIR)
        setBlock(state, x, JIGOKU_FOOT_Y, z, roll < 0.04 ? BlockId.SMALL_ROCK : BlockId.PEBBLES)
    }
  }
}

/** 補上湯煙谷的細節小景 */
export function decorateJigoku(state: Uint8Array): void {
  const random = createSeededRandom('jigoku-detail')

  /** 有形狀的先蓋，硫磺華最後鋪：攤子、足湯與木牌腳下不會先被薄殼佔掉 */
  placeEggStall(state)
  placeFootBath(state)
  placeCairnField(state, random)
  placeWarningSignList(state)
  crustHotPoolList(state, random)
  crustSteamVentList(state, random)
}
