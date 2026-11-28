import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { clearPlantColumn, isFreeGround, putProp } from '../realm-prop-kit'
import {
  CHAMBER_RECT,
  CISTERN_RECT,
  COLONNADE_RECT,
  EAST_BREACH_Z,
  HALL_RECT,
  HALL_STELE_POINT,
  MOSAIC_RING_INNER_RADIUS,
  MOSAIC_RING_OUTER_RADIUS,
  RUINS_CENTER,
  RUINS_FOOT_Y,
  RUINS_GROUND_Y,
  RUINS_TERRACE_Y,
  STANDING_STATUE_POINT,
  TOPPLED_STATUE_POINT,
} from './ruins-layout'

/**
 * 石殿遺址的細節小景
 *
 * 只有地形 worker 用，排在花草之後、傳送門之前。
 * 殿裡原本是石板、青苔、積水、柱與牆，尺度都是建築的；人的尺度的東西只有石碑與石燈籠。
 * 這一輪補的是「這裡曾經有人用過」：石碑四周殘存的馬賽克拼花、石室門前一立一倒的兩尊石像與熄了的火盆、
 * 斷柱旁邊掉下來的柱頭、牆根的藤與碎石、長廊南端長了草的石階，
 * 以及大殿東牆塌開的一個口，幾級石階往東通到殿外一座還積著水的蓄水池。
 *
 * 火盆是冷的、池邊不點燈：遺址的真光只有十三盞石燈籠，不再加
 */

/** 殿基上擺得下東西的地面：石板、縫裡的青苔與草、拼花與邊上的石磚 */
const TERRACE_SET = new Set([
  BlockId.STONE_TILE,
  BlockId.MOSSY_COBBLESTONE,
  BlockId.GRASS,
  BlockId.STONE_BRICKS,
  BlockId.MOSAIC_TILE,
  BlockId.MOON_BRICKS,
])

/** 殿外荒地的地面 */
const WASTE_SET = new Set([BlockId.GRASS, BlockId.MOSSY_COBBLESTONE, BlockId.COBBLESTONE])

/** 殿外荒地站著的腳底高度 */
const WASTE_FOOT_Y = RUINS_GROUND_Y + 1

/** 拼花還留著的比例：噪音高於這個值的地方還在，其餘只剩石板 */
const MOSAIC_KEEP_THRESHOLD = -0.18

function pickRubbleBlock(random: () => number): BlockId {
  return random() < 0.4 ? BlockId.MOSSY_COBBLESTONE : BlockId.STONE_BRICKS
}

/** 這一格的石板還沒被青苔、草或積水佔掉，上面也空著，才換成拼花 */
function paveMosaic(state: Uint8Array, x: number, z: number, blockId: BlockId): void {
  if (getBlock(state, x, RUINS_TERRACE_Y, z) !== BlockId.STONE_TILE || getBlock(state, x, RUINS_FOOT_Y, z) !== BlockId.AIR)
    return
  if (fbm2D(x * 0.27 + 41, z * 0.27 - 7, 2, 0.5) < MOSAIC_KEEP_THRESHOLD)
    return
  setBlock(state, x, RUINS_TERRACE_Y, z, blockId)
}

/**
 * 馬賽克拼花
 *
 * 石碑四周一圈三格寬的環：內外兩道陶紅的邊，中間一道陶紅與月白相間的格子；
 * 石室門前再一塊七格寬的方毯，紅邊白心。都只換還完好的石板，裂縫裡的青苔與草、積水照舊，
 * 再用一層噪音挖掉四成，剩下的是一片一片的殘跡
 */
function layMosaic(state: Uint8Array): void {
  const reach = Math.ceil(MOSAIC_RING_OUTER_RADIUS)
  for (let offsetX = -reach; offsetX <= reach; offsetX++) {
    for (let offsetZ = -reach; offsetZ <= reach; offsetZ++) {
      const distance = Math.hypot(offsetX, offsetZ)
      if (distance < MOSAIC_RING_INNER_RADIUS || distance > MOSAIC_RING_OUTER_RADIUS)
        continue
      const band = Math.floor(distance - MOSAIC_RING_INNER_RADIUS)
      const sector = Math.floor((Math.atan2(offsetZ, offsetX) / Math.PI + 1) * 12)
      const blockId = band === 1 && sector % 2 === 0 ? BlockId.MOON_BRICKS : BlockId.MOSAIC_TILE
      paveMosaic(state, HALL_STELE_POINT.x + offsetX, HALL_STELE_POINT.z + offsetZ, blockId)
    }
  }

  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = 1; offsetZ <= 6; offsetZ++) {
      const isBorder = Math.abs(offsetX) === 3 || offsetZ === 1 || offsetZ === 6
      const blockId = isBorder ? BlockId.MOSAIC_TILE : (offsetX + offsetZ) % 2 === 0 ? BlockId.MOON_BRICKS : BlockId.MOSAIC_TILE
      paveMosaic(state, RUINS_CENTER.x + offsetX, HALL_RECT.minZ + offsetZ, blockId)
    }
  }
}

/**
 * 石室門前的石像與火盆
 *
 * 西邊那尊還站著：石磚的座（兩側各墊一塊半磚）、兩格石頭的身、一顆長了青苔的頭，一共四格高，
 * 比人高一個頭。東邊那尊倒了：座上只剩一截腿，身子與頭朝東躺在地上。
 * 門的兩側各一座火盆（石磚座上一口鍋），早就熄了
 */
function placeStatueAndBrazier(state: Uint8Array): void {
  const standing = STANDING_STATUE_POINT
  if (isFreeGround(state, standing.x, RUINS_FOOT_Y, standing.z, TERRACE_SET)) {
    putProp(state, standing.x, RUINS_FOOT_Y, standing.z, BlockId.STONE_BRICKS)
    setBlock(state, standing.x, RUINS_FOOT_Y + 1, standing.z, BlockId.STONE)
    setBlock(state, standing.x, RUINS_FOOT_Y + 2, standing.z, BlockId.STONE)
    setBlock(state, standing.x, RUINS_FOOT_Y + 3, standing.z, BlockId.MOSSY_COBBLESTONE)
    /** 座的兩側各墊一塊半磚，底寬三格；肩上不伸手臂：橫在半空的半磚底下走得過去，卻剛好擦到頭 */
    for (const offsetX of [-1, 1]) {
      if (isFreeGround(state, standing.x + offsetX, RUINS_FOOT_Y, standing.z, TERRACE_SET))
        putProp(state, standing.x + offsetX, RUINS_FOOT_Y, standing.z, BlockId.STONE_SLAB)
    }
    setDecoration(state, standing.x, RUINS_FOOT_Y + 2, standing.z + 1, BlockId.IVY)
  }

  const toppled = TOPPLED_STATUE_POINT
  if (isFreeGround(state, toppled.x, RUINS_FOOT_Y, toppled.z, TERRACE_SET)) {
    putProp(state, toppled.x, RUINS_FOOT_Y, toppled.z, BlockId.STONE_BRICKS)
    setBlock(state, toppled.x, RUINS_FOOT_Y + 1, toppled.z, BlockId.STONE_SLAB)
    for (const [offsetX, offsetZ, blockId] of [
      [2, 1, BlockId.STONE],
      [3, 1, BlockId.STONE],
      [4, 1, BlockId.MOSSY_COBBLESTONE],
      [3, 2, BlockId.STONE_SLAB],
      [1, 0, BlockId.SMALL_ROCK],
    ] as const) {
      if (isFreeGround(state, toppled.x + offsetX, RUINS_FOOT_Y, toppled.z + offsetZ, TERRACE_SET))
        putProp(state, toppled.x + offsetX, RUINS_FOOT_Y, toppled.z + offsetZ, blockId)
    }
  }

  for (const offsetX of [-2, 2]) {
    const x = RUINS_CENTER.x + offsetX
    const z = HALL_RECT.minZ + 1
    if (!isFreeGround(state, x, RUINS_FOOT_Y, z, TERRACE_SET))
      continue
    putProp(state, x, RUINS_FOOT_Y, z, BlockId.STONE_BRICKS)
    setBlock(state, x, RUINS_FOOT_Y + 1, z, BlockId.CAULDRON)
  }
}

/**
 * 掉下來的柱頭
 *
 * 殿裡兩排石柱斷掉的那幾根，倒下去的柱身在靠殿心那一側；柱頭滾到另一側（靠牆），
 * 一塊石磚上面一片半磚，旁邊一顆碎石
 */
function placeFallenCapitalList(state: Uint8Array, random: () => number): void {
  for (const columnX of [HALL_RECT.minX + 10, HALL_RECT.maxX - 10]) {
    const outward = columnX < RUINS_CENTER.x ? -1 : 1
    for (let z = HALL_RECT.minZ + 6; z <= HALL_RECT.maxZ - 6; z += 6) {
      const side = random() < 0.5 ? 1 : -1
      const isBroken = getBlock(state, columnX, RUINS_FOOT_Y, z) !== BlockId.AIR && getBlock(state, columnX, RUINS_FOOT_Y + 5, z) === BlockId.AIR
      const x = columnX + outward * 2
      if (!isBroken || !isFreeGround(state, x, RUINS_FOOT_Y, z + side, TERRACE_SET))
        continue
      putProp(state, x, RUINS_FOOT_Y, z + side, pickRubbleBlock(random))
      setBlock(state, x, RUINS_FOOT_Y + 1, z + side, BlockId.STONE_SLAB)
      if (isFreeGround(state, x + outward, RUINS_FOOT_Y, z, TERRACE_SET))
        putProp(state, x + outward, RUINS_FOOT_Y, z, BlockId.SMALL_ROCK)
    }
  }
}

/**
 * 牆根的藤與碎石
 *
 * 大殿四面牆的內側牆根，一成二的石板爬上地錦；石室南牆外側掛幾株藤。
 * 殿基外緣那一圈荒地上散著從牆上掉下來的石磚、半磚與小石
 */
function scatterWallDebris(state: Uint8Array, random: () => number): void {
  const { minX, maxX, minZ, maxZ } = HALL_RECT
  for (let x = minX + 1; x <= maxX - 1; x++) {
    for (let z = minZ + 1; z <= maxZ - 1; z++) {
      const roll = random()
      const isWallFoot = x === minX + 1 || x === maxX - 1 || z === minZ + 1 || z === maxZ - 1
      if (!isWallFoot || roll > 0.12)
        continue
      if (TERRACE_SET.has(getBlock(state, x, RUINS_TERRACE_Y, z)) && getBlock(state, x, RUINS_FOOT_Y, z) === BlockId.AIR)
        setBlock(state, x, RUINS_FOOT_Y, z, BlockId.GROUND_IVY)
    }
  }

  for (let x = CHAMBER_RECT.minX + 1; x <= CHAMBER_RECT.maxX - 1; x++) {
    const roll = random()
    const level = 2 + Math.floor(random() * 3)
    if (Math.abs(x - RUINS_CENTER.x) <= 2 || roll > 0.45)
      continue
    setDecoration(state, x, RUINS_FOOT_Y + level, CHAMBER_RECT.maxZ + 1, BlockId.IVY)
  }

  /** 殿基外緣往外一到兩格的那一圈 */
  for (let x = minX - 4; x <= maxX + 4; x++) {
    for (let z = CHAMBER_RECT.minZ - 4; z <= COLONNADE_RECT.maxZ + 4; z++) {
      const roll = random()
      const kind = random()
      if (roll > 0.05 || !isFreeGround(state, x, WASTE_FOOT_Y, z, WASTE_SET))
        continue
      /** 只要殿基邊上的：四方兩格內有殿基那一層的石磚 */
      const isBesideTerrace = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) =>
        getBlock(state, x + offsetX!, RUINS_TERRACE_Y, z + offsetZ!) === BlockId.STONE_BRICKS)
      if (!isBesideTerrace)
        continue
      putProp(state, x, WASTE_FOOT_Y, z, kind < 0.3 ? pickRubbleBlock(random) : kind < 0.6 ? BlockId.STONE_SLAB : BlockId.SMALL_ROCK)
    }
  }
}

/**
 * 長廊南端長了草的石階
 *
 * 殿基比荒地高一格，長廊南端原本是一道直上直下的坎。坎外鋪一排半磚當踏階，缺了三成，
 * 缺的地方長出地錦與碎石
 */
function placeColonnadeStep(state: Uint8Array, random: () => number): void {
  const z = COLONNADE_RECT.maxZ + 1
  for (let x = COLONNADE_RECT.minX + 2; x <= COLONNADE_RECT.maxX - 2; x++) {
    const roll = random()
    if (!isFreeGround(state, x, WASTE_FOOT_Y, z, WASTE_SET))
      continue
    putProp(state, x, WASTE_FOOT_Y, z, roll < 0.7 ? BlockId.STONE_SLAB : roll < 0.85 ? BlockId.GROUND_IVY : BlockId.PEBBLES)
  }
}

/**
 * 東牆的缺口與石階
 *
 * 牆在石碑正東那一段塌開三格，殿基邊外一排半磚踏階，兩側各一堆塌下來的石磚；
 * 往東到蓄水池之間，草地裡還看得出幾塊鋪路的石板
 */
function openEastBreach(state: Uint8Array, random: () => number): void {
  const wallX = HALL_RECT.maxX
  for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
    for (let level = 0; level < 9; level++) {
      setBlock(state, wallX, RUINS_FOOT_Y + level, EAST_BREACH_Z + offsetZ, BlockId.AIR)
    }
    /** 貼著缺口內側的藤原本爬在牆上，牆沒了就一起拿掉 */
    for (let level = 0; level < 9; level++) {
      if (getBlock(state, wallX - 1, RUINS_FOOT_Y + level, EAST_BREACH_Z + offsetZ) === BlockId.IVY)
        setBlock(state, wallX - 1, RUINS_FOOT_Y + level, EAST_BREACH_Z + offsetZ, BlockId.AIR)
    }
    clearPlantColumn(state, wallX + 2, WASTE_FOOT_Y, EAST_BREACH_Z + offsetZ)
    if (getBlock(state, wallX + 2, WASTE_FOOT_Y, EAST_BREACH_Z + offsetZ) === BlockId.AIR)
      setBlock(state, wallX + 2, WASTE_FOOT_Y, EAST_BREACH_Z + offsetZ, BlockId.STONE_SLAB)
  }
  for (const [offsetX, offsetZ, height] of [[2, -2, 2], [3, -2, 1], [2, 2, 1], [1, 2, 1]] as const) {
    const x = wallX + offsetX
    const z = EAST_BREACH_Z + offsetZ
    const footY = offsetX === 1 ? RUINS_FOOT_Y : WASTE_FOOT_Y
    clearPlantColumn(state, x, footY, z)
    for (let level = 0; level < height; level++) {
      if (getBlock(state, x, footY + level, z) === BlockId.AIR)
        setBlock(state, x, footY + level, z, pickRubbleBlock(random))
    }
  }

  for (let x = wallX + 3; x < CISTERN_RECT.minX; x++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const z = EAST_BREACH_Z + offsetZ
      if (fbm2D(x * 0.4 + 9, z * 0.4 + 21, 2, 0.5) < 0.02)
        continue
      if (getBlock(state, x, RUINS_GROUND_Y, z) !== BlockId.GRASS || getBlock(state, x, WASTE_FOOT_Y, z) !== BlockId.AIR)
        continue
      setBlock(state, x, RUINS_GROUND_Y, z, BlockId.STONE_TILE)
    }
  }
}

/**
 * 蓄水池殘跡
 *
 * 九格見方：一圈高出地面一格的石緣（斷了幾處，西邊正中留三格的口），裡面七格見方的淺水，池底是青苔圓石。
 * 四角各一截斷柱，水面漂著睡蓮與兩朵蓮，池裡橫著一截倒下來的柱身
 */
function placeCistern(state: Uint8Array, random: () => number): void {
  const { minX, maxX, minZ, maxZ } = CISTERN_RECT
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const roll = random()
      clearPlantColumn(state, x, WASTE_FOOT_Y, z)
      const isRim = x === minX || x === maxX || z === minZ || z === maxZ
      const isCorner = (x === minX || x === maxX) && (z === minZ || z === maxZ)
      if (!isRim) {
        setBlock(state, x, WASTE_FOOT_Y, z, BlockId.AIR)
        setBlock(state, x, RUINS_GROUND_Y, z, BlockId.WATER)
        setBlock(state, x, RUINS_GROUND_Y - 1, z, BlockId.MOSSY_COBBLESTONE)
        continue
      }
      setBlock(state, x, RUINS_GROUND_Y, z, BlockId.STONE_BRICKS)
      const isEntry = x === minX && Math.abs(z - EAST_BREACH_Z) <= 1
      if (isEntry)
        continue
      if (isCorner) {
        const height = 2 + Math.floor(roll * 3)
        for (let level = 0; level < height; level++) {
          setBlock(state, x, WASTE_FOOT_Y + level, z, pickRubbleBlock(random))
        }
        setDecoration(state, x + (x === minX ? 1 : -1), WASTE_FOOT_Y + height - 1, z, BlockId.IVY)
        continue
      }
      if (roll < 0.22)
        continue
      setBlock(state, x, WASTE_FOOT_Y, z, roll < 0.4 ? BlockId.STONE_SLAB : pickRubbleBlock(random))
    }
  }

  /** 倒在池裡的柱身，南北向三格 */
  for (let offsetZ = 0; offsetZ <= 2; offsetZ++) {
    setBlock(state, maxX - 2, RUINS_GROUND_Y, minZ + 2 + offsetZ, BlockId.MOSSY_COBBLESTONE)
    setBlock(state, maxX - 2, WASTE_FOOT_Y, minZ + 2 + offsetZ, BlockId.STONE_BRICKS)
  }
  for (const [offsetX, offsetZ, blockId] of [
    [2, 2, BlockId.LILY_PAD],
    [3, 5, BlockId.LILY_PAD],
    [1, 6, BlockId.LILY_PAD],
    [4, 3, BlockId.LOTUS],
    [5, 6, BlockId.LILY_PAD],
    [2, 4, BlockId.LOTUS],
  ] as const) {
    setDecoration(state, minX + offsetX, WASTE_FOOT_Y, minZ + offsetZ, blockId)
  }
}

/** 補上石殿遺址的細節小景 */
export function decorateRuins(state: Uint8Array): void {
  const random = createSeededRandom('ruins-detail')

  layMosaic(state)
  placeStatueAndBrazier(state)
  placeFallenCapitalList(state, random)
  openEastBreach(state, random)
  placeCistern(state, random)
  scatterWallDebris(state, random)
  placeColonnadeStep(state, random)
}
