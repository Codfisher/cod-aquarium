import type { PlanePoint } from '../land-realm-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { createPathDistanceMap, measureDistance, samplePathCurve } from '../land-realm-kit'
import { clearPlantArea, clearPlantColumn, findFreeSite, isFreeGround, measureNearestDistance, putProp } from '../realm-prop-kit'
import {
  BASIN_LIST,
  BIRD_HIDE_POINT,
  BIRDHOUSE_LIST,
  FEEDER_LIST,
  PARK_RADIUS,
  SONGBIRD_CENTER,
  SONGBIRD_GROUND_Y,
  SONGBIRD_PORTAL_POINT,
  STEPPING_PATH_LIST,
} from './songbird-layout'

/**
 * 百囀林苑的細節小景
 *
 * 只有地形 worker 用，排在花之後、傳送門之前。
 * 園子原本是一片均勻的花、幾叢樹、六口飲水盤與十座鳥屋，沒有路，東西之間也沒有關係。
 * 這一輪補的是「有人在這裡養鳥、看鳥」：把幾口飲水盤串起來的飛石小徑、路邊的餵鳥台、
 * 園子南緣的觀鳥小屋、綁在樹幹上的巢箱、飲水盤邊的卵石與棲木、倒木與樹樁，
 * 以及每一叢樹腳下的一圈灌叢（把原本的花換掉，花因此是一塊一塊的，不再鋪滿）。
 *
 * 不加樹葉、不加光源：飛石、灌叢都是換掉原本那一格的花，株數不增
 */

const GRASS_SET = new Set([BlockId.GRASS])

/** 飛石鋪下去的比例：缺的那幾塊讓小徑看起來是一步一步踩的，不是一條帶子 */
const STEPPING_STONE_CHANCE = 0.72

/** 樹腳下的灌叢離樹幹多遠（格） */
const BUSH_RING_RANGE: [number, number] = [1.2, 2.7]

/** 巢箱掛在離地幾格高的樹幹上：三格，人從底下走過去頭上還空著一格多 */
const NEST_BOX_LEVEL = 3

/** 幾棵樹掛巢箱 */
const NEST_BOX_COUNT = 9

function readFootY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/** 鳴禽庭那一組花草：只有這幾種會被灌叢換掉，飛石、卵石與道具不動 */
const FLOWER_SET = new Set<BlockId>([
  BlockId.WILD_GRASS,
  BlockId.TALL_GRASS,
  BlockId.BIG_FLOWER,
  BlockId.FLOWER_ROSE,
  BlockId.FLOWER_VIOLA,
  BlockId.FLOWER_DANDELION,
  BlockId.FLOWER_TULIP,
])

/**
 * 飛石小徑
 *
 * 沿著骨架每一格鋪一塊飛石（七成二），只鋪在草上；飲水盤的石板、鳥屋的柱腳與樹幹自然會讓它斷開。
 * 回程門前七格內不鋪：落腳那幾格（出生點四周）要與原本一樣是空草地
 */
function layStoneLine(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array, random: () => number): void {
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const roll = random()
      if (pathDistanceMap[x * WORLD_SIZE + z]! > 0.62 || roll > STEPPING_STONE_CHANCE)
        continue
      if (measureDistance(x, z, SONGBIRD_PORTAL_POINT) < 7)
        continue
      const footY = readFootY(groundTopMap, x, z)
      if (isFreeGround(state, x, footY, z, GRASS_SET))
        putProp(state, x, footY, z, BlockId.STEPPING_STONE)
    }
  }
}

/**
 * 餵鳥台
 *
 * 兩格高的圍籬柱頂一塊木半磚當盤子，腳邊一簍穀子。位置在骨架旁邊找一格空草地
 */
function placeFeederList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const feeder of FEEDER_LIST) {
    const site = findFreeSite(state, groundTopMap, feeder, 0, 0, GRASS_SET, 3)
    if (!site)
      continue
    clearPlantColumn(state, site.x, site.footY, site.z)
    setBlock(state, site.x, site.footY, site.z, BlockId.FENCE)
    setBlock(state, site.x, site.footY + 1, site.z, BlockId.FENCE)
    setBlock(state, site.x, site.footY + 2, site.z, BlockId.WOOD_SLAB)
    const basketFootY = readFootY(groundTopMap, site.x + 1, site.z)
    if (isFreeGround(state, site.x + 1, basketFootY, site.z, GRASS_SET))
      putProp(state, site.x + 1, basketFootY, site.z, BlockId.BASKET)
  }
}

/**
 * 觀鳥小屋
 *
 * 七格寬、三格深：南面與東西兩面是木板牆，北面朝草地是一道矮牆、一道留空的觀察縫、再一道橫板；
 * 東牆靠北那一格留著當門。屋裡一排朝北的長凳，窗台上一本攤開的觀察筆記，角落一簍穀子。
 * 深色木半磚的頂往外出一格簷。屋裡不點燈：看鳥的人不想被鳥看見
 */
function placeBirdHide(state: Uint8Array, groundTopMap: Uint8Array): void {
  const site = findFreeSite(state, groundTopMap, BIRD_HIDE_POINT, 4, 3, GRASS_SET, 6)
  if (!site)
    return
  const { x, z, footY } = site
  clearPlantArea(state, x - 4, z - 3, x + 4, z + 3, footY)

  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, x + offsetX, footY + level, z + 2, BlockId.PLANKS)
    }
    /** 北面：矮牆、觀察縫、橫板 */
    setBlock(state, x + offsetX, footY, z - 1, BlockId.PLANKS)
    setBlock(state, x + offsetX, footY + 2, z - 1, BlockId.PLANKS)
  }
  for (const offsetX of [-3, 3]) {
    setBlock(state, x + offsetX, footY + 1, z - 1, BlockId.PLANKS)
    for (let level = 0; level < 3; level++) {
      setBlock(state, x + offsetX, footY + level, z + 1, BlockId.PLANKS)
      if (offsetX === -3)
        setBlock(state, x + offsetX, footY + level, z, BlockId.PLANKS)
    }
  }
  setBlock(state, x + 3, footY + 2, z, BlockId.PLANKS)
  for (let offsetX = -4; offsetX <= 4; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 3; offsetZ++) {
      setBlock(state, x + offsetX, footY + 3, z + offsetZ, BlockId.DARK_WOOD_SLAB)
    }
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    setBlock(state, x + offsetX, footY, z + 1, BlockId.WOOD_STAIRS_SOUTH)
  }
  setBlock(state, x, footY + 1, z - 1, BlockId.OPEN_BOOK)
  setBlock(state, x - 2, footY, z + 1, BlockId.BASKET)
  setBlock(state, x + 2, footY, z + 1, BlockId.CRATE)
}

/** 園子裡每一根橡樹幹的位置（只找草地上的那一格樹幹，樹冠裡的不算） */
function collectTrunkList(state: Uint8Array, groundTopMap: Uint8Array): PlanePoint[] {
  const trunkList: PlanePoint[] = []
  for (let x = SONGBIRD_CENTER.x - PARK_RADIUS; x <= SONGBIRD_CENTER.x + PARK_RADIUS; x++) {
    for (let z = SONGBIRD_CENTER.z - PARK_RADIUS; z <= SONGBIRD_CENTER.z + PARK_RADIUS; z++) {
      if (measureDistance(x, z, SONGBIRD_CENTER) > PARK_RADIUS - 2)
        continue
      if (getBlock(state, x, readFootY(groundTopMap, x, z), z) === BlockId.OAK_LOG)
        trunkList.push({ x, z })
    }
  }
  return trunkList
}

/**
 * 樹腳下的灌叢
 *
 * 每一根樹幹四周一圈，原本開著花的格子有六成換成灌叢。花原本是整片均勻的六成六，
 * 換過之後每一叢樹腳下是一圈深綠，花集中在樹與樹之間的草地上
 */
function plantBushRing(state: Uint8Array, groundTopMap: Uint8Array, trunkList: readonly PlanePoint[], random: () => number): void {
  const [ringMin, ringMax] = BUSH_RING_RANGE
  for (let x = SONGBIRD_CENTER.x - PARK_RADIUS; x <= SONGBIRD_CENTER.x + PARK_RADIUS; x++) {
    for (let z = SONGBIRD_CENTER.z - PARK_RADIUS; z <= SONGBIRD_CENTER.z + PARK_RADIUS; z++) {
      const roll = random()
      const footY = readFootY(groundTopMap, x, z)
      if (roll > 0.6 || !FLOWER_SET.has(getBlock(state, x, footY, z)))
        continue
      const distance = measureNearestDistance(x, z, trunkList)
      if (distance < ringMin || distance > ringMax)
        continue
      clearPlantColumn(state, x, footY, z)
      setBlock(state, x, footY, z, BlockId.BUSH)
    }
  }
}

/**
 * 綁在樹幹上的巢箱
 *
 * 鳥屋原本都是立在草地上的同一種柱子。挑九棵樹，在樹幹離地三格高的地方掛一個巢箱（與鳥屋同一塊蜂箱木），
 * 上面壓一片深色木半磚當簷（頭上已經是樹冠的就不加）；掛在哪一側看哪一側空著
 */
function hangNestBoxList(state: Uint8Array, groundTopMap: Uint8Array, trunkList: readonly PlanePoint[], random: () => number): void {
  let placedCount = 0
  for (let attempt = 0; attempt < 80 && placedCount < NEST_BOX_COUNT && trunkList.length > 0; attempt++) {
    const trunk = trunkList[Math.floor(random() * trunkList.length)]!
    const side = Math.floor(random() * 4)
    const offsetX = [1, -1, 0, 0][side]!
    const offsetZ = [0, 0, 1, -1][side]!
    const boxY = readFootY(groundTopMap, trunk.x, trunk.z) + NEST_BOX_LEVEL
    if (getBlock(state, trunk.x, boxY, trunk.z) !== BlockId.OAK_LOG)
      continue
    const x = trunk.x + offsetX
    const z = trunk.z + offsetZ
    if (getBlock(state, x, boxY, z) !== BlockId.AIR || getBlock(state, x, boxY - 1, z) !== BlockId.AIR)
      continue
    setBlock(state, x, boxY, z, BlockId.HIVE)
    /** 矮的樹在這個高度已經是樹冠，頭上那一格是葉子就不加簷 */
    if (getBlock(state, x, boxY + 1, z) === BlockId.AIR)
      setBlock(state, x, boxY + 1, z, BlockId.DARK_WOOD_SLAB)
    placedCount++
  }
}

/**
 * 飲水盤邊的卵石與棲木
 *
 * 石板外面那一圈草地，一半鋪碎石、一成半是小石（都把原本的花換掉）；
 * 盤的一角外面立一根矮樁，是鳥喝完水站上去理毛的地方
 */
function dressBasinList(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  for (const basin of BASIN_LIST) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
        const roll = random()
        if (Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== 2 || roll > 0.65)
          continue
        const x = basin.x + offsetX
        const z = basin.z + offsetZ
        const footY = readFootY(groundTopMap, x, z)
        if (footY !== SONGBIRD_GROUND_Y + 1 || !isFreeGround(state, x, footY, z, GRASS_SET))
          continue
        putProp(state, x, footY, z, roll < 0.15 ? BlockId.SMALL_ROCK : BlockId.PEBBLES)
      }
    }
    const perchX = basin.x - 2
    const perchZ = basin.z - 2
    const perchFootY = readFootY(groundTopMap, perchX, perchZ)
    if (isFreeGround(state, perchX, perchFootY, perchZ, GRASS_SET) || getBlock(state, perchX, perchFootY, perchZ) === BlockId.PEBBLES) {
      setBlock(state, perchX, perchFootY, perchZ, BlockId.WOOD_POST)
    }
  }
}

/**
 * 倒木與樹樁
 *
 * 三截躺在草裡的橡木（三格長，上面長一朵菇）與四個一格高的樹樁，位置在園子裡抽，離飲水盤與鳥屋遠一點
 */
function scatterLogAndStump(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  const keepClearList: PlanePoint[] = [...BASIN_LIST, ...BIRDHOUSE_LIST, SONGBIRD_PORTAL_POINT, BIRD_HIDE_POINT]
  let logCount = 0
  let stumpCount = 0
  for (let attempt = 0; attempt < 200 && (logCount < 3 || stumpCount < 4); attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 8 + random() * (PARK_RADIUS - 12)
    const target = {
      x: Math.round(SONGBIRD_CENTER.x + Math.cos(angle) * radius),
      z: Math.round(SONGBIRD_CENTER.z + Math.sin(angle) * radius),
    }
    const isAlongX = random() < 0.5
    if (measureNearestDistance(target.x, target.z, keepClearList) < 6)
      continue
    if (logCount < 3) {
      const site = findFreeSite(state, groundTopMap, target, isAlongX ? 1 : 0, isAlongX ? 0 : 1, GRASS_SET, 1)
      if (!site)
        continue
      for (let step = -1; step <= 1; step++) {
        putProp(state, site.x + (isAlongX ? step : 0), site.footY, site.z + (isAlongX ? 0 : step), isAlongX ? BlockId.OAK_LOG_X : BlockId.OAK_LOG_Z)
      }
      setBlock(state, site.x, site.footY + 1, site.z, BlockId.BROWN_MUSHROOM)
      keepClearList.push(site)
      logCount++
      continue
    }
    const footY = readFootY(groundTopMap, target.x, target.z)
    if (!isFreeGround(state, target.x, footY, target.z, GRASS_SET))
      continue
    putProp(state, target.x, footY, target.z, BlockId.OAK_LOG)
    keepClearList.push(target)
    stumpCount++
  }
}

/** 補上百囀林苑的細節小景 */
export function decorateSongbird(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('songbird-detail')
  const pathDistanceMap = createPathDistanceMap(STEPPING_PATH_LIST.map((pointList) => samplePathCurve(pointList)), 2)

  /** 有形狀的先蓋，飛石讓它們；灌叢最後換，不會蓋到飛石與卵石 */
  placeBirdHide(state, groundTopMap)
  placeFeederList(state, groundTopMap)
  scatterLogAndStump(state, groundTopMap, random)
  layStoneLine(state, groundTopMap, pathDistanceMap, random)
  dressBasinList(state, groundTopMap, random)

  const trunkList = collectTrunkList(state, groundTopMap)
  hangNestBoxList(state, groundTopMap, trunkList, random)
  plantBushRing(state, groundTopMap, trunkList, random)
}
