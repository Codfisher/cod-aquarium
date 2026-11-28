import type { BasaltStack, HotPool, LavaFall, Lookout } from './jigoku-layout'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  CHARRED_LOG_SET,
  fillBox,
  getNoisyDistance,
  placeDeadTree,
  placeStoneLantern,
  placeTorii,
  plantWithStack,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { createPathDistanceMap, samplePathCurve } from '../land-realm-kit'
import { placePortalStructure } from '../portal-terrain'
import { decorateJigoku } from './jigoku-details'
import {
  ARM_END_Z,
  BASALT_STACK_LIST,
  BOARDWALK_EAST_POINT_LIST,
  BOARDWALK_SPUR_END_Z,
  BOARDWALK_WEST_POINT_LIST,
  CAIRN_FIELD,
  CAUSEWAY_END_Z,
  CAUSEWAY_START_Z,
  CAUSEWAY_Y,
  CRATER_RADIUS_X,
  CRATER_RADIUS_Z,
  EGG_STALL_POINT,
  FOOT_BATH_RECT,
  HOT_POOL_LIST,
  JIGOKU_CENTER,
  JIGOKU_FOOT_Y,
  JIGOKU_PORTAL_POINT,
  JIGOKU_TORII_Z,
  LAKE_CENTER,
  LAKE_ISLAND,
  LAKE_RADIUS_X,
  LAKE_RADIUS_Z,
  LAKE_Y,
  LAVA_FALL_LIST,
  LAVA_FIELD_REACH,
  LAVA_LIGHT_POINT_LIST,
  LAVA_RIVER_LIST,
  LAVA_TORII,
  LOOKOUT_LIST,
  OVERLOOK_EDGE_Z,
  OVERLOOK_PLAZA,
  RIM_Y,
  SHRINE_PLATFORM,
  SPILL_SPRING,
  STAIR_HALF_WIDTH,
  STAIR_LENGTH,
  STEAM_VENT_LIST,
  SULPHUR_TERRACE,
  TERRACE_Y,
  WALL_STEP,
} from './jigoku-layout'
import { JIGOKU_REALM } from './jigoku-realm'

/**
 * 湯煙谷的地形
 *
 * 只有地形 worker 用。一座火口：南邊一彎台地（人待的地方），其餘整個火口底是熔岩湖，
 * 四周火口壁兩格一階往上爬到稜線，稜線外是不畫的 LAKE_BED。
 *
 * 語彙照地獄谷（buildJigokuGarden）：熔岩、烤黑的岩、黑曜石磚、鳥居、刻紋石碑與石燈籠、
 * 炭黑枯木、白骨，只長枯灌、枯草與石生植物；路從不跨過熔岩（「這裡不能過」），走到湖裡的祠台就是盡頭。
 * 使用者要的地熱谷（熱泉、泥池、噴氣孔、木棧）留在台地上，是整片熔岩前面那一層人的尺度。
 *
 * 三件事是照著成本設計的：
 *
 * - 光源：熔岩湖有一萬格，全用不進光源清單的 LAVA_FIELD；真的 LAVA 只有八格（LAVA_LIGHT_POINT_LIST），
 *   餘燼一格都不撒（每一格都是一盞燈），地上發紅的裂縫改用不點燈的 MAGMA_ROCK。
 *   照亮場景的真光由 light-source 把整片熔岩併成九盞面光源（場景定義的 areaLightLimit）
 * - 看得見的方塊：熔岩只有一格深、底下是實心的岩，每一格柱只露出最上面那一格；
 *   火口壁與崖只有露在外面的那幾格挑岩種，裡面一律是石（反正被剔掉）
 * - 掉下去：熔岩只有一格深（踩得到底、眼睛不會沒進去），石階兩側的碎石坡一階一階接到湖面，
 *   翻過柵欄就回到石階上。台地的崖邊一圈高一格的岩唇，走路不會直接走下去
 *
 * 順序：分區與高度 → 填格柱 → 黑岩原與熔岩河 → 玄武岩柱 → 熔岩瀑 → 湖面的岩殼 → 石階、參道、祠台 →
 * 湯瀧 → 熱泉、泥池、噴氣孔、硫磺階地 → 木棧與柵欄 → 鳥居與祠 → 真光 → 枯木、白骨、花草 → 細節 → 傳送門
 */

/** 格柱的分區 */
const KIND_HIDDEN = 0
const KIND_WALL = 1
const KIND_TERRACE = 2
const KIND_LAKE = 3

/** 熔岩瀑落點四周的崖：每往外一格高這麼多，等於直立 */
const CLIFF_STEP = 40

/** 稜線往外幾格之後換成不畫的 LAKE_BED */
const CREST_DEPTH = 2

/** 熔岩瀑頂的缺口往稜線後面挖幾格（從火口裡看不到盡頭） */
const FALL_CHANNEL_LENGTH = 9

/** 木棧中心線兩側幾格內是木板（約三格寬），再往外一格是柵欄 */
const BOARDWALK_HALF_WIDTH = 1.05
const RAILING_HALF_WIDTH = 2.05

/**
 * 柵欄每隔多少格留一個口
 *
 * 整圈封死人就下不了棧道，每三十來格留三格寬的口，想走近一點看噴氣孔的人自己決定要不要下去。
 * 木棧離崖邊至少七八格，崖邊另有一圈岩唇，口開在哪裡都不會直接通到熔岩
 */
const RAILING_GAP_PERIOD = 32
const RAILING_GAP_LENGTH = 4

/** 整張地形的暫存：分區、每一格柱最上面那格實心方塊的高度、離熔岩河多遠 */
interface TerrainMap {
  kindMap: Uint8Array;
  topMap: Uint8Array;
  riverDistanceMap: Float32Array;
}

function toIndex(x: number, z: number): number {
  return x * WORLD_SIZE + z
}

/** 座標的雜湊，零到一；同一格永遠得到同一個值 */
function hashCell(x: number, z: number, seed: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1274126177)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

/** 平滑的區間映射：value 從 from 走到 to，回傳零到一 */
function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return ratio * ratio * (3 - 2 * ratio)
}

/** 這一格在火口的橢圓裡多深：零是中心，一是火口壁腳；吃一層低頻噪音，壁腳才不是一條平滑的線 */
function measureCraterRatio(x: number, z: number): number {
  const ratioX = (x - JIGOKU_CENTER.x) / CRATER_RADIUS_X
  const ratioZ = (z - JIGOKU_CENTER.z) / CRATER_RADIUS_Z
  return Math.hypot(ratioX, ratioZ) + fbm2D(x * 0.035 + 3, z * 0.035 - 41, 2, 0.5) * 0.04
}

/**
 * 這一格在熔岩湖的橢圓裡多深：一以上才是台地
 *
 * 崖線吃噪音；靠近中軸的那一段收成整齊的弧，到著台、石階與崖邊才對得起來
 */
function measureLakeRatio(x: number, z: number): number {
  const calm = smoothRange(Math.abs(x - JIGOKU_CENTER.x), 10, 26)
  const ratioX = (x - LAKE_CENTER.x) / LAKE_RADIUS_X
  const ratioZ = (z - LAKE_CENTER.z) / LAKE_RADIUS_Z
  return Math.hypot(ratioX, ratioZ) + fbm2D(x * 0.05 - 17, z * 0.05 + 29, 2, 0.5) * 0.05 * calm
}

function isInsideLookout(lookout: Lookout, x: number, z: number): boolean {
  return Math.abs(x - lookout.x) <= lookout.halfWidth && z >= lookout.z - lookout.northReach && z <= lookout.z + lookout.southReach
}

/** 鋪了石板、崖邊圍柵欄而不是岩唇的地方：到著台與兩座展望台 */
function isPavedSpot(x: number, z: number): boolean {
  if (z >= OVERLOOK_EDGE_Z && Math.hypot(x - OVERLOOK_PLAZA.x, z - OVERLOOK_PLAZA.z) <= OVERLOOK_PLAZA.radius)
    return true
  return LOOKOUT_LIST.some((lookout) => isInsideLookout(lookout, x, z))
}

/** 這一格是不是台地：熔岩湖的橢圓以外、兩臂的尖端以南，加上往外挑的兩座展望台 */
function isTerraceSpot(x: number, z: number): boolean {
  if (LOOKOUT_LIST.some((lookout) => isInsideLookout(lookout, x, z)))
    return true
  const armEnd = ARM_END_Z + fbm2D(x * 0.08, 7.3, 2, 0.5) * 2.5
  return z > armEnd && measureLakeRatio(x, z) >= 1
}

/** 這一格離最近的熔岩瀑多近：一是落點正上方（直立的崖），零是一般的火口壁 */
function measureCliffRatio(x: number, z: number): number {
  let ratio = 0
  for (const fall of LAVA_FALL_LIST) {
    const distance = Math.hypot(x - fall.x, z - fall.z)
    ratio = Math.max(ratio, 1 - smoothRange(distance, fall.cliffRadius * 0.6, fall.cliffRadius))
  }
  return ratio
}

/**
 * 分區與高度
 *
 * 火口壁每往外一格高兩格（熔岩瀑四周是直立的崖），爬到 RIM_Y 之後是兩格深的稜線（吃零到三格的鋸齒），
 * 再往外是不畫的 LAKE_BED。台地在崖邊那一排高一格（岩唇），鋪石板的到著台與展望台不墊、改圍柵欄
 */
function classifyTerrain(): TerrainMap {
  const kindMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  const topMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = toIndex(x, z)
      const wallDistance = (measureCraterRatio(x, z) - 1) * CRATER_RADIUS_Z

      if (wallDistance > 0) {
        const step = WALL_STEP + measureCliffRatio(x, z) * CLIFF_STEP
        const rank = Math.ceil(wallDistance)
        const crestRank = Math.ceil((RIM_Y - TERRACE_Y) / step)
        if (rank > crestRank + CREST_DEPTH) {
          kindMap[index] = KIND_HIDDEN
          topMap[index] = RIM_Y
          continue
        }
        kindMap[index] = KIND_WALL
        const jag = Math.min(3, Math.max(0, Math.floor((fbm2D(x * 0.21 + 9, z * 0.21 - 3, 2, 0.5) * 0.5 + 0.5) * 4)))
        topMap[index] = rank >= crestRank ? RIM_Y + jag : TERRACE_Y + rank * step
        continue
      }

      if (isTerraceSpot(x, z)) {
        kindMap[index] = KIND_TERRACE
        /** 火口壁腳堆著崩下來的岩：離壁腳兩三格內零星墊高一格 */
        const isTalus = wallDistance > -3 && fbm2D(x * 0.3 + 5, z * 0.3 - 8, 2, 0.5) > 0.12
        topMap[index] = TERRACE_Y + (isTalus ? 1 : 0)
        continue
      }

      kindMap[index] = KIND_LAKE
      topMap[index] = LAKE_Y
    }
  }

  /** 崖邊的岩唇：八方相鄰有熔岩湖的台地格墊高一格（鋸齒處兩格） */
  const lipList: number[] = []
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      if (kindMap[toIndex(x, z)] !== KIND_TERRACE || isPavedSpot(x, z))
        continue
      if (hasNeighbourKind(kindMap, x, z, KIND_LAKE, true))
        lipList.push(toIndex(x, z))
    }
  }
  for (const index of lipList) {
    const x = Math.floor(index / WORLD_SIZE)
    const z = index % WORLD_SIZE
    topMap[index] = TERRACE_Y + (hashCell(x, z, 11) < 0.3 ? 2 : 1)
  }

  return { kindMap, topMap, riverDistanceMap: createRiverDistanceMap() }
}

/** 四方（或八方）相鄰的格柱裡有沒有某一種分區 */
function hasNeighbourKind(kindMap: Uint8Array, x: number, z: number, kind: number, isDiagonalIncluded: boolean): boolean {
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      if (offsetX === 0 && offsetZ === 0)
        continue
      if (!isDiagonalIncluded && offsetX !== 0 && offsetZ !== 0)
        continue
      const nextX = x + offsetX
      const nextZ = z + offsetZ
      if (nextX < 0 || nextX >= WORLD_SIZE || nextZ < 0 || nextZ >= WORLD_SIZE)
        continue
      if (kindMap[toIndex(nextX, nextZ)] === kind)
        return true
    }
  }
  return false
}

/** 每一格離熔岩河的中心線多遠 */
function createRiverDistanceMap(): Float32Array {
  return createPathDistanceMap(LAVA_RIVER_LIST.map((pointList) => samplePathCurve(pointList)), LAVA_FIELD_REACH + 6)
}

/**
 * 火口壁與崖的岩
 *
 * 黑的玄武岩打底，一層一層夾著灰的圓石與石（一道一道熔岩流疊起來的層理，斷斷續續的）；
 * 貼著熔岩面的那兩格透著暗紅，稜線頂那幾格是落灰的灰；南半邊靠近熱泉的壁上幾道硫磺的黃。
 * 黑曜石磚不進岩壁：磚紋嵌在天然的崖上像補丁，只留在台地的地面（地獄谷那一圈烤黑的地）
 */
function pickWallBlock(x: number, y: number, z: number): BlockId {
  const roll = fbm2D(x * 0.23 + 7, z * 0.23 + y * 0.31, 2, 0.5)
  if (y - LAKE_Y <= 1)
    return roll > 0.12 ? BlockId.MAGMA_ROCK : BlockId.BASALT

  if (y >= TERRACE_Y - 1 && z > ARM_END_Z && fbm2D(x * 0.09 + y * 0.05, z * 0.09 - 23, 2, 0.5) > 0.5)
    return BlockId.SANDSTONE

  const strata = (y + Math.round(fbm2D(x * 0.03, z * 0.03, 2, 0.5) * 4) + 70) % 7
  if (strata === 0 && roll > -0.15)
    return BlockId.COBBLESTONE
  if (strata === 4 && roll > 0.1)
    return BlockId.STONE
  if (y > RIM_Y - 4 && roll > 0.05)
    return BlockId.STONE
  return BlockId.BASALT
}

/**
 * 台地的地面
 *
 * 照地獄谷由外往內越來越黑：火口壁那一側是石與礫，中間是烤過的圓石，靠崖邊是玄武岩，夾幾塊黑曜石磚與幾道透紅的裂縫。
 * 交界吃噪音，不規則
 */
function pickFloorBlock(x: number, z: number): BlockId {
  const edgeDistance = Math.min((measureLakeRatio(x, z) - 1) * LAKE_RADIUS_Z, z - ARM_END_Z)
  const wobble = fbm2D(x * 0.17 - 11, z * 0.17 + 5, 2, 0.5) * 3
  const patch = fbm2D(x * 0.11 + 31, z * 0.11 - 19, 2, 0.5)
  if (edgeDistance + wobble < 5) {
    /** 崖邊的玄武岩還沒涼透：幾道細細的裂縫透著暗紅（不點燈），入夜腳邊是亮的 */
    if (Math.abs(fbm2D(x * 0.19 + 44, z * 0.19 - 71, 2, 0.5)) < 0.022)
      return BlockId.MAGMA_ROCK
    return patch < -0.25 ? BlockId.OBSIDIAN_BRICKS : BlockId.BASALT
  }
  if (edgeDistance + wobble < 15)
    return patch > 0.3 ? BlockId.BASALT : BlockId.COBBLESTONE
  if (patch > 0.28)
    return BlockId.GRAVEL
  return patch < -0.2 ? BlockId.COBBLESTONE : BlockId.STONE
}

/**
 * 填格柱
 *
 * 只有露在外面的那幾格（比四方最矮的鄰居高的）才挑岩種，裡面一律是石。
 * 熔岩湖：一格熔岩、底下一格玄武岩；稜線外：頂上一格 LAKE_BED
 */
function fillColumnList(state: Uint8Array, { kindMap, topMap }: TerrainMap): void {
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = toIndex(x, z)
      const kind = kindMap[index]!
      const topY = topMap[index]!

      if (kind === KIND_LAKE) {
        for (let y = 1; y < LAKE_Y - 1; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, LAKE_Y - 1, z, BlockId.BASALT)
        setBlock(state, x, LAKE_Y, z, BlockId.LAVA_FIELD)
        continue
      }

      if (kind === KIND_HIDDEN) {
        for (let y = 1; y < topY; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, topY, z, BlockId.LAKE_BED)
        continue
      }

      let lowestNeighbour = topY
      for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nextX = x + offsetX
        const nextZ = z + offsetZ
        if (nextX < 0 || nextX >= WORLD_SIZE || nextZ < 0 || nextZ >= WORLD_SIZE)
          continue
        lowestNeighbour = Math.min(lowestNeighbour, topMap[toIndex(nextX, nextZ)]!)
      }

      for (let y = 1; y <= topY; y++) {
        const isExposed = y >= lowestNeighbour
        if (!isExposed) {
          setBlock(state, x, y, z, BlockId.STONE)
          continue
        }
        const isFloor = kind === KIND_TERRACE && y === topY && topY === TERRACE_Y
        setBlock(state, x, y, z, isFloor ? pickFloorBlock(x, z) : pickWallBlock(x, y, z))
      }
    }
  }
}

/** 這一格是不是露著的熔岩：熔岩湖那一層還是熔岩、頭上是空的 */
function isOpenLava(state: Uint8Array, x: number, z: number): boolean {
  return getBlock(state, x, LAKE_Y, z) === BlockId.LAVA_FIELD && getBlock(state, x, LAKE_Y + 1, z) === BlockId.AIR
}

/**
 * 黑岩原與熔岩河
 *
 * 西瀑落下來的熔岩在火口西北角淌開、涼成一片黑岩（繩狀熔岩），比熔岩面高一格，零星隆起一格的岩丘；
 * 兩道還在流的熔岩河在裡面切出發亮的溝，河邊與岩面的裂縫透著暗紅（MAGMA_ROCK，不點燈）
 */
function layLavaField(state: Uint8Array, { kindMap, topMap, riverDistanceMap }: TerrainMap): void {
  const [firstRiver] = LAVA_RIVER_LIST
  const plunge = firstRiver![0]!

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = toIndex(x, z)
      if (kindMap[index] !== KIND_LAKE)
        continue
      const distance = riverDistanceMap[index]!
      if (distance > LAVA_FIELD_REACH + fbm2D(x * 0.09 + 2, z * 0.09 + 77, 2, 0.5) * 4)
        continue

      /** 河身與西瀑的落潭留著熔岩 */
      const riverHalfWidth = 1.5 + fbm2D(x * 0.2 - 40, z * 0.2 + 13, 2, 0.5) * 0.9
      if (distance <= riverHalfWidth || Math.hypot(x - plunge.x - 1, z - plunge.z - 1) <= 3.6)
        continue

      const isNearRiver = distance <= riverHalfWidth + 2.4
      const isCrack = Math.abs(fbm2D(x * 0.16 + 90, z * 0.16 + 12, 2, 0.5)) < 0.03
      const isMound = !isNearRiver && fbm2D(x * 0.14 - 55, z * 0.14 + 61, 2, 0.5) > 0.3
      const isGlowing = isCrack || (isNearRiver && hashCell(x, z, 3) < 0.26)

      setBlock(state, x, LAKE_Y, z, BlockId.BASALT)
      setBlock(state, x, LAKE_Y + 1, z, isGlowing && !isMound ? BlockId.MAGMA_ROCK : BlockId.BASALT)
      topMap[index] = LAKE_Y + 1
      if (isMound) {
        setBlock(state, x, LAKE_Y + 2, z, isCrack ? BlockId.MAGMA_ROCK : BlockId.BASALT)
        topMap[index] = LAKE_Y + 2
      }
    }
  }
}

/**
 * 一叢柱狀玄武岩
 *
 * 兩格見方一根柱子，隔行錯開半根（從上面看像蜂巢），每根的高度各自差一點：
 * 中間最高、往外一圈一圈矮下去，就是一排一排高低參差的風琴管
 */
function placeBasaltStack(state: Uint8Array, { kindMap, topMap }: TerrainMap, stack: BasaltStack, seed: number): void {
  const limit = Math.ceil(stack.radius + 2)
  for (let x = Math.round(stack.x - limit); x <= Math.round(stack.x + limit); x++) {
    for (let z = Math.round(stack.z - limit); z <= Math.round(stack.z + limit); z++) {
      const index = toIndex(x, z)
      if (kindMap[index] !== KIND_LAKE)
        continue
      const row = Math.floor(z / 2)
      const column = Math.floor((x + (row & 1)) / 2)
      const columnCenterX = column * 2 - (row & 1) + 0.5
      const columnCenterZ = row * 2 + 0.5
      const distance = Math.hypot(columnCenterX - stack.x, columnCenterZ - stack.z)
      if (distance > stack.radius)
        continue
      const envelope = 1 - (distance / stack.radius) ** 1.7
      const height = Math.max(1, Math.round(stack.height * envelope * (0.55 + 0.45 * hashCell(column, row, seed))))
      for (let level = 0; level <= height; level++) {
        setBlock(state, x, LAKE_Y + level, z, BlockId.BASALT)
      }
      topMap[index] = LAKE_Y + height
    }
  }
}

/** 所有的玄武岩柱；湖心島頂上一株站著死掉的炭黑枯木 */
function placeBasaltStackList(state: Uint8Array, terrain: TerrainMap): void {
  for (const [stackIndex, stack] of BASALT_STACK_LIST.entries()) {
    placeBasaltStack(state, terrain, stack, 20 + stackIndex)
  }
  const islandTop = terrain.topMap[toIndex(LAKE_ISLAND.x, LAKE_ISLAND.z)]!
  placeDeadTree(state, LAKE_ISLAND.x, islandTop + 1, LAKE_ISLAND.z, 4, CHARRED_LOG_SET)
}

/**
 * 一道熔岩瀑
 *
 * 落點四周的火口壁是直立的崖（見 classifyTerrain）。貼著崖腳的那一排熔岩格從湖面一路疊到瀑頂，就是瀑身；
 * 崖頂往稜線後面挖一道同寬的溝、鋪一層熔岩，是瀑布的來路（從火口裡只看得到溝口）。
 * 瀑身只是一面會動的熔岩貼圖，往下淌的樣子由渲染端在外面貼一層（見 jigoku-lava-falls）
 */
function carveLavaFall(state: Uint8Array, { kindMap, topMap }: TerrainMap, fall: LavaFall): void {
  /** 壁面在落點的朝外方向與沿著壁面的方向 */
  const gradientX = (fall.x - JIGOKU_CENTER.x) / CRATER_RADIUS_X ** 2
  const gradientZ = (fall.z - JIGOKU_CENTER.z) / CRATER_RADIUS_Z ** 2
  const gradientLength = Math.hypot(gradientX, gradientZ)
  const outwardX = gradientX / gradientLength
  const outwardZ = gradientZ / gradientLength
  const reach = fall.halfWidth + FALL_CHANNEL_LENGTH + 4

  for (let x = Math.round(fall.x - reach); x <= Math.round(fall.x + reach); x++) {
    for (let z = Math.round(fall.z - reach); z <= Math.round(fall.z + reach); z++) {
      if (x < 1 || x >= WORLD_SIZE - 1 || z < 1 || z >= WORLD_SIZE - 1)
        continue
      const index = toIndex(x, z)
      const along = (x - fall.x) * -outwardZ + (z - fall.z) * outwardX
      const depth = (x - fall.x) * outwardX + (z - fall.z) * outwardZ
      if (Math.abs(along) > fall.halfWidth + 0.5)
        continue

      const kind = kindMap[index]!
      if (kind === KIND_LAKE) {
        /** 瀑身：貼著崖腳的那一排 */
        if (depth > -4 && hasNeighbourKind(kindMap, x, z, KIND_WALL, false)) {
          for (let y = LAKE_Y + 1; y <= fall.topY; y++) {
            setBlock(state, x, y, z, BlockId.LAVA_FIELD)
          }
        }
        continue
      }

      /** 來路：稜線上的缺口與後面那道溝 */
      if (depth <= FALL_CHANNEL_LENGTH) {
        for (let y = fall.topY + 1; y <= topMap[index]!; y++) {
          setBlock(state, x, y, z, BlockId.AIR)
        }
        setBlock(state, x, fall.topY - 1, z, BlockId.BASALT)
        setBlock(state, x, fall.topY, z, BlockId.LAVA_FIELD)
        kindMap[index] = KIND_WALL
        topMap[index] = fall.topY - 1
      }
    }
  }
}

/**
 * 湖面上漂著的岩殼
 *
 * 湖面的殼與縫是渲染端畫的（見 jigoku-lava-surface）；這裡放的是厚到凸出湖面的那幾塊：
 * 實心的玄武岩，頂面比熔岩面高一點點，從湖裡踩得上來。
 * 靠崖腳與火口壁的地方涼得快、殼厚；湖心只有零星幾塊；瀑布落點、參道與祠台四周不放
 */
function scatterCrustList(state: Uint8Array, { kindMap }: TerrainMap): void {
  for (let x = 2; x < WORLD_SIZE - 2; x++) {
    for (let z = 2; z < WORLD_SIZE - 2; z++) {
      if (kindMap[toIndex(x, z)] !== KIND_LAKE || !isOpenLava(state, x, z))
        continue
      if (LAVA_FALL_LIST.some((fall) => Math.hypot(x - fall.x, z - fall.z) < fall.halfWidth * 2.5 + 4))
        continue
      if (Math.abs(x - JIGOKU_CENTER.x) <= 11 && z >= LAVA_TORII.z - 3 && z <= OVERLOOK_EDGE_Z)
        continue

      let isNearShore = false
      for (let offsetX = -3; offsetX <= 3 && !isNearShore; offsetX++) {
        for (let offsetZ = -3; offsetZ <= 3 && !isNearShore; offsetZ++) {
          isNearShore = kindMap[toIndex(x + offsetX, z + offsetZ)] !== KIND_LAKE
        }
      }
      const plate = fbm2D(x * 0.085 + 50, z * 0.085 - 7, 3, 0.5)
      if (plate > (isNearShore ? 0.08 : 0.42) || hashCell(x, z, 7) < 0.006)
        setBlock(state, x, LAKE_Y, z, BlockId.BASALT)
    }
  }
}

/** 石階第幾階（崖邊那一排是零）的踏面高度：一格降半格 */
function measureTreadSurface(step: number): number {
  return TERRACE_Y + 0.5 - step * 0.5
}

/**
 * 石階、參道與祠台
 *
 * 石階：半磚與整格交錯，走起來是平順的下坡；壓在一座玄武岩墩上，兩側各一排柵欄。
 * 岩墩外側再堆兩排碎石坡，從湖面一階一階爬到崖頂：掉進熔岩的人從這裡上來，翻過柵欄就回到石階。
 * 參道：五格寬的石板，兩側柵欄，比熔岩面高一格多。
 * 祠台：削了角的方台，四周柵欄只留參道那一個口；北緣一塊刻紋石碑、一對石燈籠，碑後就是熔岩
 */
function buildCauseway(state: Uint8Array, { kindMap, topMap }: TerrainMap): void {
  const centerX = JIGOKU_CENTER.x
  const railOffset = STAIR_HALF_WIDTH + 1

  const fillColumn = (x: number, z: number, topY: number, topBlock: BlockId) => {
    for (let y = LAKE_Y - 1; y < topY; y++) {
      setBlock(state, x, y, z, BlockId.BASALT)
    }
    setBlock(state, x, topY, z, topBlock)
    kindMap[toIndex(x, z)] = KIND_WALL
    topMap[toIndex(x, z)] = topY
  }

  for (let step = 1; step <= STAIR_LENGTH; step++) {
    const z = OVERLOOK_EDGE_Z - step
    const surface = measureTreadSurface(step)
    /** 踏面落在整數高度的那幾階是半磚（佔那一格的下半格），其餘是整格 */
    const isSlab = Number.isInteger(surface)
    const solidTopY = isSlab ? surface - 1 : surface - 0.5
    const railTopY = Math.ceil(surface - 0.5)

    for (let offsetX = -STAIR_HALF_WIDTH; offsetX <= STAIR_HALF_WIDTH; offsetX++) {
      fillColumn(centerX + offsetX, z, solidTopY, isSlab ? BlockId.BASALT : BlockId.STONE_TILE)
      if (isSlab)
        setBlock(state, centerX + offsetX, surface, z, BlockId.STONE_SLAB)
    }
    for (const side of [-1, 1]) {
      fillColumn(centerX + side * railOffset, z, railTopY, BlockId.BASALT)
      setBlock(state, centerX + side * railOffset, railTopY + 1, z, BlockId.FENCE)
      /** 碎石坡：貼著岩墩的那一排與石階同高，再外面一排矮一格，最底下接到湖面的岩殼 */
      fillColumn(centerX + side * (railOffset + 1), z, railTopY, BlockId.BASALT)
      fillColumn(centerX + side * (railOffset + 2), z, Math.max(LAKE_Y, railTopY - 1 - (hashCell(z, side, 5) < 0.4 ? 1 : 0)), BlockId.BASALT)
    }
  }

  /** 碎石坡腳：幾塊與熔岩面齊平的岩殼，從熔岩裡踩得上來 */
  for (const side of [-1, 1]) {
    for (let offsetX = railOffset + 1; offsetX <= railOffset + 4; offsetX++) {
      for (let z = CAUSEWAY_START_Z - 2; z <= CAUSEWAY_START_Z + 2; z++) {
        const x = centerX + side * offsetX
        if (isOpenLava(state, x, z))
          setBlock(state, x, LAKE_Y, z, BlockId.BASALT)
      }
    }
  }

  for (let z = CAUSEWAY_END_Z; z <= CAUSEWAY_START_Z; z++) {
    for (let offsetX = -railOffset; offsetX <= railOffset; offsetX++) {
      const isRail = Math.abs(offsetX) === railOffset
      fillColumn(centerX + offsetX, z, CAUSEWAY_Y, isRail ? BlockId.BASALT : BlockId.STONE_TILE)
      if (isRail)
        setBlock(state, centerX + offsetX, CAUSEWAY_Y + 1, z, BlockId.FENCE)
    }
  }

  const { x: shrineX, z: shrineZ, halfSize } = SHRINE_PLATFORM
  const isOnPlatform = (x: number, z: number) => {
    const offsetX = Math.abs(x - shrineX)
    const offsetZ = Math.abs(z - shrineZ)
    return offsetX <= halfSize && offsetZ <= halfSize && offsetX + offsetZ <= halfSize * 2 - 3
  }
  for (let x = shrineX - halfSize; x <= shrineX + halfSize; x++) {
    for (let z = shrineZ - halfSize; z <= shrineZ + halfSize; z++) {
      if (!isOnPlatform(x, z))
        continue
      const isEntrance = z === shrineZ + halfSize && Math.abs(x - shrineX) <= STAIR_HALF_WIDTH
      const isEdge = !isOnPlatform(x + 1, z) || !isOnPlatform(x - 1, z) || !isOnPlatform(x, z + 1) || !isOnPlatform(x, z - 1)
      fillColumn(x, z, CAUSEWAY_Y, isEdge && !isEntrance ? BlockId.BASALT : BlockId.STONE_TILE)
      if (isEdge && !isEntrance)
        setBlock(state, x, CAUSEWAY_Y + 1, z, BlockId.FENCE)
    }
  }

  /** 刻紋石碑與一對石燈籠，照地獄谷；立在北緣的柵欄前，碑後隔著熔岩就是大鳥居 */
  const steleZ = shrineZ - halfSize + 2
  setBlock(state, shrineX, CAUSEWAY_Y + 1, steleZ, BlockId.RUNE_STONE)
  setBlock(state, shrineX, CAUSEWAY_Y + 2, steleZ, BlockId.RUNE_STONE)
  setBlock(state, shrineX, CAUSEWAY_Y + 3, steleZ, BlockId.STONE_SLAB)
  placeStoneLantern(state, shrineX - 3, CAUSEWAY_Y + 1, steleZ)
  placeStoneLantern(state, shrineX + 3, CAUSEWAY_Y + 1, steleZ)

  /** 立在熔岩裡的大鳥居：柱腳的石礎沉在熔岩那一層 */
  placeTorii(state, LAVA_TORII.x, LAKE_Y + 1, LAVA_TORII.z, true, LAVA_TORII.halfWidth, LAVA_TORII.height)
}

/**
 * 湯瀧：崖邊的小熱泉與翻下崖的那一道水
 *
 * 泉池照一般的熱泉；一道一格寬的水溝從池子往北流到崖邊，鑽過岩唇底下（那一格頭上留著岩，人鑽不過去），
 * 貼著崖面落到湖邊一塊岩棚上。岩棚上那一團蒸氣由渲染端冒（見 jigoku-steam）
 */
function carveSpillSpring(state: Uint8Array, { kindMap, topMap }: TerrainMap): void {
  placeHotPool(state, { ...SPILL_SPRING, kind: 'spring' })

  const x = SPILL_SPRING.x
  let z = Math.round(SPILL_SPRING.z - SPILL_SPRING.radius)
  while (kindMap[toIndex(x, z)] === KIND_TERRACE) {
    setBlock(state, x, TERRACE_Y, z, BlockId.WATER)
    setBlock(state, x, TERRACE_Y - 1, z, BlockId.CLAY)
    const isUnderLip = topMap[toIndex(x, z)]! > TERRACE_Y
    if (!isUnderLip)
      setBlock(state, x, TERRACE_Y + 1, z, BlockId.AIR)
    z--
  }

  for (let y = LAKE_Y + 1; y <= TERRACE_Y; y++) {
    setBlock(state, x, y, z, BlockId.FLOWING_WATER)
  }
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 1; offsetZ++) {
      if (Math.abs(offsetX) + Math.abs(offsetZ) > 3)
        continue
      if (kindMap[toIndex(x + offsetX, z + offsetZ)] === KIND_LAKE && getBlock(state, x + offsetX, LAKE_Y, z + offsetZ) === BlockId.LAVA_FIELD)
        setBlock(state, x + offsetX, LAKE_Y, z + offsetZ, BlockId.BASALT)
    }
  }
}

/**
 * 一池熱泉或泥池
 *
 * 熱泉：兩格深的水、黏土底與池壁，池緣一圈硫磺黃的砂岩；
 * 泥池：一格深，水底就是灰泥，池緣也是灰泥，看起來是一池混濁的泥湯
 */
function placeHotPool(state: Uint8Array, pool: HotPool): void {
  const depth = pool.kind === 'spring' ? 2 : 1
  const limit = Math.ceil(pool.radius + 3)
  for (let offsetX = -limit; offsetX <= limit; offsetX++) {
    for (let offsetZ = -limit; offsetZ <= limit; offsetZ++) {
      const x = pool.x + offsetX
      const z = pool.z + offsetZ
      const distance = getNoisyDistance(x, z, pool.x, pool.z, 0.3, 1.2)
      if (distance <= pool.radius) {
        for (let level = 0; level < depth; level++) {
          setBlock(state, x, TERRACE_Y - level, z, BlockId.WATER)
        }
        setBlock(state, x, TERRACE_Y - depth, z, BlockId.CLAY)
        continue
      }
      if (getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      if (distance <= pool.radius + 1) {
        setBlock(state, x, TERRACE_Y, z, BlockId.CLAY)
        continue
      }
      if (pool.kind === 'spring' && distance <= pool.radius + 2.6) {
        setBlock(state, x, TERRACE_Y, z, BlockId.SANDSTONE)
      }
    }
  }
}

/**
 * 噴氣孔
 *
 * 一圈一格高的圓石圍著一個往下兩格的洞，洞底是礫石；四周兩格半的地被硫磺染成黃的砂岩。
 * 蒸氣由渲染端從洞口往上冒
 */
function placeSteamVent(state: Uint8Array, vent: { x: number; z: number }): void {
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -3; offsetZ <= 3; offsetZ++) {
      const x = vent.x + offsetX
      const z = vent.z + offsetZ
      if (getNoisyDistance(x, z, vent.x, vent.z, 0.4, 1) > 2.6)
        continue
      if (getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      setBlock(state, x, TERRACE_Y, z, BlockId.SANDSTONE)
    }
  }
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      if (offsetX === 0 && offsetZ === 0)
        continue
      setBlock(state, vent.x + offsetX, JIGOKU_FOOT_Y, vent.z + offsetZ, Math.abs(offsetX) + Math.abs(offsetZ) === 2 ? BlockId.SANDSTONE : BlockId.COBBLESTONE)
    }
  }
  setBlock(state, vent.x, TERRACE_Y, vent.z, BlockId.AIR)
  setBlock(state, vent.x, TERRACE_Y - 1, vent.z, BlockId.GRAVEL)
}

/**
 * 硫磺階地
 *
 * 火口壁腳一口泉眼，流出來的熱水一層一層結成礦華：三階硫磺黃的砂岩，一階比一階小、高一格，
 * 每一階外緣一圈高起來的邊、裡面積著一窪水，最頂上是泉眼
 */
function buildSulphurTerrace(state: Uint8Array, { kindMap, topMap }: TerrainMap): void {
  const { x: sourceX, z: sourceZ, radius, tierCount } = SULPHUR_TERRACE
  const measureTier = (x: number, z: number): number => {
    if (kindMap[toIndex(x, z)] !== KIND_TERRACE)
      return 0
    const distance = getNoisyDistance(x, z, sourceX, sourceZ, 0.25, 1.4)
    return Math.max(0, Math.min(tierCount, Math.ceil((radius - distance) / (radius / tierCount))))
  }

  for (let x = sourceX - radius - 2; x <= sourceX + radius + 2; x++) {
    for (let z = sourceZ - radius - 2; z <= sourceZ + radius + 2; z++) {
      const tier = measureTier(x, z)
      if (tier === 0)
        continue
      const tierTopY = TERRACE_Y + tier
      for (let y = TERRACE_Y; y <= tierTopY; y++) {
        setBlock(state, x, y, z, BlockId.SANDSTONE)
      }
      for (let y = tierTopY + 1; y <= topMap[toIndex(x, z)]!; y++) {
        setBlock(state, x, y, z, BlockId.AIR)
      }
      topMap[toIndex(x, z)] = tierTopY
      /** 這一階的外緣（旁邊有比它矮的）留著當邊，裡面那幾格換成水 */
      const isRim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) => measureTier(x + offsetX!, z + offsetZ!) < tier)
      if (!isRim)
        setBlock(state, x, tierTopY, z, BlockId.WATER)
    }
  }
}

/** 木棧中心線上的點：回程門往北到到著台的那一段，加上往東西兩臂的兩條 */
function sampleBoardwalk(): { x: number; z: number }[] {
  const sampleList: { x: number; z: number }[] = []
  for (let z = JIGOKU_PORTAL_POINT.z - 1; z >= BOARDWALK_SPUR_END_Z; z -= 0.5) {
    sampleList.push({ x: JIGOKU_PORTAL_POINT.x, z })
  }
  sampleList.push(...samplePathCurve(BOARDWALK_WEST_POINT_LIST, 24), ...samplePathCurve(BOARDWALK_EAST_POINT_LIST, 24))
  return sampleList
}

/** 每一格離木棧中心線多遠，以及它對應到中心線上第幾點（柵欄留口用） */
function createBoardwalkMap(): { distanceMap: Float32Array; indexMap: Int32Array } {
  const distanceMap = new Float32Array(WORLD_SIZE * WORLD_SIZE).fill(Number.POSITIVE_INFINITY)
  const indexMap = new Int32Array(WORLD_SIZE * WORLD_SIZE).fill(-1)
  const reach = 4
  for (const [sampleIndex, point] of sampleBoardwalk().entries()) {
    for (let x = Math.floor(point.x - reach); x <= Math.ceil(point.x + reach); x++) {
      for (let z = Math.floor(point.z - reach); z <= Math.ceil(point.z + reach); z++) {
        const index = toIndex(x, z)
        const distance = Math.hypot(x - point.x, z - point.z)
        if (distance < distanceMap[index]!) {
          distanceMap[index] = distance
          indexMap[index] = sampleIndex
        }
      }
    }
  }
  return { distanceMap, indexMap }
}

/**
 * 木棧與柵欄
 *
 * 約三格寬的半磚木板，比台地高半格；兩側一排柵欄，每隔一段留一個口。
 * 鳥居與回程門那一段不圍（柵欄會撞上鳥居的柱子）；到著台與展望台鋪的是石板，木棧到那裡就停
 */
function placeBoardwalk(state: Uint8Array, { kindMap, topMap }: TerrainMap, distanceMap: Float32Array, indexMap: Int32Array): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = toIndex(x, z)
      const distance = distanceMap[index]!
      if (distance > RAILING_HALF_WIDTH || kindMap[index] !== KIND_TERRACE || topMap[index] !== TERRACE_Y)
        continue
      if (isPavedSpot(x, z) || getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      if (distance <= BOARDWALK_HALF_WIDTH) {
        setBlock(state, x, JIGOKU_FOOT_Y, z, BlockId.WOOD_SLAB)
        continue
      }

      const isSpur = Math.abs(x - JIGOKU_PORTAL_POINT.x) <= 3 && z > JIGOKU_TORII_Z - 3
      const isGap = indexMap[index]! % RAILING_GAP_PERIOD < RAILING_GAP_LENGTH
      if (isSpur || isGap)
        continue
      setBlock(state, x, JIGOKU_FOOT_Y, z, BlockId.FENCE)
    }
  }
}

/**
 * 到著台與展望台：鋪石板，崖邊圍柵欄
 *
 * 這幾處崖邊不墊岩唇（岩唇會擋住往下看的那一眼），改用柵欄；到著台正中留五格是石階的口
 */
function pavePlazaList(state: Uint8Array, { kindMap, topMap }: TerrainMap): void {
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const index = toIndex(x, z)
      if (kindMap[index] !== KIND_TERRACE || !isPavedSpot(x, z))
        continue
      for (let y = TERRACE_Y + 1; y <= topMap[index]!; y++) {
        setBlock(state, x, y, z, BlockId.AIR)
      }
      topMap[index] = TERRACE_Y
      setBlock(state, x, TERRACE_Y, z, BlockId.STONE_TILE)

      const isStairHead = z === OVERLOOK_EDGE_Z && Math.abs(x - JIGOKU_CENTER.x) <= STAIR_HALF_WIDTH
      /** 旁邊不是台地的都算崖邊：石階兩側的岩墩與碎石坡也在內，柵欄才會一路接到石階的柵欄上 */
      const isEdge = hasNeighbourKind(kindMap, x, z, KIND_LAKE, true) || hasNeighbourKind(kindMap, x, z, KIND_WALL, true)
      if (!isStairHead && isEdge)
        setBlock(state, x, JIGOKU_FOOT_Y, z, BlockId.FENCE)
    }
  }

  /** 石階口兩側各一盞石燈籠：入夜到著台上唯一的光，標出往下走的路 */
  for (const side of [-1, 1]) {
    placeStoneLantern(state, JIGOKU_CENTER.x + side * (STAIR_HALF_WIDTH + 2), JIGOKU_FOOT_Y, OVERLOOK_EDGE_Z + 2)
  }
}

/**
 * 湖面上的熱點：那幾格真的 LAVA
 *
 * 每個定點找最近一格露著的熔岩換成 LAVA（找不到就不放，數量由檢查腳本對）
 */
function placeLavaLightList(state: Uint8Array): void {
  for (const point of LAVA_LIGHT_POINT_LIST) {
    let best: { x: number; z: number; distance: number } | null = null
    for (let offsetX = -4; offsetX <= 4; offsetX++) {
      for (let offsetZ = -4; offsetZ <= 4; offsetZ++) {
        const x = point.x + offsetX
        const z = point.z + offsetZ
        const distance = Math.hypot(offsetX, offsetZ)
        if (isOpenLava(state, x, z) && (!best || distance < best.distance))
          best = { x, z, distance }
      }
    }
    if (best)
      setBlock(state, best.x, LAKE_Y, best.z, BlockId.LAVA)
  }
}

/** 這一格四周 reach 格內是不是乾淨的台地：地面是岩，頭上是空的 */
function isClearFloor(state: Uint8Array, { kindMap, topMap }: TerrainMap, x: number, z: number, reach: number): boolean {
  for (let offsetX = -reach; offsetX <= reach; offsetX++) {
    for (let offsetZ = -reach; offsetZ <= reach; offsetZ++) {
      const index = toIndex(x + offsetX, z + offsetZ)
      if (kindMap[index] !== KIND_TERRACE || topMap[index] !== TERRACE_Y)
        return false
      if (!PLANT_GROUND_SET.has(getBlock(state, x + offsetX, TERRACE_Y, z + offsetZ)))
        return false
      if (getBlock(state, x + offsetX, JIGOKU_FOOT_Y, z + offsetZ) !== BlockId.AIR)
        return false
    }
  }
  return true
}

/**
 * 這一格是不是貼著細節小景（蛋攤、足湯、賽之河原）或到著台
 *
 * 細節小景排在枯木之後才蓋，蓋的時候只看自己那幾格空不空：枯木種在旁邊一格，
 * 岔出去的枝會插進野點傘或足湯的木頂裡
 */
function isNearDetailSpot(x: number, z: number): boolean {
  if (Math.hypot(x - EGG_STALL_POINT.x, z - EGG_STALL_POINT.z) < 5 || Math.hypot(x - CAIRN_FIELD.x, z - CAIRN_FIELD.z) < CAIRN_FIELD.radius + 2)
    return true
  if (Math.hypot(x - OVERLOOK_PLAZA.x, z - OVERLOOK_PLAZA.z) < OVERLOOK_PLAZA.radius + 3)
    return true
  return x >= FOOT_BATH_RECT.minX - 4 && x <= FOOT_BATH_RECT.maxX + 4 && z >= FOOT_BATH_RECT.minZ - 4 && z <= FOOT_BATH_RECT.maxZ + 4
}

/** 長得出東西、立得住枯木的地面：玄武岩與黑曜石磚上寸草不生 */
const PLANT_GROUND_SET = new Set([BlockId.STONE, BlockId.COBBLESTONE, BlockId.GRAVEL])

/**
 * 站著死掉的炭黑枯木與白骨，照地獄谷
 *
 * 枯木全在離崖邊遠的地方（被熱氣慢慢烤死的，離熔岩越近死得越徹底、連樹幹都不剩），木棧與池子旁邊不放；
 * 白骨少而不明顯，只擺在火口壁腳的角落
 */
function placeDeadTreeList(state: Uint8Array, terrain: TerrainMap, distanceMap: Float32Array, random: () => number): void {
  let treeCount = 0
  for (let attempt = 0; attempt < 900 && treeCount < 30; attempt++) {
    const x = Math.round(JIGOKU_CENTER.x + (random() * 2 - 1) * CRATER_RADIUS_X)
    const z = Math.round(JIGOKU_CENTER.z + (random() * 2 - 1) * CRATER_RADIUS_Z)
    const height = 3 + Math.floor(random() * 3)
    if (terrain.kindMap[toIndex(x, z)] !== KIND_TERRACE || distanceMap[toIndex(x, z)]! < 5 || isNearDetailSpot(x, z))
      continue
    if ((measureCraterRatio(x, z) - 1) * CRATER_RADIUS_Z > -3 || !isClearFloor(state, terrain, x, z, 2))
      continue
    placeDeadTree(state, x, JIGOKU_FOOT_Y, z, height, CHARRED_LOG_SET)
    treeCount++
  }

  let boneCount = 0
  for (let attempt = 0; attempt < 900 && boneCount < 8; attempt++) {
    const x = Math.round(JIGOKU_CENTER.x + (random() * 2 - 1) * CRATER_RADIUS_X)
    const z = Math.round(JIGOKU_CENTER.z + (random() * 2 - 1) * CRATER_RADIUS_Z)
    if (terrain.kindMap[toIndex(x, z)] !== KIND_TERRACE)
      continue
    const wallDistance = (measureCraterRatio(x, z) - 1) * CRATER_RADIUS_Z
    if (wallDistance > -3 || wallDistance < -7 || !isClearFloor(state, terrain, x, z, 0))
      continue
    setDecoration(state, x, JIGOKU_FOOT_Y, z, BlockId.BONES)
    boneCount++
  }
}

/**
 * 熱氣烤不死的那幾種，照地獄谷：枯灌五成、枯草三成、石生植物兩成，撒在一成半的石、圓石與礫上。
 * 一株開花的都沒有；玄武岩與黑曜石磚上什麼都不長
 */
function scatterPlantList(state: Uint8Array, { kindMap, topMap }: TerrainMap): void {
  const random = createSeededRandom('jigoku-plant')
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (random() > 0.15)
        continue
      const index = toIndex(x, z)
      if (kindMap[index] !== KIND_TERRACE || topMap[index] !== TERRACE_Y)
        continue
      if (!PLANT_GROUND_SET.has(getBlock(state, x, TERRACE_Y, z)) || getBlock(state, x, JIGOKU_FOOT_Y, z) !== BlockId.AIR)
        continue
      const roll = random()
      const blockId = roll < 0.5 ? BlockId.DRY_SHRUB : roll < 0.8 ? BlockId.DRY_GRASS : BlockId.STONE_PLANT
      plantWithStack(state, x, JIGOKU_FOOT_Y, z, blockId, random)
    }
  }
}

/** 生成整座湯煙谷 */
export function generateJigokuWorld(state: Uint8Array): void {
  const random = createSeededRandom('jigoku-valley')
  const terrain = classifyTerrain()
  fillColumnList(state, terrain)

  layLavaField(state, terrain)
  placeBasaltStackList(state, terrain)
  for (const fall of LAVA_FALL_LIST) {
    carveLavaFall(state, terrain, fall)
  }
  scatterCrustList(state, terrain)
  buildCauseway(state, terrain)
  pavePlazaList(state, terrain)

  for (const pool of HOT_POOL_LIST) {
    placeHotPool(state, pool)
  }
  carveSpillSpring(state, terrain)
  for (const vent of STEAM_VENT_LIST) {
    placeSteamVent(state, vent)
  }
  buildSulphurTerrace(state, terrain)

  const { distanceMap, indexMap } = createBoardwalkMap()
  placeBoardwalk(state, terrain, distanceMap, indexMap)
  /** 鳥居跨在回程門往北那一段木棧上，人一出門先穿過它，照地獄谷 */
  placeTorii(state, JIGOKU_PORTAL_POINT.x, JIGOKU_FOOT_Y, JIGOKU_TORII_Z, true)
  placeLavaLightList(state)

  placeDeadTreeList(state, terrain, distanceMap, random)
  scatterPlantList(state, terrain)
  /** 細節小景排在枯木與花草之後：硫磺華、告示、小攤、足湯與賽之河原 */
  decorateJigoku(state)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of JIGOKU_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
