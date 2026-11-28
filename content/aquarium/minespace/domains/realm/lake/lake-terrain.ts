import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  carveWater,
  fillBox,
  getNoisyDistance,
  pickOne,
  placeBonsaiPine,
  placeStandingStone,
  placeStoneLantern,
  plantWithStack,
  scatterOnGround,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { findTopSolidY, isNextToWater, isWaterSurface } from '../realm-terrain-kit'
import { placeLakeSetPieceList, scatterLakeDetail } from './lake-detail'
import {
  BEACH_WIDTH,
  BOARDWALK,
  DEEP_FLOOR_Y,
  ISLAND_GROUND_Y,
  ISLAND_POND_RADIUS,
  ISLAND_RADIUS,
  LAKE_CENTER,
  LAKE_PORTAL_POINT,
  LAKE_WATER_Y,
  measureShoreDistance,
  SHALLOW_WIDTH,
} from './lake-layout'
import { LAKE_REALM } from './lake-realm'

/**
 * 湖中島的地形
 *
 * 只有地形 worker 用。整座島照水鏡池（buildPondGarden）放大：
 * 水鏡池是白沙上一方高一格的草地木座，木座中央挖一池水，池裡一條斜斜的半磚木棧，
 * 盡頭木柱頂一盞紙燈，岸邊一顆青苔立石、一棵盆景松、一盞石燈籠，花草是紙莎草、高草、蕨與堇。
 * 這裡把木座換成湖心一座高出湖面一格的草島，其餘一樣一樣照搬，只是多擺幾份。
 *
 * 順序有講究：先有地形與水，木棧與燈柱才蓋得上去；花草最後撒，
 * 傳送門排在花草之後，門洞與木牌前面那幾格要清乾淨
 */

/** 草地上偶爾隆起一格的小丘，整座島不至於是一塊平板 */
const MOUND_THRESHOLD = 0.22

/** 找地面時從這一層往下找：比島上最高的小丘再高幾格 */
const LAKE_SCAN_TOP_Y = ISLAND_GROUND_Y + 8

const GRASS_SET = new Set([BlockId.GRASS])
const MEADOW_LIST = [BlockId.TALL_GRASS, BlockId.TALL_GRASS, BlockId.FERN, BlockId.FERN, BlockId.FLOWER_VIOLA] as const

/**
 * 草地上這一格要不要隆起一格
 *
 * 池邊與門前都不隆：池岸要與水面齊平，水才像是挖進草地裡的；
 * 門前隆起的話門柱會一高一低，落地的人也可能卡在坎上
 */
function isMound(x: number, z: number): boolean {
  const pondDistance = Math.hypot(x - LAKE_CENTER.x, z - LAKE_CENTER.z)
  if (pondDistance < ISLAND_POND_RADIUS + 6)
    return false
  if (Math.hypot(x - LAKE_PORTAL_POINT.x, z - LAKE_PORTAL_POINT.z) < 7)
    return false
  if (measureShoreDistance(x, z) > ISLAND_RADIUS - BEACH_WIDTH - 2)
    return false
  return fbm2D(x * 0.09 + 17, z * 0.09 - 5, 2, 0.5) > MOUND_THRESHOLD
}

/**
 * 湖底某一格柱的頂面高度
 *
 * 岸邊一圈淺灘清澈見底，過了淺灘一段斜坡下到深水。
 * 斜坡吃一點噪音，坡面才不是一圈一圈的同心台階
 */
function measureFloorTopY(x: number, z: number, offshore: number): number {
  if (offshore < 3)
    return LAKE_WATER_Y - 1
  if (offshore < SHALLOW_WIDTH)
    return LAKE_WATER_Y - 2

  /** 到底之後是平的：深水的湖底不畫方塊，由一整片平面代替（見 LAKE_BED） */
  const bump = Math.round(fbm2D(x * 0.08, z * 0.08, 2, 0.5) * 1.2)
  const slope = LAKE_WATER_Y - 2 - Math.floor((offshore - SHALLOW_WIDTH) * 0.6) + bump
  return Math.max(DEEP_FLOOR_Y, Math.min(LAKE_WATER_Y - 2, slope))
}

/**
 * 湖底的質地：淺灘是亮的細沙（焦散才看得清楚），越深越暗，
 * 到了最深的那一層換成不畫的 LAKE_BED
 */
function pickFloorBlock(offshore: number, floorY: number, random: () => number): BlockId {
  if (floorY <= DEEP_FLOOR_Y)
    return BlockId.LAKE_BED
  if (offshore < SHALLOW_WIDTH - 2)
    return BlockId.SAND
  if (offshore < SHALLOW_WIDTH + 4)
    return random() < 0.5 ? BlockId.SAND : BlockId.GRAVEL
  return random() < 0.7 ? BlockId.CLAY : BlockId.GRAVEL
}

/** 島身、沙灘、淺灘與深水 */
function shapeTerrain(state: Uint8Array): void {
  const random = createSeededRandom('lake-terrain')

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const distance = measureShoreDistance(x, z)

      if (distance < ISLAND_RADIUS) {
        const isBeach = distance >= ISLAND_RADIUS - BEACH_WIDTH
        const topY = isBeach
          ? LAKE_WATER_Y
          : ISLAND_GROUND_Y + (isMound(x, z) ? 1 : 0)

        for (let y = 1; y < topY - 2; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        for (let y = Math.max(1, topY - 2); y < topY; y++) {
          setBlock(state, x, y, z, isBeach ? BlockId.SAND : BlockId.DIRT)
        }
        setBlock(state, x, topY, z, isBeach ? BlockId.SAND : BlockId.GRASS)
        continue
      }

      const offshore = distance - ISLAND_RADIUS
      const floorY = measureFloorTopY(x, z, offshore)
      for (let y = 1; y < floorY; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      setBlock(state, x, floorY, z, pickFloorBlock(offshore, floorY, random))
      for (let y = floorY + 1; y <= LAKE_WATER_Y; y++) {
        setBlock(state, x, y, z, BlockId.WATER)
      }
    }
  }
}

/**
 * 島中央的那一池水
 *
 * 與水鏡池同一個做法（carveWater）：往下挖、黏土鋪底，水面與草地齊平。
 * 岸線同樣吃噪音；深的地方不在正中央，偏在西北的一窪
 */
function carvePond(state: Uint8Array): void {
  const { x: centerX, z: centerZ } = LAKE_CENTER
  const reach = ISLAND_POND_RADIUS + 4

  for (let x = centerX - reach; x <= centerX + reach; x++) {
    for (let z = centerZ - reach; z <= centerZ + reach; z++) {
      if (getNoisyDistance(x, z, centerX, centerZ, 0.13, 3) > ISLAND_POND_RADIUS)
        continue

      const isDeep = getNoisyDistance(x, z, centerX - 3, centerZ - 2, 0.2, 2) < 4.5
      carveWater(state, x, ISLAND_GROUND_Y, z, isDeep ? 3 : 2, BlockId.CLAY)
    }
  }
}

/**
 * 一根紙燈的木柱
 *
 * 水鏡池那盞是一格木板頂著紙燈。這裡的柱子若立在水裡，從池底一路疊上來，
 * 不然從岸上斜看過去是一塊木板浮在水面上
 */
function placeLampPost(state: Uint8Array, x: number, z: number): void {
  for (let y = findTopSolidY(state, x, z, LAKE_SCAN_TOP_Y) + 1; y <= BOARDWALK.deckY; y++) {
    setBlock(state, x, y, z, BlockId.PLANKS)
  }
  setBlock(state, x, BOARDWALK.deckY + 1, z, BlockId.PAPER_LAMP)
}

/**
 * 池裡的半磚木棧
 *
 * 水鏡池那條是兩排半磚、每一步往東北挪一格，從南岸斜斜伸進水裡。
 * 這裡照搬，步數加倍；盡頭一根木柱頂紙燈，半途的東南側再一根，夜裡沿著兩點光走到池心
 */
function buildBoardwalk(state: Uint8Array): void {
  const startX = LAKE_CENTER.x + BOARDWALK.startOffsetX
  const startZ = LAKE_CENTER.z + BOARDWALK.startOffsetZ

  for (let step = 0; step < BOARDWALK.stepCount; step++) {
    const x = startX + step
    for (const z of [startZ - step, startZ - step - 1]) {
      /** 岸上那幾步若遇到隆起的地就讓它，人從草地直接走上來 */
      if (findTopSolidY(state, x, z, LAKE_SCAN_TOP_Y) >= BOARDWALK.deckY)
        continue

      setBlock(state, x, BOARDWALK.deckY, z, BlockId.WOOD_SLAB)
      for (let y = BOARDWALK.deckY + 1; y <= BOARDWALK.deckY + 3; y++) {
        setBlock(state, x, y, z, BlockId.AIR)
      }
    }
  }

  const lastStep = BOARDWALK.stepCount - 1
  placeLampPost(state, startX + lastStep, startZ - lastStep)
  /** 半途那根立在木棧外側（東南），不擋路 */
  const middleStep = Math.floor(BOARDWALK.stepCount / 2)
  placeLampPost(state, startX + middleStep + 1, startZ - middleStep + 1)
}

/**
 * 島上的松、石與燈籠
 *
 * 水鏡池是一棵盆景松、一顆青苔立石、一盞石燈籠，都貼著池岸，倒影落在水裡。
 * 這裡各多擺幾份：池邊的照水鏡池的相對位置放大，其餘散在草地上，從湖上看過來撐起島的輪廓。
 * 只種盆景松，不種大樹：大樹一棵就比整池水還高，島的比例就不是箱庭了
 */
function placeGardenPieceList(state: Uint8Array): void {
  const at = (offsetX: number, offsetZ: number) => {
    const x = LAKE_CENTER.x + offsetX
    const z = LAKE_CENTER.z + offsetZ
    const topY = findTopSolidY(state, x, z, LAKE_SCAN_TOP_Y)
    /** 只擺在草地上：落在池裡或沙灘上的就略過 */
    const isOnGrass = getBlock(state, x, topY, z) === BlockId.GRASS
    return { x, z, groundY: topY + 1, isOnGrass }
  }

  for (const pine of [
    { x: -13, z: 9, leanX: 1, leanZ: 0 },
    { x: 15, z: -9, leanX: -1, leanZ: 0 },
    { x: -14, z: -11, leanX: 0, leanZ: 1 },
    { x: 9, z: 17, leanX: 0, leanZ: -1 },
  ]) {
    const point = at(pine.x, pine.z)
    if (point.isOnGrass) {
      placeBonsaiPine(state, point.x, point.groundY, point.z, pine.leanX, pine.leanZ)
    }
  }

  for (const stone of [
    { x: -13, z: -3, height: 3 },
    { x: 17, z: 5, height: 2 },
    { x: -6, z: 17, height: 2 },
  ]) {
    const point = at(stone.x, stone.z)
    if (point.isOnGrass) {
      placeStandingStone(state, point.x, point.groundY, point.z, stone.height, BlockId.MOSSY_COBBLESTONE)
    }
  }

  for (const lantern of [
    { x: 8, z: -12 },
    /** 回程的門東側，夜裡從池子望回去，門就在這盞燈旁邊 */
    { x: LAKE_PORTAL_POINT.x - LAKE_CENTER.x + 4, z: LAKE_PORTAL_POINT.z - LAKE_CENTER.z + 1 },
  ]) {
    const point = at(lantern.x, lantern.z)
    if (point.isOnGrass) {
      placeStoneLantern(state, point.x, point.groundY, point.z)
    }
  }
}

/**
 * 花草
 *
 * 紙莎草只長在貼著水的那一圈（池岸與湖岸）；高草、蕨與堇撒在草地上，比水鏡池稀一點，
 * 島大了，撒得一樣密會變成一整片雜草
 */
function scatterPlantList(state: Uint8Array): void {
  const random = createSeededRandom('lake-plant')
  const { x: centerX, z: centerZ } = LAKE_CENTER

  for (let x = centerX - ISLAND_RADIUS - 4; x <= centerX + ISLAND_RADIUS + 4; x++) {
    for (let z = centerZ - ISLAND_RADIUS - 4; z <= centerZ + ISLAND_RADIUS + 4; z++) {
      const topY = findTopSolidY(state, x, z, LAKE_SCAN_TOP_Y)
      const topBlock = getBlock(state, x, topY, z)
      if (topBlock !== BlockId.GRASS && topBlock !== BlockId.SAND)
        continue
      if (getBlock(state, x, topY + 1, z) !== BlockId.AIR)
        continue

      /** 池水與草地同高，湖水比沙灘矮一點：兩種岸都看同一層 */
      const isShore = isNextToWater(state, x, topY, z) || isNextToWater(state, x, topY - 1, z)
      if (isShore && random() < 0.45) {
        plantWithStack(state, x, topY + 1, z, BlockId.PAPYRUS, random)
      }
    }
  }

  /** 草地上的高草、蕨與堇；小丘高一格，分兩層撒 */
  for (const groundY of [ISLAND_GROUND_Y + 1, ISLAND_GROUND_Y + 2]) {
    scatterOnGround(state, centerX, centerZ, ISLAND_RADIUS, groundY, random, 0.16, (pick) => pickOne(pick, MEADOW_LIST), GRASS_SET)
  }
}

/**
 * 睡蓮
 *
 * 池裡用低頻噪音決定哪裡成叢，均勻撒開的睡蓮看起來像一張貼紙；
 * 外面的湖只在淺灘零星幾叢
 */
function scatterLilyPadList(state: Uint8Array): void {
  const random = createSeededRandom('lake-lily')
  const reach = ISLAND_RADIUS + SHALLOW_WIDTH

  for (let x = LAKE_CENTER.x - reach; x <= LAKE_CENTER.x + reach; x++) {
    for (let z = LAKE_CENTER.z - reach; z <= LAKE_CENTER.z + reach; z++) {
      const clump = fbm2D(x * 0.12 + 41, z * 0.12 - 13, 2, 0.5)

      if (isWaterSurface(state, x, ISLAND_GROUND_Y, z)) {
        if (clump > 0.05 && random() < 0.4) {
          setDecoration(state, x, ISLAND_GROUND_Y + 1, z, BlockId.LILY_PAD)
        }
        continue
      }

      if (isWaterSurface(state, x, LAKE_WATER_Y, z) && clump > 0.32 && random() < 0.14) {
        setDecoration(state, x, LAKE_WATER_Y + 1, z, BlockId.LILY_PAD)
      }
    }
  }
}

/** 生成整座湖中島 */
export function generateLakeWorld(state: Uint8Array): void {
  shapeTerrain(state)
  carvePond(state)
  buildBoardwalk(state)
  placeGardenPieceList(state)
  /** 細節的造景零件排在花草之前，位置才是空的（見 lake-detail） */
  placeLakeSetPieceList(state)
  scatterPlantList(state)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of LAKE_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  scatterLilyPadList(state)
  /** 地被排在最後：蓮只換已經有睡蓮的格子，其餘只落在還空著的地面 */
  scatterLakeDetail(state)
}
