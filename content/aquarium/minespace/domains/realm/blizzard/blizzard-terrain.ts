import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BLOCK_DEFS, BlockId, isDecorationBlock, isPassableBlock } from '../../block/block-constants'
import {
  fillBox,
  placeBonsaiPine,
  placeStandingStone,
  placeStoneLantern,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { decorateBlizzard } from './blizzard-details'
import {
  BLIZZARD_CENTER,
  BLIZZARD_EDGE_RADIUS,
  BLIZZARD_GROUND_Y,
  BLIZZARD_PORTAL_POINT,
  DRIFT_WALL_START_RADIUS,
  HEART_FLAT_RADIUS,
  PORTAL_FLAT_RADIUS,
  POST_TRAIL_POINT_LIST,
} from './blizzard-layout'
import { BLIZZARD_REALM } from './blizzard-realm'

/**
 * 白矇雪原的地形
 *
 * 只有地形 worker 用。照吹雪野（buildBlizzardGarden）放大：雪地、順著風拖出去的一道道薄雪、
 * 石燈籠、一律往西歪的矮松、極少的石頭、零星曬白的枯枝，最後替所有東西蓋上一層雪。
 * 吹雪野拿掉過小屋與雪吊り（有體積的東西一出現就把「什麼都看不到」擋住），這裡也不蓋。
 *
 * 多出來的只有雪原大了才需要的兩樣：風把雪堆成的雪丘（一格半磚一格半磚地堆，走得上去），
 * 以及從門前往南插進白裡的一排木樁——白矇裡唯一的路。燈籠有一半被雪埋到只剩燈室。
 * 順序：雪地與雪丘 → 薄雪紋 → 正中那一方、燈籠、木樁、松、石、枯枝 → 蓋雪 → 傳送門
 */

const CENTER_X = BLIZZARD_CENTER.x
const CENTER_Z = BLIZZARD_CENTER.z

/** 雪的方塊：蓋雪時這些已經是雪，不再疊一層 */
const SNOW_BLOCK_SET = new Set<BlockId>([BlockId.SNOW, BlockId.SNOW_BLOCK, BlockId.SNOW_SLAB, BlockId.SNOW_LAYER])

/** 細樁不蓋雪：一片全寬的薄雪浮在細樁頂上，像一張紙插在竹籤上 */
const UNCAPPED_BLOCK_SET = new Set<BlockId>([BlockId.WOOD_POST, BlockId.FENCE, BlockId.ICE, BlockId.PACKED_ICE])

function measureDistance(x: number, z: number, point: { x: number; z: number }): number {
  return Math.hypot(x - point.x, z - point.z)
}

/** 木樁那條路上取點：骨架之間每格一點 */
function sampleTrail(): { x: number; z: number }[] {
  const pointList: { x: number; z: number }[] = []
  for (let index = 0; index < POST_TRAIL_POINT_LIST.length - 1; index++) {
    const from = POST_TRAIL_POINT_LIST[index]!
    const to = POST_TRAIL_POINT_LIST[index + 1]!
    const length = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z))
    for (let step = 0; step < length; step++) {
      const ratio = step / length
      pointList.push({
        x: CENTER_X + from.x + (to.x - from.x) * ratio,
        z: CENTER_Z + from.z + (to.z - from.z) * ratio,
      })
    }
  }
  return pointList
}

const TRAIL_POINT_LIST = sampleTrail()

function measureTrailDistance(x: number, z: number): number {
  let distance = Number.POSITIVE_INFINITY
  for (const point of TRAIL_POINT_LIST) {
    distance = Math.min(distance, measureDistance(x, z, point))
  }
  return distance
}

/**
 * 這一格的雪堆了幾個半格
 *
 * 雪丘順著風拖成長條：風從東往西吹（松全往西歪、雪片往西飄），
 * 所以 x 方向取得疏、z 方向取得密，一道一道東西向的長丘。
 * 門前、正中那一方與木樁那條路被風吹平，不堆；外圈那一圈越堆越高，最多再加八個半格
 */
function measureDriftHalfLevel(x: number, z: number): number {
  const radius = measureDistance(x, z, BLIZZARD_CENTER)
  const portalGap = measureDistance(x, z, BLIZZARD_PORTAL_POINT) - PORTAL_FLAT_RADIUS
  const heartGap = radius - HEART_FLAT_RADIUS
  const trailGap = measureTrailDistance(x, z) - 1.5
  /** 吹平的地方往外三格慢慢堆回來，看起來是風吹出來的窪，而不是挖好的圓 */
  const flatRatio = Math.min(1, Math.max(0, Math.min(portalGap, heartGap, trailGap) / 3))

  const ridge = fbm2D(x * 0.045 + 7, z * 0.16 - 3, 3, 0.5)
  let halfLevel = Math.max(0, Math.round((ridge - 0.05) * 7)) * flatRatio

  if (radius > DRIFT_WALL_START_RADIUS) {
    halfLevel += Math.min(8, (radius - DRIFT_WALL_START_RADIUS) / 1.5)
  }
  return Math.round(halfLevel)
}

/**
 * 雪地與雪丘，回傳每一格的地表高度（腳底整數高度減一，也就是最上面那一格實心方塊）
 *
 * 雪丘用整格的雪塊疊，最上面多半格就放雪半磚：一層一層半格地上去，走得上去不必一直跳。
 * 整格的頂面記成那一格，半磚的格子記成半磚那一格（花草與燈籠不長在半磚上）
 */
function shapeTerrain(state: Uint8Array): { topMap: Uint8Array; slabMap: Uint8Array } {
  const topMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  const slabMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = x * WORLD_SIZE + z
      const radius = measureDistance(x, z, BLIZZARD_CENTER)
      for (let y = 1; y < BLIZZARD_GROUND_Y; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }

      if (radius > BLIZZARD_EDGE_RADIUS) {
        setBlock(state, x, BLIZZARD_GROUND_Y, z, BlockId.LAKE_BED)
        topMap[index] = BLIZZARD_GROUND_Y
        continue
      }

      setBlock(state, x, BLIZZARD_GROUND_Y, z, BlockId.SNOW)
      const halfLevel = measureDriftHalfLevel(x, z)
      const fullCount = Math.floor(halfLevel / 2)
      for (let level = 1; level <= fullCount; level++) {
        setBlock(state, x, BLIZZARD_GROUND_Y + level, z, BlockId.SNOW_BLOCK)
      }
      if (halfLevel % 2 === 1) {
        setBlock(state, x, BLIZZARD_GROUND_Y + fullCount + 1, z, BlockId.SNOW_SLAB)
        slabMap[index] = 1
        topMap[index] = BLIZZARD_GROUND_Y + fullCount + 1
      }
      else {
        topMap[index] = BLIZZARD_GROUND_Y + fullCount
      }
    }
  }

  return { topMap, slabMap }
}

/**
 * 薄雪紋
 *
 * 吹雪野那一層：同一組噪音（x 取得比 z 密），有的地方多鋪一層薄雪、有的地方露出底下那層，
 * 風把雪吹成一道一道的，那些起伏是「這裡颳著風」看得見的證據。只鋪在整格的頂面上
 */
function laySnowStreak(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = x * WORLD_SIZE + z
      if (measureDistance(x, z, BLIZZARD_CENTER) > BLIZZARD_EDGE_RADIUS || slabMap[index])
        continue
      if (fbm2D(x * 0.32, z * 0.11, 3, 0.5) < 0.48)
        continue
      setBlock(state, x, topMap[index]! + 1, z, BlockId.SNOW_LAYER)
    }
  }
}

/** 這一格能不能擺東西：整格的頂面、上面是空的（薄雪可以清掉） */
function isOpenTop(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, x: number, z: number): boolean {
  const index = x * WORLD_SIZE + z
  if (slabMap[index])
    return false
  const above = getBlock(state, x, topMap[index]! + 1, z)
  return above === BlockId.AIR || above === BlockId.SNOW_LAYER
}

/**
 * 雪原正中：吹雪野那一小方
 *
 * 三盞石燈籠、三株往西歪的松、一高一矮兩塊石，位置與箱庭裡一模一樣（相對中心）。
 * 一路順著木樁走過來，白裡先浮出燈籠的暈，才看出這裡就是那座箱庭
 */
function buildHeart(state: Uint8Array): void {
  const groundY = BLIZZARD_GROUND_Y + 1
  const at = (offsetX: number, offsetZ: number) => ({ x: CENTER_X + offsetX, z: CENTER_Z + offsetZ })
  for (const point of [at(-4, 4), at(4, -3), at(1, 5)]) {
    placeStoneLantern(state, point.x, groundY, point.z)
  }
  for (const point of [at(3, 2), at(-3, -3), at(-1, 1)]) {
    placeBonsaiPine(state, point.x, groundY, point.z, -1, 0)
  }
  placeStandingStone(state, CENTER_X - 4, groundY, CENTER_Z - 4, 1, BlockId.COBBLESTONE)
  placeStandingStone(state, CENTER_X + 3, groundY, CENTER_Z - 2, 2, BlockId.COBBLESTONE)
}

/**
 * 木樁
 *
 * 從門前沿著骨架往南，每四格一根，左右交錯插在路的兩側，露出雪面一到兩格（底下埋著的不畫也不必放）。
 * 用門框那種細木樁：白裡看過去是一根一根細細的黑線
 */
function placePostTrail(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  const random = createSeededRandom('blizzard-post')
  const spacing = 4
  for (let index = 2; index < TRAIL_POINT_LIST.length; index += spacing) {
    const point = TRAIL_POINT_LIST[index]!
    const side = (index / spacing) % 2 < 1 ? 1 : -1
    const x = Math.round(point.x + side * 1.5)
    const z = Math.round(point.z)
    if (!isOpenTop(state, topMap, slabMap, x, z))
      continue
    const baseY = topMap[x * WORLD_SIZE + z]! + 1
    const height = random() < 0.5 ? 1 : 2
    for (let level = 0; level < height; level++) {
      setBlock(state, x, baseY + level, z, BlockId.WOOD_POST)
    }
  }
}

/**
 * 燈籠
 *
 * 吹雪野木座上三盞，彼此隔六七格，能見度裡一次只看得到一盞。
 * 雪原上照同一個疏密撒開（彼此至少隔十四格），回程門東側再一盞，回頭找門就靠它。
 * 一半被雪埋到只剩燈室與笠：底座那一格沉進雪裡，雪丘一路堆到燈室的腳下
 */
function placeLanternList(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  const random = createSeededRandom('blizzard-lantern')
  const placedList: { x: number; z: number }[] = [
    { x: CENTER_X - 4, z: CENTER_Z + 4 },
    { x: CENTER_X + 4, z: CENTER_Z - 3 },
    { x: CENTER_X + 1, z: CENTER_Z + 5 },
  ]

  const portalLantern = { x: BLIZZARD_PORTAL_POINT.x + 3, z: BLIZZARD_PORTAL_POINT.z }
  placeStoneLantern(state, portalLantern.x, topMap[portalLantern.x * WORLD_SIZE + portalLantern.z]! + 1, portalLantern.z)
  placedList.push(portalLantern)

  for (let attempt = 0; attempt < 400 && placedList.length < 20; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 10 + random() * (DRIFT_WALL_START_RADIUS - 14)
    const x = Math.round(CENTER_X + Math.cos(angle) * radius)
    const z = Math.round(CENTER_Z + Math.sin(angle) * radius)
    const isBuried = random() < 0.5
    if (placedList.some((point) => measureDistance(x, z, point) < 14))
      continue
    if (measureTrailDistance(x, z) < 3 || measureDistance(x, z, BLIZZARD_PORTAL_POINT) < PORTAL_FLAT_RADIUS)
      continue
    if (!isOpenTop(state, topMap, slabMap, x, z))
      continue

    const topY = topMap[x * WORLD_SIZE + z]!
    /** 埋起來的那幾盞：底座沉進雪裡，從雪面上看只剩燈室與笠；平地上沒有雪可埋就立著 */
    const baseY = isBuried && topY > BLIZZARD_GROUND_Y ? topY : topY + 1
    if (getBlock(state, x, baseY + 1, z) === BlockId.SNOW_LAYER)
      setBlock(state, x, baseY + 1, z, BlockId.AIR)
    placeStoneLantern(state, x, baseY, z)
    placedList.push({ x, z })
  }
}

/**
 * 被雪壓彎的松與兩三塊石
 *
 * 松全部往西歪（風只有一個方向），彼此隔得遠；
 * 石頭照吹雪野的意思收到最少：夠讓人知道自己有在移動，不夠讓人知道自己在哪裡
 */
function placePineAndStone(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  const random = createSeededRandom('blizzard-pine')
  const pineList: { x: number; z: number }[] = []

  for (let attempt = 0; attempt < 500 && pineList.length < 26; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = HEART_FLAT_RADIUS + 3 + random() * (DRIFT_WALL_START_RADIUS + 6 - HEART_FLAT_RADIUS)
    const x = Math.round(CENTER_X + Math.cos(angle) * radius)
    const z = Math.round(CENTER_Z + Math.sin(angle) * radius)
    if (pineList.some((point) => measureDistance(x, z, point) < 9))
      continue
    if (measureTrailDistance(x, z) < 4 || measureDistance(x, z, BLIZZARD_PORTAL_POINT) < PORTAL_FLAT_RADIUS + 2)
      continue
    if (!isOpenTop(state, topMap, slabMap, x, z) || !isOpenTop(state, topMap, slabMap, x - 2, z))
      continue

    const groundY = topMap[x * WORLD_SIZE + z]! + 1
    placeBonsaiPine(state, x, groundY, z, -1, 0)
    pineList.push({ x, z })
  }

  let stoneCount = 0
  for (let attempt = 0; attempt < 60 && stoneCount < 6; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = HEART_FLAT_RADIUS + 4 + random() * (DRIFT_WALL_START_RADIUS - HEART_FLAT_RADIUS - 6)
    const x = Math.round(CENTER_X + Math.cos(angle) * radius)
    const z = Math.round(CENTER_Z + Math.sin(angle) * radius)
    if (measureTrailDistance(x, z) < 3 || !isOpenTop(state, topMap, slabMap, x, z))
      continue
    if (pineList.some((point) => measureDistance(x, z, point) < 4))
      continue
    placeStandingStone(state, x, topMap[x * WORLD_SIZE + z]! + 1, z, random() < 0.6 ? 1 : 2, BlockId.COBBLESTONE)
    pineList.push({ x, z })
    stoneCount++
  }
}

/** 雪地裡活得下來的只有枯枝，而且是曬白的那一種（吹雪野每格百分之五） */
function scatterDryShrub(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  const random = createSeededRandom('blizzard-shrub')
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (random() > 0.05)
        continue
      if (measureDistance(x, z, BLIZZARD_CENTER) > BLIZZARD_EDGE_RADIUS - 2)
        continue
      const index = x * WORLD_SIZE + z
      if (slabMap[index])
        continue
      const topY = topMap[index]!
      if (!SNOW_BLOCK_SET.has(getBlock(state, x, topY, z)) || getBlock(state, x, topY + 1, z) !== BlockId.AIR)
        continue
      setBlock(state, x, topY + 1, z, BlockId.DRY_SHRUB)
    }
  }
}

/**
 * 最後替所有東西蓋上一層雪
 *
 * 吹雪野的最後一步：雪是積在東西上面的，樹、燈籠、石頭全部就位之後才輪到它。
 * 掃過一遍之後，松的樹冠、燈籠的笠、石頭的頂面都各壓著一片白。
 * 與 capWithSnow 不同的是地面不蓋（雪丘本身就是雪），細樁與半格的東西也不蓋：
 * 一片全寬的薄雪會浮在它們頂上
 */
function capWithSnow(state: Uint8Array): void {
  const fromY = BLIZZARD_GROUND_Y + 1
  const toY = BLIZZARD_GROUND_Y + 16
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureDistance(x, z, BLIZZARD_CENTER) > BLIZZARD_EDGE_RADIUS)
        continue
      for (let y = toY; y >= fromY; y--) {
        const blockId = getBlock(state, x, y, z)
        if (blockId === BlockId.AIR || isDecorationBlock(blockId) || isPassableBlock(blockId))
          continue
        const isFullCube = !BLOCK_DEFS[blockId]?.shape
        if (isFullCube && !SNOW_BLOCK_SET.has(blockId) && !UNCAPPED_BLOCK_SET.has(blockId) && getBlock(state, x, y + 1, z) === BlockId.AIR) {
          setBlock(state, x, y + 1, z, BlockId.SNOW_LAYER)
        }
        break
      }
    }
  }
}

/** 生成整片白矇雪原 */
export function generateBlizzardWorld(state: Uint8Array): void {
  const { topMap, slabMap } = shapeTerrain(state)
  laySnowStreak(state, topMap, slabMap)
  buildHeart(state)
  placeLanternList(state, topMap, slabMap)
  placePostTrail(state, topMap, slabMap)
  placePineAndStone(state, topMap, slabMap)
  scatterDryShrub(state, topMap, slabMap)
  /** 細節小景排在蓋雪之前：小屋的屋頂、雪橇上的木箱都會跟著積一層雪；冰面不積（見 UNCAPPED_BLOCK_SET） */
  decorateBlizzard(state, topMap, slabMap)
  capWithSnow(state)

  /** 門框排在最後，與大廳那一座一樣不沾雪 */
  for (const portal of BLIZZARD_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
