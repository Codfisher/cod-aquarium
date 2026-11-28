import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { placeDeadTree, plantWithStack, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { findTopSolidY, isWaterSurface } from '../realm-terrain-kit'
import { placeSwampSetPieceList, scatterSwampDetail } from './swamp-detail'
import {
  BOARDWALK_POINT_LIST,
  MARSH_RADIUS,
  MARSH_RIM_WIDTH,
  measureMarshDistance,
  PLATFORM_LIST,
  SWAMP_CENTER,
  SWAMP_DEEP_FLOOR_Y,
  SWAMP_PORTAL_POINT,
  SWAMP_WATER_Y,
} from './swamp-layout'
import { SWAMP_REALM } from './swamp-realm'

/**
 * 千蛙沼的地形
 *
 * 只有地形 worker 用。整片照蛙聲澤（buildSwampGarden）放大：
 * 蛙聲澤是一方泥地木座，大半挖成一格深、黏土鋪底的淺水，
 * 泥灘的邊界用分形噪音畫（有大有小、有連有斷，不是一張棋盤）；
 * 半磚木棧兩排並著走，單側每三格一根先打木樁再架的欄杆；
 * 中段一座歇腳的平台、盡頭欄杆與一根木樁頂紙燈；枯木從水裡直接站起來；
 * 水面只鋪睡蓮，稈類（叢林草、紙莎草）、褐菇與捲葉草只長在踩得到實地的泥灘上。
 * 這裡一樣一樣照搬：泥灘放大成一塊一塊的島，木棧彎彎曲曲走過整片水，平台擺三座。
 *
 * 蛙鳴是會「對話」的聲音，水面要夠寬、夠散，聲音才傳得過去：
 * 泥灘只佔三成上下，剩下的都是水。
 *
 * 順序有講究：先有地形與水，木棧才架得上去；枯木與花草避開木棧；
 * 傳送門排在花草之後，門洞與木牌前面那幾格要清乾淨；睡蓮最後鋪
 */

/** 泥灘與沼澤邊那一圈的分界：比這個近是泥水交錯，再往外只剩淺水 */
const INNER_RADIUS = MARSH_RADIUS - MARSH_RIM_WIDTH

/**
 * 泥灘的門檻
 *
 * 噪音高過它的是泥灘。蛙聲澤用的是 0.18（頻率 0.15），
 * 這裡頻率放慢成 0.06，泥灘大了兩倍多，門檻放低一點，泥灘佔三成上下
 */
const MUD_THRESHOLD = 0.12

/**
 * 枯木幾棵
 *
 * 蛙聲澤三十格見方裡站著十來棵；沼澤大了十幾倍，照比例種會是一整片枯林，
 * 只種四十棵：從木棧望出去，霧裡零零落落幾根灰影
 */
const DEAD_TREE_COUNT = 40

/** 木棧的甲板是下半磚，鋪在水面上一格，與蛙聲澤同一個高度 */
const DECK_Y = SWAMP_WATER_Y + 1

const MUD_PLANT_LIST = [
  { blockId: BlockId.JUNGLE_GRASS, upTo: 0.4 },
  { blockId: BlockId.PAPYRUS, upTo: 0.7 },
  { blockId: BlockId.BROWN_MUSHROOM, upTo: 0.86 },
  { blockId: BlockId.CURLY_PLANT, upTo: 1 },
] as const

/** 一格的鍵，木棧與平台的格子用它收進 Set */
function toCellKey(x: number, z: number): string {
  return `${x},${z}`
}

/** 沼澤中心加上偏移的格子 */
function atMarsh(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: SWAMP_CENTER.x + offsetX, z: SWAMP_CENTER.z + offsetZ }
}

/**
 * 回程門前那一塊泥岸
 *
 * 門洞往東三排、南北各五格一定是泥：門柱、木牌、紙燈與木棧的起點都落在上面，
 * 噪音的泥灘若在這裡挖出一窪水，門柱會一根站在泥上、一根泡在水裡。
 * 再往東六排收窄成一道沿著木棧伸出去的泥岬（寬窄吃噪音）：
 * 落地的那一眼近處是泥與草、遠處才是一片水，
 * 近處整片是水的話，水面的像素佔掉大半個畫面，高畫質在這裡掉一成以上的幀
 */
function isGateBank(x: number, z: number): boolean {
  const inland = x - SWAMP_PORTAL_POINT.x
  const across = Math.abs(z - SWAMP_PORTAL_POINT.z)
  if (inland < 0 || inland > 9)
    return false
  if (inland <= 3)
    return across <= 5
  return across <= 3 + fbm2D(x * 0.3 + 7, z * 0.3 - 7, 2, 0.5) * 2
}

/**
 * 這一格是不是泥灘
 *
 * 越靠沼澤邊，門檻越高，泥灘一塊塊散掉，邊上那一圈只剩零星的泥點
 */
function isMud(x: number, z: number, distance: number): boolean {
  if (isGateBank(x, z))
    return true
  const edgeRatio = Math.min(1, Math.max(0, (distance - (INNER_RADIUS - 12)) / 12))
  const threshold = MUD_THRESHOLD + edgeRatio * edgeRatio * 0.36
  return fbm2D(x * 0.06 + 11, z * 0.06 - 29, 4, 0.5) > threshold
}

/**
 * 水底某一格柱的頂面高度
 *
 * 沼澤裡是一格深，零星幾窪兩格深；沼澤外先一段一兩格深的淺水，
 * 再一段斜坡下到五格深。斜坡吃一點噪音，才不是一圈一圈的同心台階
 */
function measureBedTopY(x: number, z: number, distance: number): number {
  if (distance < MARSH_RADIUS) {
    const isPocket = fbm2D(x * 0.11 - 5, z * 0.11 + 37, 2, 0.5) > 0.32
    return SWAMP_WATER_Y - (isPocket ? 2 : 1)
  }

  const offshore = distance - MARSH_RADIUS
  if (offshore < 4)
    return SWAMP_WATER_Y - 1
  if (offshore < 8)
    return SWAMP_WATER_Y - 2
  const bump = Math.round(fbm2D(x * 0.08, z * 0.08, 2, 0.5) * 1.2)
  const slope = SWAMP_WATER_Y - 2 - Math.floor((offshore - 8) * 0.5) + bump
  return Math.max(SWAMP_DEEP_FLOOR_Y, Math.min(SWAMP_WATER_Y - 2, slope))
}

/** 泥灘、淺水與外圍的深水 */
function shapeTerrain(state: Uint8Array): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      setBlock(state, x, 0, z, BlockId.BEDROCK)
      const distance = measureMarshDistance(x, z)

      if (distance < INNER_RADIUS && isMud(x, z, distance)) {
        for (let y = 1; y < SWAMP_WATER_Y - 2; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        for (let y = SWAMP_WATER_Y - 2; y <= SWAMP_WATER_Y; y++) {
          setBlock(state, x, y, z, BlockId.DIRT)
        }
        continue
      }

      /** 沼澤邊那一圈偶爾冒出一點泥 */
      if (distance < MARSH_RADIUS && fbm2D(x * 0.21 + 3, z * 0.21 + 3, 2, 0.5) > 0.5) {
        for (let y = 1; y <= SWAMP_WATER_Y; y++) {
          setBlock(state, x, y, z, y < SWAMP_WATER_Y - 2 ? BlockId.STONE : BlockId.DIRT)
        }
        continue
      }

      const bedY = measureBedTopY(x, z, distance)
      /** 到底之後是平的：外圍深水的水底不畫方塊，由一整片平面代替（見 LAKE_BED） */
      const isDeep = bedY <= SWAMP_DEEP_FLOOR_Y
      for (let y = 1; y < bedY; y++) {
        setBlock(state, x, y, z, isDeep ? BlockId.LAKE_BED : BlockId.STONE)
      }
      setBlock(state, x, bedY, z, isDeep ? BlockId.LAKE_BED : BlockId.CLAY)
      for (let y = bedY + 1; y <= SWAMP_WATER_Y; y++) {
        setBlock(state, x, y, z, BlockId.WATER)
      }
    }
  }
}

/** 木棧與平台佔的格子，枯木與欄杆要避開 */
interface BoardwalkPlan {
  walkSet: Set<string>;
  platformSet: Set<string>;
  /** 欄杆的木樁：沿著木棧單側每三格一根，平台盡頭一整排 */
  railingList: { x: number; z: number }[];
}

/**
 * 木棧的走法
 *
 * 從回程門東側一格起，照 BOARDWALK_POINT_LIST 一段一段走：
 * 沿 X 走的那幾段佔這一排與南邊一排，沿 Z 走的佔這一欄與東邊一欄，兩排並著走。
 * 扶手只做一側（沿 X 走的在北、沿 Z 走的在西），另一側才看得出水有多寬
 */
function planBoardwalk(): BoardwalkPlan {
  const walkSet = new Set<string>()
  const railingCandidateList: { x: number; z: number }[] = []
  const pointList = [
    { x: SWAMP_PORTAL_POINT.x + 1, z: SWAMP_PORTAL_POINT.z },
    ...BOARDWALK_POINT_LIST.map((point) => atMarsh(point.offsetX, point.offsetZ)),
  ]

  for (let index = 0; index < pointList.length - 1; index++) {
    const from = pointList[index]!
    const to = pointList[index + 1]!
    const isAlongX = from.z === to.z
    const start = isAlongX ? Math.min(from.x, to.x) : Math.min(from.z, to.z)
    const end = isAlongX ? Math.max(from.x, to.x) : Math.max(from.z, to.z)

    for (let along = start; along <= end + 1; along++) {
      const x = isAlongX ? along : from.x
      const z = isAlongX ? from.z : along
      walkSet.add(toCellKey(x, z))
      walkSet.add(toCellKey(isAlongX ? x : x + 1, isAlongX ? z + 1 : z))
      if (along % 3 === 0) {
        railingCandidateList.push(isAlongX ? { x, z: z - 1 } : { x: x - 1, z })
      }
    }
  }

  const platformSet = new Set<string>()
  const railingList: { x: number; z: number }[] = []
  for (const platform of PLATFORM_LIST) {
    const min = atMarsh(platform.minX, platform.minZ)
    const max = atMarsh(platform.maxX, platform.maxZ)
    for (let x = min.x; x <= max.x; x++) {
      for (let z = min.z; z <= max.z; z++) {
        platformSet.add(toCellKey(x, z))
      }
    }

    /** 平台盡頭那一排欄杆 */
    if (platform.railing === 'north' || platform.railing === 'south') {
      const z = platform.railing === 'north' ? min.z - 1 : max.z + 1
      for (let x = min.x; x <= max.x; x++) railingList.push({ x, z })
    }
    else {
      for (let z = min.z; z <= max.z; z++) railingList.push({ x: max.x + 1, z })
    }
  }

  /** 沿路的扶手落在木棧或平台上的就不要，回程門前那幾格也空著 */
  for (const point of railingCandidateList) {
    const key = toCellKey(point.x, point.z)
    if (walkSet.has(key) || platformSet.has(key) || point.x <= SWAMP_PORTAL_POINT.x + 3)
      continue
    railingList.push(point)
  }

  return { walkSet, platformSet, railingList }
}

/**
 * 一根從水底（或泥上）打上來的木樁
 *
 * 蛙聲澤的欄杆與紙燈底下都先打一根實心的木樁：直接站在水面上會整根浮著。
 * 立在水裡的從水底一路疊上來，從岸上斜看過去才不是一塊木頭浮在水面
 */
function placePost(state: Uint8Array, x: number, z: number, topY: number): void {
  for (let y = findTopSolidY(state, x, z, SWAMP_WATER_Y) + 1; y <= topY; y++) {
    setBlock(state, x, y, z, BlockId.PLANKS)
  }
}

/**
 * 木棧、平台、欄杆與紙燈
 *
 * 甲板是下半磚，鋪在水面上一格；甲板上方三格清空，花草與枯枝不會從木板裡穿出來
 */
function buildBoardwalk(state: Uint8Array, plan: BoardwalkPlan): void {
  for (const key of [...plan.walkSet, ...plan.platformSet]) {
    const [x, z] = key.split(',').map(Number) as [number, number]
    setBlock(state, x, DECK_Y, z, BlockId.WOOD_SLAB)
    for (let y = DECK_Y + 1; y <= DECK_Y + 3; y++) {
      setBlock(state, x, y, z, BlockId.AIR)
    }
  }

  for (const point of plan.railingList) {
    placePost(state, point.x, point.z, DECK_Y)
    setBlock(state, point.x, DECK_Y + 1, point.z, BlockId.FENCE)
  }

  /** 每座平台旁一根木樁頂紙燈，回程門南側四格的泥岸上再一根 */
  const lampList = [
    ...PLATFORM_LIST.map((platform) => atMarsh(platform.lampX, platform.lampZ)),
    { x: SWAMP_PORTAL_POINT.x, z: SWAMP_PORTAL_POINT.z + 4 },
  ]
  for (const lamp of lampList) {
    placePost(state, lamp.x, lamp.z, DECK_Y)
    setBlock(state, lamp.x, DECK_Y + 1, lamp.z, BlockId.PAPER_LAMP)
  }
}

/**
 * 枯木
 *
 * 蛙聲澤唯一的立面。立在水裡的從水底長上來，不是浮在水面上；
 * 離木棧兩格以上，不擋路，也不會有枝椏橫過甲板。
 * 沼澤邊上與外圍的淺水也站幾棵，從木棧望出去，霧裡一根一根的灰影就是沼澤的邊
 */
function placeDeadTreeList(state: Uint8Array, plan: BoardwalkPlan): void {
  const random = createSeededRandom('swamp-dead-tree')
  const reach = MARSH_RADIUS + 8
  const isNearDeck = (x: number, z: number) => {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
        const key = toCellKey(x + offsetX, z + offsetZ)
        if (plan.walkSet.has(key) || plan.platformSet.has(key))
          return true
      }
    }
    return false
  }

  let placedCount = 0
  for (let attempt = 0; attempt < 600 && placedCount < DEAD_TREE_COUNT; attempt++) {
    const x = SWAMP_CENTER.x + Math.round((random() * 2 - 1) * reach)
    const z = SWAMP_CENTER.z + Math.round((random() * 2 - 1) * reach)
    const heightRoll = random()
    if (measureMarshDistance(x, z) > reach)
      continue
    if (Math.hypot(x - SWAMP_PORTAL_POINT.x, z - SWAMP_PORTAL_POINT.z) < 7)
      continue
    if (isNearDeck(x, z))
      continue

    /** 水深超過兩格的就不種：枯木是站在淺水裡的，深水裡長不出來 */
    const groundY = findTopSolidY(state, x, z, SWAMP_WATER_Y) + 1
    if (groundY < SWAMP_WATER_Y - 1)
      continue

    const aboveWater = 4 + Math.floor(heightRoll * 4)
    placeDeadTree(state, x, groundY, z, aboveWater + (SWAMP_WATER_Y + 1 - groundY))
    placedCount++
  }
}

/**
 * 泥灘上的花草
 *
 * 與蛙聲澤同一組：叢林草、紙莎草、褐菇與捲葉草，三成的格子有東西。
 * 只長在泥灘上（踩得到實地），水面上不長稈
 */
function scatterMudPlantList(state: Uint8Array): void {
  const random = createSeededRandom('swamp-plant')
  const reach = MARSH_RADIUS

  for (let x = SWAMP_CENTER.x - reach; x <= SWAMP_CENTER.x + reach; x++) {
    for (let z = SWAMP_CENTER.z - reach; z <= SWAMP_CENTER.z + reach; z++) {
      if (random() > 0.3)
        continue
      if (getBlock(state, x, SWAMP_WATER_Y, z) !== BlockId.DIRT)
        continue
      if (getBlock(state, x, SWAMP_WATER_Y + 1, z) !== BlockId.AIR)
        continue
      /**
       * 回程門那一排（門柱、木牌、紙燈）與它兩側各一格不種：
       * 紙莎草一疊三四格高，木牌的柱子只換掉底下兩格，上面那截會浮在牌頂
       */
      if (Math.abs(x - SWAMP_PORTAL_POINT.x) <= 1 && Math.abs(z - SWAMP_PORTAL_POINT.z) <= 5)
        continue

      const roll = random()
      const plant = MUD_PLANT_LIST.find((entry) => roll < entry.upTo) ?? MUD_PLANT_LIST[0]
      plantWithStack(state, x, SWAMP_WATER_Y + 1, z, plant.blockId, random)
    }
  }
}

/**
 * 睡蓮
 *
 * 沼澤裡用低頻噪音決定哪裡成叢，均勻撒開的睡蓮看起來像一張貼紙；
 * 外圍的水只零星幾叢，越往外越少
 */
function scatterLilyPadList(state: Uint8Array): void {
  const random = createSeededRandom('swamp-lily')
  const reach = MARSH_RADIUS + 10

  for (let x = SWAMP_CENTER.x - reach; x <= SWAMP_CENTER.x + reach; x++) {
    for (let z = SWAMP_CENTER.z - reach; z <= SWAMP_CENTER.z + reach; z++) {
      if (!isWaterSurface(state, x, SWAMP_WATER_Y, z))
        continue

      const clump = fbm2D(x * 0.1 + 41, z * 0.1 - 13, 2, 0.5)
      const isInside = measureMarshDistance(x, z) < MARSH_RADIUS
      const chance = isInside ? (clump > 0 ? 0.38 : 0.04) : (clump > 0.3 ? 0.1 : 0)
      if (random() < chance) {
        setDecoration(state, x, SWAMP_WATER_Y + 1, z, BlockId.LILY_PAD)
      }
    }
  }
}

/** 生成整座千蛙沼 */
export function generateSwampWorld(state: Uint8Array): void {
  shapeTerrain(state)
  const plan = planBoardwalk()
  buildBoardwalk(state, plan)
  placeDeadTreeList(state, plan)
  /** 細節的造景零件排在泥灘花草之前，位置才是空的（見 swamp-detail） */
  placeSwampSetPieceList(state)
  scatterMudPlantList(state)

  /** 門框排在花草之後：門洞前後與木牌四周的花草由它清掉 */
  for (const portal of SWAMP_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  scatterLilyPadList(state)
  /** 地被排在最後：蓮只換已經有睡蓮的格子，泥灘的草與黏土只換頂面 */
  scatterSwampDetail(state)
}
