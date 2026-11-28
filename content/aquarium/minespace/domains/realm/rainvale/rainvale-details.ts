import type { PlanePoint } from '../land-realm-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { clearPlantArea, findFreeSite, isFreeGround, measureNearestDistance, putProp } from '../realm-prop-kit'
import { isNextToWater } from '../realm-terrain-kit'
import {
  PAVILION_LIST,
  PLANK_BRIDGE,
  POND_LIST,
  RAINVALE_CENTER,
  RAINVALE_GROUND_Y,
  RAINVALE_PORTAL_POINT,
  RAINVALE_STEPPING_LINE_LIST,
  TEA_SEAT_POINT,
  THICKET_START_RADIUS,
} from './rainvale-layout'

/**
 * 聽雨林的細節小景
 *
 * 只有地形 worker 用，排在林下的花草之後、傳送門之前。
 * 林子原本是樹、八窪積水、四座亭子與十幾塊苔石，亭與亭之間沒有路，水邊就是草。
 * 這一輪補的是雨天裡的東西：亭子簷角垂到石缽裡的雨鏈、撐開晾在亭邊的傘、
 * 水邊的卵石與石緣、漂在水面的睡蓮與蓮、橫過水窪的木板橋、一把朱紅野點傘底下的茶席，
 * 把亭子串起來的飛石，以及苔石與樹腳四周一片一片的苔。
 *
 * 不加樹葉、不加光源：雨林的樹冠與雨絲已經夠重，傘下與橋上都不點燈
 */

const GRASS_SET = new Set([BlockId.GRASS])

/** 林地站著的腳底高度（積水與亭子四周都是這一層） */
const FOOT_Y = RAINVALE_GROUND_Y + 1

/** 亭子的座椅朝向換成格子的方向 */
const FACING_OFFSET_MAP = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
} as const

/** 水邊那一圈草地換成石緣、鋪上卵石的機率 */
const RIM_STONE_CHANCE = 0.3
const RIM_PEBBLE_CHANCE = 0.22

/** 野點傘的柄高（格）：傘面是半磚，柄三格高，傘面的底離地兩格半，人從傘下走過去不會擦到頭 */
const PARASOL_POST_HEIGHT = 3

/** 苔石四周長苔的半徑與機率 */
const MOSS_REACH = 2
const MOSS_CHANCE = 0.5

/** 樹幹腳邊那一圈長苔的機率：比苔石邊少，林地才不會整片都是苔 */
const TRUNK_MOSS_CHANCE = 0.2

function readFootY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/** 這一格是空草地就擺，各自落在自己那一格的地面上 */
function putOnGrass(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number, blockId: BlockId): boolean {
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeGround(state, x, footY, z, GRASS_SET))
    return false
  return putProp(state, x, footY, z, blockId)
}

/**
 * 亭子的雨鏈與晾著的傘
 *
 * 每座亭子背後左手邊的簷角垂一條雨鏈（兩節鐵鏈），落進地上一口接雨的石缽；
 * 落腳那一座與南邊那一座的簷下，各有一把撐開晾著的傘（一根短柄頂一片朱紅的傘面）。
 * 屋簷是五格見方，簷角在離亭心兩格的對角上
 */
function dressPavilionList(state: Uint8Array): void {
  for (const [index, pavilion] of PAVILION_LIST.entries()) {
    const front = FACING_OFFSET_MAP[pavilion.facing]
    const left = { x: front.z, z: -front.x }
    const chainX = pavilion.x + (-front.x + left.x) * 2
    const chainZ = pavilion.z + (-front.z + left.z) * 2
    if (isFreeGround(state, chainX, FOOT_Y, chainZ, GRASS_SET) && getBlock(state, chainX, FOOT_Y + 3, chainZ) !== BlockId.AIR) {
      putProp(state, chainX, FOOT_Y, chainZ, BlockId.CAULDRON)
      setDecoration(state, chainX, FOOT_Y + 1, chainZ, BlockId.CHAIN)
      setDecoration(state, chainX, FOOT_Y + 2, chainZ, BlockId.CHAIN)
    }

    if (index % 3 !== 0)
      continue
    const umbrellaX = pavilion.x + (-front.x - left.x) * 2
    const umbrellaZ = pavilion.z + (-front.z - left.z) * 2
    if (isFreeGround(state, umbrellaX, FOOT_Y, umbrellaZ, GRASS_SET)) {
      putProp(state, umbrellaX, FOOT_Y, umbrellaZ, BlockId.FENCE)
      setDecoration(state, umbrellaX, FOOT_Y + 1, umbrellaZ, BlockId.PARASOL)
    }
  }
}

/**
 * 木板橋
 *
 * 一排木半磚架在水面上方，兩頭各搭上岸一格，橋頭各一根矮樁。
 * 橋面比草地高半格，走上去不必跳；水在橋下照樣映著樹冠
 */
function placePlankBridge(state: Uint8Array): void {
  const { z, minX, maxX } = PLANK_BRIDGE
  for (let x = minX; x <= maxX; x++) {
    /** 水面上方那一格是空的，岸上那一格頂多是花草：都清掉再鋪橋板 */
    putProp(state, x, FOOT_Y, z, BlockId.WOOD_SLAB)
  }
  for (const [x, offsetZ] of [[minX, -1], [maxX, 1]] as const) {
    if (isFreeGround(state, x, FOOT_Y, z + offsetZ, GRASS_SET))
      putProp(state, x, FOOT_Y, z + offsetZ, BlockId.WOOD_POST)
  }
}

/**
 * 野點傘的茶席
 *
 * 三格高的柱子撐一把三格見方的朱紅大傘；傘下鋪草蓆，東西兩側各一個坐墊，北邊一口鐵壺、南邊一簍茶具。
 * 雨滴打到傘面就停，整個林子只有亭子裡與這把傘底下是乾的
 */
function placeTeaSeat(state: Uint8Array, groundTopMap: Uint8Array): void {
  const site = findFreeSite(state, groundTopMap, TEA_SEAT_POINT, 1, 1, GRASS_SET, 4)
  if (!site)
    return
  const { x, z, footY } = site
  clearPlantArea(state, x - 1, z - 1, x + 1, z + 1, footY)
  for (let level = 0; level < PARASOL_POST_HEIGHT; level++) {
    setBlock(state, x, footY + level, z, BlockId.WOOD_POST)
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setDecoration(state, x + offsetX, footY + PARASOL_POST_HEIGHT, z + offsetZ, BlockId.PARASOL)
      if (offsetX !== 0 && offsetZ !== 0)
        setBlock(state, x + offsetX, footY, z + offsetZ, BlockId.TATAMI_MAT)
    }
  }
  setBlock(state, x - 1, footY, z, BlockId.CUSHION)
  setBlock(state, x + 1, footY, z, BlockId.CUSHION)
  setBlock(state, x, footY, z - 1, BlockId.CAULDRON)
  setBlock(state, x, footY, z + 1, BlockId.BASKET)
}

/**
 * 飛石
 *
 * 沿著每一段折線一格一塊（六成五），只鋪在空草地上；
 * 亭子的木板、水與樹幹都會讓它斷開，回程門前那幾格不鋪
 */
function layStoneLineList(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  for (const pointList of RAINVALE_STEPPING_LINE_LIST) {
    for (let index = 0; index < pointList.length - 1; index++) {
      const from = pointList[index]!
      const to = pointList[index + 1]!
      const length = Math.hypot(to.x - from.x, to.z - from.z)
      for (let step = 0; step <= length; step++) {
        const roll = random()
        const x = Math.round(from.x + ((to.x - from.x) * step) / Math.max(1, length))
        const z = Math.round(from.z + ((to.z - from.z) * step) / Math.max(1, length))
        if (roll > 0.65 || Math.hypot(x - RAINVALE_PORTAL_POINT.x, z - RAINVALE_PORTAL_POINT.z) < 4)
          continue
        putOnGrass(state, groundTopMap, x, z, BlockId.STEPPING_STONE)
      }
    }
  }
}

/**
 * 水邊
 *
 * 貼著水的那一圈草地：三成換成與草齊平的青苔圓石或黏土（石緣），兩成鋪上卵石，零星幾叢香蒲。
 * 水面上漂幾片睡蓮，大一點的那幾窪各開一兩朵蓮。落腳那一池不放睡蓮：它整面是鏡子，漂著東西倒影會破
 */
function dressPondList(state: Uint8Array, random: () => number): void {
  for (const [pondIndex, pond] of POND_LIST.entries()) {
    const reach = Math.ceil(pond.radius + 3)
    for (let x = pond.x - reach; x <= pond.x + reach; x++) {
      for (let z = pond.z - reach; z <= pond.z + reach; z++) {
        const roll = random()
        const kind = random()
        const isWater = getBlock(state, x, RAINVALE_GROUND_Y, z) === BlockId.WATER
        if (isWater) {
          if (pondIndex !== 0 && roll < 0.07 && getBlock(state, x, FOOT_Y, z) === BlockId.AIR)
            setBlock(state, x, FOOT_Y, z, kind < 0.25 && pond.radius >= 3 ? BlockId.LOTUS : BlockId.LILY_PAD)
          continue
        }
        if (getBlock(state, x, RAINVALE_GROUND_Y, z) !== BlockId.GRASS || !isNextToWater(state, x, RAINVALE_GROUND_Y, z))
          continue
        if (getBlock(state, x, FOOT_Y, z) !== BlockId.AIR)
          continue
        if (roll < RIM_STONE_CHANCE)
          setBlock(state, x, RAINVALE_GROUND_Y, z, kind < 0.7 ? BlockId.MOSSY_COBBLESTONE : BlockId.CLAY)
        else if (roll < RIM_STONE_CHANCE + RIM_PEBBLE_CHANCE)
          setBlock(state, x, FOOT_Y, z, BlockId.PEBBLES)
        else if (roll < RIM_STONE_CHANCE + RIM_PEBBLE_CHANCE + 0.05)
          setBlock(state, x, FOOT_Y, z, BlockId.CATTAIL)
      }
    }
  }
}

/**
 * 苔石四周與樹腳的苔
 *
 * 每一塊苔石兩格內的空草地有一半鋪上苔；樹幹腳邊那一圈兩成。
 * 腐葉也可以被苔蓋掉：濕的地方本來就是苔蓋著落葉
 */
function growMoss(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  const reach = THICKET_START_RADIUS + 2
  for (let x = RAINVALE_CENTER.x - reach; x <= RAINVALE_CENTER.x + reach; x++) {
    for (let z = RAINVALE_CENTER.z - reach; z <= RAINVALE_CENTER.z + reach; z++) {
      const footY = readFootY(groundTopMap, x, z)
      const blockId = getBlock(state, x, footY, z)
      const isMossStone = blockId === BlockId.MOSSY_COBBLESTONE
      const isTrunk = blockId === BlockId.OAK_LOG
      if (!isMossStone && !isTrunk)
        continue
      const mossReach = isMossStone ? MOSS_REACH : 1
      for (let offsetX = -mossReach; offsetX <= mossReach; offsetX++) {
        for (let offsetZ = -mossReach; offsetZ <= mossReach; offsetZ++) {
          const roll = random()
          if (roll > (isMossStone ? MOSS_CHANCE : TRUNK_MOSS_CHANCE))
            continue
          const cellX = x + offsetX
          const cellZ = z + offsetZ
          const cellFootY = readFootY(groundTopMap, cellX, cellZ)
          const cellBlock = getBlock(state, cellX, cellFootY, cellZ)
          if (getBlock(state, cellX, cellFootY - 1, cellZ) !== BlockId.GRASS || (cellBlock !== BlockId.AIR && cellBlock !== BlockId.FOREST_LITTER))
            continue
          /** 回程門四周不長：門前那幾格要與原本一樣 */
          if (Math.hypot(cellX - RAINVALE_PORTAL_POINT.x, cellZ - RAINVALE_PORTAL_POINT.z) < 6)
            continue
          setBlock(state, cellX, cellFootY, cellZ, BlockId.MOSS_CARPET)
        }
      }
    }
  }
}

/** 倒木三截：三格長的橡木，上面一朵菇，旁邊幾根枯枝。離亭子、水與門遠一點 */
function scatterFallenLog(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  const keepClearList: PlanePoint[] = [RAINVALE_PORTAL_POINT, TEA_SEAT_POINT, ...PAVILION_LIST, ...POND_LIST]
  let logCount = 0
  for (let attempt = 0; attempt < 200 && logCount < 3; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 8 + random() * (THICKET_START_RADIUS - 12)
    const target = {
      x: Math.round(RAINVALE_CENTER.x + Math.cos(angle) * radius),
      z: Math.round(RAINVALE_CENTER.z + Math.sin(angle) * radius),
    }
    const isAlongX = random() < 0.5
    if (measureNearestDistance(target.x, target.z, keepClearList) < 8)
      continue
    const site = findFreeSite(state, groundTopMap, target, isAlongX ? 1 : 0, isAlongX ? 0 : 1, GRASS_SET, 1)
    if (!site)
      continue
    for (let step = -1; step <= 1; step++) {
      putProp(state, site.x + (isAlongX ? step : 0), site.footY, site.z + (isAlongX ? 0 : step), isAlongX ? BlockId.OAK_LOG_X : BlockId.OAK_LOG_Z)
    }
    setBlock(state, site.x, site.footY + 1, site.z, BlockId.BROWN_MUSHROOM)
    putOnGrass(state, groundTopMap, site.x + (isAlongX ? 0 : 1), site.z + (isAlongX ? 1 : 0), BlockId.TWIGS)
    keepClearList.push(site)
    logCount++
  }
}

/** 補上聽雨林的細節小景 */
export function decorateRainvale(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('rainvale-detail')

  dressPavilionList(state)
  placePlankBridge(state)
  placeTeaSeat(state, groundTopMap)
  layStoneLineList(state, groundTopMap, random)
  dressPondList(state, random)
  scatterFallenLog(state, groundTopMap, random)
  growMoss(state, groundTopMap, random)
}
