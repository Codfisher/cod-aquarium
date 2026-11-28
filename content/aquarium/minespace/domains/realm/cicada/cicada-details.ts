import type { PlanePoint } from '../land-realm-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { measureDistance } from '../land-realm-kit'
import { clearPlantArea, findFreeSite, isFreeGround, measureNearestDistance, putProp } from '../realm-prop-kit'
import {
  CICADA_CENTER,
  CICADA_PORTAL_POINT,
  CICADA_STEPPING_LINE_LIST,
  OLD_WELL_POINT,
  VERANDA_HALF_LENGTH,
  VERANDA_LIST,
  WOOD_RADIUS,
  WOOD_SHRINE_POINT,
} from './cicada-layout'

/**
 * 蟬雨深林的細節小景
 *
 * 只有地形 worker 用，排在林下的花草之後、傳送門之前。
 * 林子原本是樹、土徑、兩道緣廊與三盞石燈籠，緣廊上只有坐墊與一盞提燈，林地是均勻的土與草。
 * 這一輪補的是夏天午後有人坐過的痕跡與林子自己長出來的東西：緣廊上的書、竹簍與風鈴，
 * 廊前的沓脫石、手水缽與打水的木桶，廊後一道竹籬；從土徑岔出去的飛石通到東邊空地的林間小祠
 * 與西邊空地的古井；樹腳的苔、苔石、倒木與樹樁。
 *
 * 不加樹葉、不加光源：樹冠已經是這裡最重的東西，小祠與古井都不點燈
 */

const FLOOR_SET = new Set([BlockId.GRASS, BlockId.DIRT])

/** 緣廊的木板也算地面：廊上的東西擺在木板上 */
const DECK_SET = new Set([BlockId.PLANKS])

/** 樹腳長苔的機率：只算貼著樹幹的那一圈空地 */
const TRUNK_MOSS_CHANCE = 0.4

/** 苔石與倒木各幾處 */
const MOSS_STONE_COUNT = 12
const FALLEN_LOG_COUNT = 4

function readFootY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/** 這一格是空地就擺，各自落在自己那一格的地面上 */
function putOnFloor(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number, blockId: BlockId): boolean {
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeGround(state, x, footY, z, FLOOR_SET))
    return false
  return putProp(state, x, footY, z, blockId)
}

/**
 * 緣廊上與廊前的東西
 *
 * 廊板上坐墊之間的空位擺一本攤開的書與一只竹簍，簷下多吊一個風鈴（提燈在另一頭）。
 * 廊前（北側）正中兩塊沓脫石，西頭一口手水缽（石座上一口鍋）與缽後兩節竹筧，東頭一個打水的木桶；
 * 廊後一道竹籬，缺了幾根
 */
function furnishVerandaList(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  for (const veranda of VERANDA_LIST) {
    const footY = readFootY(groundTopMap, veranda.x, veranda.z)
    if (isFreeGround(state, veranda.x, footY, veranda.z, DECK_SET))
      setBlock(state, veranda.x, footY, veranda.z, BlockId.OPEN_BOOK)
    if (isFreeGround(state, veranda.x - 2, footY, veranda.z, DECK_SET))
      setBlock(state, veranda.x - 2, footY, veranda.z, BlockId.BASKET)
    /** 風鈴吊在簷下：頭上那一格是出簷的階梯才掛 */
    if (getBlock(state, veranda.x - 2, footY + 3, veranda.z) !== BlockId.AIR)
      setDecoration(state, veranda.x - 2, footY + 2, veranda.z, BlockId.WIND_CHIME)

    for (const offsetX of [0, 1]) {
      putOnFloor(state, groundTopMap, veranda.x + offsetX, veranda.z - 1, BlockId.STONE_SLAB)
    }
    const basinX = veranda.x - VERANDA_HALF_LENGTH - 1
    if (putOnFloor(state, groundTopMap, basinX, veranda.z - 1, BlockId.MOSSY_COBBLESTONE)) {
      setBlock(state, basinX, readFootY(groundTopMap, basinX, veranda.z - 1) + 1, veranda.z - 1, BlockId.CAULDRON)
      const spoutFootY = readFootY(groundTopMap, basinX, veranda.z)
      if (isFreeGround(state, basinX, spoutFootY, veranda.z, FLOOR_SET)) {
        putProp(state, basinX, spoutFootY, veranda.z, BlockId.BAMBOO_STALK)
        setBlock(state, basinX, spoutFootY + 1, veranda.z, BlockId.BAMBOO_STALK)
      }
      putOnFloor(state, groundTopMap, basinX - 1, veranda.z - 1, BlockId.PEBBLES)
      putOnFloor(state, groundTopMap, basinX, veranda.z - 2, BlockId.PEBBLES)
    }
    putOnFloor(state, groundTopMap, veranda.x + VERANDA_HALF_LENGTH + 1, veranda.z - 1, BlockId.BARREL)

    for (let offsetX = -VERANDA_HALF_LENGTH - 1; offsetX <= VERANDA_HALF_LENGTH + 1; offsetX++) {
      if (random() < 0.25)
        continue
      putOnFloor(state, groundTopMap, veranda.x + offsetX, veranda.z + 2, BlockId.BAMBOO_FENCE)
    }
  }
}

/**
 * 從土徑岔出去的飛石
 *
 * 沿著兩點之間的直線一格一塊（七成），只鋪在空的林地上，碰到樹幹就斷開；
 * 走在土徑上看到一串石頭鑽進樹影裡，就知道那邊有東西
 */
function layStoneLineList(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  for (const line of CICADA_STEPPING_LINE_LIST) {
    const length = Math.hypot(line.to.x - line.from.x, line.to.z - line.from.z)
    for (let step = 1; step <= length; step++) {
      const roll = random()
      const x = Math.round(line.from.x + ((line.to.x - line.from.x) * step) / length)
      const z = Math.round(line.from.z + ((line.to.z - line.from.z) * step) / length)
      if (roll > 0.7 || measureDistance(x, z, CICADA_PORTAL_POINT) < 4)
        continue
      putOnFloor(state, groundTopMap, x, z, BlockId.STEPPING_STONE)
    }
  }
}

/**
 * 林間小祠
 *
 * 空地正中一塊苔石當座，上面一格深色木板的祠身、一片木半磚的頂；祠前一塊踏石、兩盆供花，兩側各一顆小石。
 * 空地西緣立一道小鳥居（兩根三格高的木樁、頂上一道橫木），從飛石走過來正好穿過它。
 * 祠四周的草地鋪一圈苔
 */
function placeWoodShrine(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  const site = findFreeSite(state, groundTopMap, WOOD_SHRINE_POINT, 1, 1, FLOOR_SET, 2)
  if (!site)
    return
  const { x, z, footY } = site
  clearPlantArea(state, x - 1, z - 1, x + 1, z + 1, footY)
  setBlock(state, x, footY, z, BlockId.MOSSY_COBBLESTONE)
  setBlock(state, x, footY + 1, z, BlockId.DARK_PLANKS)
  setBlock(state, x, footY + 2, z, BlockId.DARK_WOOD_SLAB)
  setBlock(state, x - 1, footY, z, BlockId.STONE_SLAB)
  setBlock(state, x - 1, footY, z - 1, BlockId.FLOWER_POT)
  setBlock(state, x - 1, footY, z + 1, BlockId.FLOWER_POT)
  setBlock(state, x, footY, z - 1, BlockId.SMALL_ROCK)
  setBlock(state, x, footY, z + 1, BlockId.SMALL_ROCK)

  /** 小鳥居：門洞朝東西，人從西邊走進來 */
  const toriiX = x - 3
  const toriiFootY = readFootY(groundTopMap, toriiX, z)
  const isToriiLevel = [-1, 0, 1].every((offsetZ) => readFootY(groundTopMap, toriiX, z + offsetZ) === toriiFootY)
  if (isToriiLevel && isFreeGround(state, toriiX, toriiFootY, z - 1, FLOOR_SET) && isFreeGround(state, toriiX, toriiFootY, z + 1, FLOOR_SET)) {
    for (const offsetZ of [-1, 1]) {
      putProp(state, toriiX, toriiFootY, z + offsetZ, BlockId.WOOD_POST)
      setBlock(state, toriiX, toriiFootY + 1, z + offsetZ, BlockId.WOOD_POST)
      setBlock(state, toriiX, toriiFootY + 2, z + offsetZ, BlockId.WOOD_POST)
    }
    /** 橫木是半磚，架在三格高的柱頂：底面離地兩格半，人從底下走過去不會擦到頭 */
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setDecoration(state, toriiX, toriiFootY + 3, z + offsetZ, BlockId.DARK_WOOD_SLAB)
    }
  }

  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      const roll = random()
      if (Math.hypot(offsetX, offsetZ) > 3.3 || roll > 0.5)
        continue
      const cellFootY = readFootY(groundTopMap, x + offsetX, z + offsetZ)
      if (isFreeGround(state, x + offsetX, cellFootY, z + offsetZ, FLOOR_SET) && getBlock(state, x + offsetX, cellFootY, z + offsetZ) === BlockId.AIR)
        setBlock(state, x + offsetX, cellFootY, z + offsetZ, BlockId.MOSS_CARPET)
    }
  }
}

/**
 * 古井
 *
 * 三格見方的一圈圓石井欄，中間一格水；東西兩側的井欄上各立一根兩格高的柱子，撐一片三格寬的木頂，
 * 頂下垂一截鐵鏈到水面上方。井邊一個木桶、一塊踏石。
 *
 * 水在井欄那一層（比林地高一格）：布景的地面平面鋪在林地的頂面，水落在林地那一層會被它蓋住
 */
function placeOldWell(state: Uint8Array, groundTopMap: Uint8Array): void {
  const site = findFreeSite(state, groundTopMap, OLD_WELL_POINT, 2, 1, FLOOR_SET, 2)
  if (!site)
    return
  const { x, z, footY } = site
  clearPlantArea(state, x - 2, z - 1, x + 2, z + 1, footY)
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const isCenter = offsetX === 0 && offsetZ === 0
      setBlock(state, x + offsetX, footY, z + offsetZ, isCenter ? BlockId.WATER : (offsetX + offsetZ) % 2 === 0 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
    }
  }
  setBlock(state, x, footY - 1, z, BlockId.MOSSY_COBBLESTONE)
  for (const offsetX of [-1, 1]) {
    setBlock(state, x + offsetX, footY + 1, z, BlockId.WOOD_POST)
    setBlock(state, x + offsetX, footY + 2, z, BlockId.WOOD_POST)
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setDecoration(state, x + offsetX, footY + 3, z + offsetZ, BlockId.DARK_WOOD_SLAB)
    }
  }
  setDecoration(state, x, footY + 2, z, BlockId.CHAIN)
  setBlock(state, x + 2, footY, z, BlockId.BARREL)
  setBlock(state, x - 2, footY, z, BlockId.STONE_SLAB)
}

/** 林子裡每一根立著的橡樹幹（只找林地上那一格） */
function collectTrunkList(state: Uint8Array, groundTopMap: Uint8Array): PlanePoint[] {
  const trunkList: PlanePoint[] = []
  for (let x = CICADA_CENTER.x - WOOD_RADIUS; x <= CICADA_CENTER.x + WOOD_RADIUS; x++) {
    for (let z = CICADA_CENTER.z - WOOD_RADIUS; z <= CICADA_CENTER.z + WOOD_RADIUS; z++) {
      if (measureDistance(x, z, CICADA_CENTER) <= WOOD_RADIUS && getBlock(state, x, readFootY(groundTopMap, x, z), z) === BlockId.OAK_LOG)
        trunkList.push({ x, z })
    }
  }
  return trunkList
}

/**
 * 樹腳的苔
 *
 * 貼著樹幹的那一圈空地有四成長苔（薄薄一層，踩得過去），林地因此在每棵樹腳下深一圈綠，
 * 而不是整片同一種土色
 */
function growTrunkMoss(state: Uint8Array, groundTopMap: Uint8Array, trunkList: readonly PlanePoint[], random: () => number): void {
  for (const trunk of trunkList) {
    for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const roll = random()
      const x = trunk.x + offsetX
      const z = trunk.z + offsetZ
      const footY = readFootY(groundTopMap, x, z)
      if (roll > TRUNK_MOSS_CHANCE || !FLOOR_SET.has(getBlock(state, x, footY - 1, z)) || getBlock(state, x, footY, z) !== BlockId.AIR)
        continue
      setBlock(state, x, footY, z, BlockId.MOSS_CARPET)
    }
  }
}

/**
 * 苔石、倒木與樹樁
 *
 * 苔石十二塊（一格青苔圓石，一半頂上再壓一片半磚），旁邊各一兩片苔；
 * 倒木四截（三格長的橡木，上面一朵菇、旁邊幾根枯枝）。都離土徑與空地幾格，是林子深處才有的東西
 */
function scatterStoneAndLog(state: Uint8Array, groundTopMap: Uint8Array, trunkList: readonly PlanePoint[], random: () => number): void {
  const keepClearList: PlanePoint[] = [CICADA_PORTAL_POINT, WOOD_SHRINE_POINT, OLD_WELL_POINT, ...VERANDA_LIST]
  let stoneCount = 0
  let logCount = 0
  for (let attempt = 0; attempt < 400 && (stoneCount < MOSS_STONE_COUNT || logCount < FALLEN_LOG_COUNT); attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 6 + random() * (WOOD_RADIUS - 8)
    const target = {
      x: Math.round(CICADA_CENTER.x + Math.cos(angle) * radius),
      z: Math.round(CICADA_CENTER.z + Math.sin(angle) * radius),
    }
    const isAlongX = random() < 0.5
    const hasCap = random() < 0.5
    if (measureNearestDistance(target.x, target.z, keepClearList) < 7 || measureNearestDistance(target.x, target.z, trunkList) < 1.5)
      continue

    if (logCount < FALLEN_LOG_COUNT) {
      const site = findFreeSite(state, groundTopMap, target, isAlongX ? 1 : 0, isAlongX ? 0 : 1, FLOOR_SET, 1)
      if (!site)
        continue
      for (let step = -1; step <= 1; step++) {
        putProp(state, site.x + (isAlongX ? step : 0), site.footY, site.z + (isAlongX ? 0 : step), isAlongX ? BlockId.OAK_LOG_X : BlockId.OAK_LOG_Z)
      }
      setBlock(state, site.x, site.footY + 1, site.z, BlockId.BROWN_MUSHROOM)
      putOnFloor(state, groundTopMap, site.x + (isAlongX ? 0 : 1), site.z + (isAlongX ? 1 : 0), BlockId.TWIGS)
      putOnFloor(state, groundTopMap, site.x + (isAlongX ? 2 : 0), site.z + (isAlongX ? 0 : 2), BlockId.MOSS_CARPET)
      keepClearList.push(site)
      logCount++
      continue
    }

    if (!putOnFloor(state, groundTopMap, target.x, target.z, BlockId.MOSSY_COBBLESTONE))
      continue
    if (hasCap)
      setBlock(state, target.x, readFootY(groundTopMap, target.x, target.z) + 1, target.z, BlockId.STONE_SLAB)
    putOnFloor(state, groundTopMap, target.x + 1, target.z, BlockId.MOSS_CARPET)
    putOnFloor(state, groundTopMap, target.x, target.z - 1, BlockId.SMALL_ROCK)
    keepClearList.push(target)
    stoneCount++
  }
}

/** 補上蟬雨深林的細節小景 */
export function decorateCicada(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('cicada-detail')

  placeWoodShrine(state, groundTopMap, random)
  placeOldWell(state, groundTopMap)
  furnishVerandaList(state, groundTopMap, random)
  layStoneLineList(state, groundTopMap, random)

  const trunkList = collectTrunkList(state, groundTopMap)
  scatterStoneAndLog(state, groundTopMap, trunkList, random)
  growTrunkMoss(state, groundTopMap, trunkList, random)
}
