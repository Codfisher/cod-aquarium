import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  fillBox,
  pickOne,
  placeAcaciaTree,
  placeSmallBoat,
  placeStoneLantern,
  placeTorii,
  plantWithStack,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { findTopSolidY } from '../realm-terrain-kit'
import {
  COAST_CENTER,
  COAST_PORTAL_POINT,
  DUNE_GROUND_Y,
  measureCoastShoreDistance,
  REEF_WIDTH,
  SAND_ISLAND_RADIUS,
  SEA_FLOOR_Y,
  SEA_TORII_POINT,
  SEA_WATER_Y,
  TIDAL_FLAT_WIDTH,
} from './coast-layout'
import { COAST_REALM } from './coast-realm'

/**
 * 海中沙島的地形
 *
 * 只有地形 worker 用。整座島照潮汐磯（buildCoastGarden）放大：
 * 潮汐磯是一方沙地木座，一道被潮水磨彎的岸線，水底是沙與珊瑚，
 * 沙上兩棵被海風壓扁的相思樹、一排順著岸躺的漂流木、一艘擱淺的小舟、
 * 耐旱的枯灌叢、乾草與石生植物、一盞石燈籠與一座鳥居。
 * 這裡把木座換成大海中央的一座沙島，其餘一樣一樣照搬，只是多擺幾份。
 * 沒有竹子：PAPYRUS 的貼圖其實是竹稈（見 buildCoastGarden 那一段），海邊不種。
 *
 * 順序有講究：先有地形與水，鳥居、樹與船才蓋得上去；花草最後撒，
 * 傳送門排在花草之後，門洞與木牌前面那幾格要清乾淨
 */

/** 找地面時從這一層往下找：比最高的沙丘再高幾格，相思樹的樹冠不會被當成地面 */
const COAST_SCAN_TOP_Y = DUNE_GROUND_Y + 3

const SAND_SET = new Set([BlockId.SAND])
const CORAL_LIST = [BlockId.CORAL_ORANGE, BlockId.CORAL_BROWN, BlockId.CORAL_SKELETON] as const

/**
 * 門前幾格內不隆起
 *
 * 門前隆起的話門柱會一高一低，落地的人也可能卡在坎上；
 * 再放寬到十一格，人一落地往南看是整座島，而不是貼著臉的一道沙坎
 */
const DUNE_PORTAL_CLEARANCE = 11

/**
 * 沙地上這一格隆起幾格（零到二）
 *
 * 島中間一道低低的沙丘脊，風把沙堆在背風的那一側。
 * 灘邊與門前都不隆：灘要與海面齊平，潮水才漫得上來
 */
function measureDuneHeight(x: number, z: number, shoreDistance: number): number {
  if (shoreDistance > SAND_ISLAND_RADIUS - TIDAL_FLAT_WIDTH - 2)
    return 0
  if (Math.hypot(x - COAST_PORTAL_POINT.x, z - COAST_PORTAL_POINT.z) < DUNE_PORTAL_CLEARANCE)
    return 0

  const dune = fbm2D(x * 0.08 - 23, z * 0.11 + 9, 2, 0.5) + (SAND_ISLAND_RADIUS - TIDAL_FLAT_WIDTH - shoreDistance) * 0.03
  if (dune > 0.5)
    return 2
  return dune > 0.18 ? 1 : 0
}

/**
 * 灘上的潮池
 *
 * 潮水退了之後留在灘上的一窪一窪水，潮汐磯「看得出潮水來過又退了」的那個意思。
 * 只挖在灘的中間那一圈，貼著海或貼著沙地的話就只是岸線多一個缺口
 */
function isTidePool(x: number, z: number, shoreDistance: number): boolean {
  const flatDepth = SAND_ISLAND_RADIUS - shoreDistance
  if (flatDepth < 1 || flatDepth > TIDAL_FLAT_WIDTH - 1)
    return false
  if (Math.hypot(x - COAST_PORTAL_POINT.x, z - COAST_PORTAL_POINT.z) < 8)
    return false
  return fbm2D(x * 0.3 + 57, z * 0.3 - 11, 2, 0.5) > 0.42
}

/**
 * 海底某一格柱的頂面高度
 *
 * 岸邊兩格只有一格深的沙底，接著兩格深、三格深、四格深的珊瑚淺海，
 * 過了淺海一段斜坡下到深海。斜坡吃一點噪音，坡面才不是一圈一圈的同心台階
 */
function measureFloorTopY(x: number, z: number, offshore: number): number {
  if (offshore < 2)
    return SEA_WATER_Y - 1
  if (offshore < 7)
    return SEA_WATER_Y - 2
  if (offshore < 12)
    return SEA_WATER_Y - 3

  const bump = Math.round(fbm2D(x * 0.09 + 5, z * 0.09, 2, 0.5) * 1.2)
  if (offshore < REEF_WIDTH)
    return SEA_WATER_Y - 4 + Math.max(0, bump)

  /** 到底之後是平的：深海的海底不畫方塊，由一整片平面代替（見 LAKE_BED） */
  const slope = SEA_WATER_Y - 4 - Math.floor((offshore - REEF_WIDTH) * 0.5) + bump
  return Math.max(SEA_FLOOR_Y, Math.min(SEA_WATER_Y - 4, slope))
}

/** 珊瑚成叢的地方：低頻噪音，均勻撒開的珊瑚像一張貼紙 */
function measureCoralClump(x: number, z: number): number {
  return fbm2D(x * 0.14 + 71, z * 0.14 - 37, 3, 0.5)
}

/**
 * 海底的質地與珊瑚
 *
 * 一格深的地方只有沙；兩格深開始零星的珊瑚（與潮汐磯池底那幾塊一樣是鋪在底床上的），
 * 三格深以上成叢的地方再長出一兩格高的珊瑚頭，從岸上低頭看得到一塊一塊的橘與褐。
 * 到了最深的那一層換成不畫的 LAKE_BED
 */
function placeSeaFloor(state: Uint8Array, x: number, z: number, floorY: number, random: () => number): void {
  if (floorY <= SEA_FLOOR_Y) {
    setBlock(state, x, floorY, z, BlockId.LAKE_BED)
    return
  }

  const depth = SEA_WATER_Y - floorY
  const clump = measureCoralClump(x, z)
  const coralChance = depth >= 3 ? 0.55 : 0.18
  const isCoral = depth >= 2 && clump > 0.08 && random() < coralChance
  setBlock(state, x, floorY, z, isCoral ? pickOne(random, CORAL_LIST) : BlockId.SAND)

  /** 珊瑚頭最高長到水面下一格，游過去會撞到，卻不會冒出水面 */
  if (isCoral && depth >= 3 && clump > 0.22 && random() < 0.5) {
    const headHeight = depth >= 4 && random() < 0.4 ? 2 : 1
    for (let level = 1; level <= headHeight; level++) {
      setBlock(state, x, floorY + level, z, pickOne(random, CORAL_LIST))
    }
  }
}

/** 島身、灘、潮池、珊瑚淺海與深海 */
function shapeTerrain(state: Uint8Array): void {
  const random = createSeededRandom('coast-terrain')

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const distance = measureCoastShoreDistance(x, z)

      if (distance < SAND_ISLAND_RADIUS) {
        const isFlat = distance >= SAND_ISLAND_RADIUS - TIDAL_FLAT_WIDTH
        const topY = isFlat ? SEA_WATER_Y : DUNE_GROUND_Y + measureDuneHeight(x, z, distance)

        for (let y = 1; y < topY - 3; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        for (let y = Math.max(1, topY - 3); y <= topY; y++) {
          setBlock(state, x, y, z, BlockId.SAND)
        }
        if (isFlat && isTidePool(x, z, distance)) {
          setBlock(state, x, topY, z, BlockId.WATER)
        }
        continue
      }

      const offshore = distance - SAND_ISLAND_RADIUS
      const floorY = measureFloorTopY(x, z, offshore)
      for (let y = 1; y < floorY; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      placeSeaFloor(state, x, z, floorY, random)
      for (let y = floorY + 1; y <= SEA_WATER_Y; y++) {
        if (getBlock(state, x, y, z) === BlockId.AIR) {
          setBlock(state, x, y, z, BlockId.WATER)
        }
      }
    }
  }
}

/**
 * 淺海裡的鳥居
 *
 * 潮汐磯那座：七格寬、五格高（placeTorii 的 halfWidth 3、height 5）。
 * 柱腳從海底立起來，石礎就是那一格海底，水面以上露出三格多的柱子與兩道橫樑
 */
function placeSeaTorii(state: Uint8Array): void {
  const { x, z } = SEA_TORII_POINT
  const floorY = findTopSolidY(state, x, z, SEA_WATER_Y)
  placeTorii(state, x, floorY + 1, z, true, 3, 5)
}

/** 這一格柱頂上那一格的位置與地表，造景零件擺之前先問 */
function measureGround(state: Uint8Array, x: number, z: number): { groundY: number; topBlock: BlockId; isOpen: boolean } {
  const topY = findTopSolidY(state, x, z, COAST_SCAN_TOP_Y)
  return {
    groundY: topY + 1,
    topBlock: getBlock(state, x, topY, z),
    isOpen: getBlock(state, x, topY + 1, z) === BlockId.AIR,
  }
}

/**
 * 被海風壓扁的相思樹
 *
 * 潮汐磯兩棵，這裡三棵，都立在沙丘上：樹冠攤成一片，
 * 從回程門往北看，左右各一棵框住島中間，第三棵在東邊的沙丘頂
 */
function placeAcaciaList(state: Uint8Array): void {
  for (const tree of [
    { x: -9, z: -3, trunkHeight: 4 },
    { x: 7, z: -6, trunkHeight: 5 },
    { x: 11, z: 3, trunkHeight: 3 },
  ]) {
    const x = COAST_CENTER.x + tree.x
    const z = COAST_CENTER.z + tree.z
    const ground = measureGround(state, x, z)
    if (ground.topBlock === BlockId.SAND && ground.groundY > DUNE_GROUND_Y) {
      placeAcaciaTree(state, x, ground.groundY, z, tree.trunkHeight)
    }
  }
}

/**
 * 從島心沿某個方位往外走，灘中間那一格
 *
 * 漂流木與小舟都躺在灘上：潮水把它們推上來，又退回去
 */
function findTidalFlatPoint(degree: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  const directionX = Math.cos(radian)
  const directionZ = Math.sin(radian)
  const target = SAND_ISLAND_RADIUS - TIDAL_FLAT_WIDTH / 2
  for (let step = 0; step < SAND_ISLAND_RADIUS * 2; step += 0.5) {
    const x = Math.round(COAST_CENTER.x + directionX * step)
    const z = Math.round(COAST_CENTER.z + directionZ * step)
    if (measureCoastShoreDistance(x, z) >= target)
      return { x, z }
  }
  return { x: COAST_CENTER.x, z: COAST_CENTER.z }
}

/**
 * 漂流木
 *
 * 潮汐磯是一排六格、順著岸線躺。這裡繞著島的灘撒幾根，
 * 長短不一，每一根都順著那一段岸的走向：島的東西兩端岸線是南北向，躺的就是 Z 向的木頭
 */
function placeDriftwoodList(state: Uint8Array): void {
  for (const log of [
    { degree: 200, length: 5 },
    { degree: 245, length: 3 },
    { degree: 300, length: 4 },
    { degree: 20, length: 4 },
    { degree: 160, length: 3 },
  ]) {
    const point = findTidalFlatPoint(log.degree)
    const radian = (log.degree / 180) * Math.PI
    /** 岸線的切線與半徑垂直：半徑偏東西，岸就是南北向 */
    const isAlongZ = Math.abs(Math.cos(radian)) > Math.abs(Math.sin(radian))
    const start = -Math.floor(log.length / 2)
    for (let step = start; step < start + log.length; step++) {
      const x = point.x + (isAlongZ ? 0 : step)
      const z = point.z + (isAlongZ ? step : 0)
      const ground = measureGround(state, x, z)
      /** 只躺在乾的灘上：碰到潮池或沙丘的坎就斷在那裡 */
      if (ground.topBlock !== BlockId.SAND || ground.groundY !== SEA_WATER_Y + 1 || !ground.isOpen)
        continue
      setDecoration(state, x, ground.groundY, z, isAlongZ ? BlockId.DEAD_LOG_Z : BlockId.DEAD_LOG_X)
    }
  }
}

/**
 * 擱淺的小舟
 *
 * 與潮汐磯同一艘（placeSmallBoat），躺在島東端的灘上，船身順著那一段岸（南北向）。
 * 船底那一格若是潮池的水就填回沙：船是被沖上沙灘的，不是浮在水窪裡
 */
function placeBoat(state: Uint8Array): void {
  const point = findTidalFlatPoint(8)
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      if (getBlock(state, point.x + offsetX, SEA_WATER_Y, point.z + offsetZ) === BlockId.WATER
        && measureCoastShoreDistance(point.x + offsetX, point.z + offsetZ) < SAND_ISLAND_RADIUS) {
        setBlock(state, point.x + offsetX, SEA_WATER_Y, point.z + offsetZ, BlockId.SAND)
      }
    }
  }
  placeSmallBoat(state, point.x, SEA_WATER_Y + 1, point.z, false)
}

/**
 * 石燈籠
 *
 * 潮汐磯一盞在木座一角。這裡一盞在回程門東側（夜裡回頭找門就靠它），
 * 一盞在西邊那棵相思樹下，從海上看過來是島上唯一的一點光
 */
function placeLanternList(state: Uint8Array): void {
  for (const lantern of [
    { x: COAST_PORTAL_POINT.x + 4, z: COAST_PORTAL_POINT.z + 1 },
    { x: COAST_CENTER.x - 6, z: COAST_CENTER.z - 6 },
  ]) {
    const ground = measureGround(state, lantern.x, lantern.z)
    if (ground.topBlock === BlockId.SAND && ground.isOpen) {
      placeStoneLantern(state, lantern.x, ground.groundY, lantern.z)
    }
  }
}

/**
 * 花草：枯灌叢、乾草與石生植物
 *
 * 與潮汐磯同一組、同一個比例。沙地上照潮汐磯的密度撒，
 * 灘上潮水一天漫兩次，只零星幾株
 */
function scatterPlantList(state: Uint8Array): void {
  const random = createSeededRandom('coast-plant')
  const reach = SAND_ISLAND_RADIUS + 6

  for (let x = COAST_CENTER.x - reach; x <= COAST_CENTER.x + reach; x++) {
    for (let z = COAST_CENTER.z - reach; z <= COAST_CENTER.z + reach; z++) {
      const ground = measureGround(state, x, z)
      if (!SAND_SET.has(ground.topBlock) || !ground.isOpen)
        continue

      const isFlat = ground.groundY === SEA_WATER_Y + 1
      if (random() > (isFlat ? 0.03 : 0.14))
        continue

      const roll = random()
      const blockId = roll < 0.5
        ? BlockId.DRY_SHRUB
        : roll < 0.8 ? BlockId.DRY_GRASS : BlockId.STONE_PLANT
      plantWithStack(state, x, ground.groundY, z, blockId, random)
    }
  }
}

/** 生成整座海中沙島 */
export function generateCoastWorld(state: Uint8Array): void {
  shapeTerrain(state)
  placeSeaTorii(state)
  placeAcaciaList(state)
  placeBoat(state)
  placeDriftwoodList(state)
  placeLanternList(state)
  scatterPlantList(state)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of COAST_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
