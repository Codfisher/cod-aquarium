import type { RealmDefinition } from './realm-definition'
import { fbm2D } from '../../utils/noise'
import { BLOCK_DEFS, BlockId, isDecorationBlock, isPassableBlock, isWaterBlock } from '../block/block-constants'
import { getBlock, setBlock } from '../world/world-access'
import { WORLD_SIZE } from '../world/world-constants'
import { findTopSolidY } from './realm-terrain-kit'

/**
 * 大場景「細節」那一層共用的小工具
 *
 * 只有地形 worker 用。地形、樹與主要的造景蓋完之後，各場景再補一層細節：
 * 成叢的地被、碎石、倒木、石堆、被人忘在路邊的小物。這一層有三條每座場景都一樣的規矩，
 * 各寫一份遲早會有一份漏掉：
 *
 * 一、門、出生點與神遊的站點四周不放東西（見 createDetailContext 的禁區）。
 * 二、只放在空氣裡、腳下是整格實心方塊的位置，不蓋掉既有的造景。
 * 三、地被用低頻噪音成叢，不均勻撒開——均勻撒的花草看起來像一張貼紙
 */

/** 一塊不放東西的圓：門、出生點、神遊的站點 */
export interface DetailKeepOutZone {
  x: number;
  z: number;
  radius: number;
}

export interface DetailContext {
  state: Uint8Array;
  random: () => number;
  /** 找地面時從這一層往下找，要比場景裡走得到的地面高、比樹冠低 */
  scanTopY: number;
  keepOutList: DetailKeepOutZone[];
  /**
   * 可以直接蓋掉的地被，當成空的
   *
   * 金葉林的地面幾乎鋪滿落葉，只找空著的格子就什麼都放不下。
   * 列在這裡的方塊（落葉、乾草）頂上那一格視同空氣，細節放上去就是換掉它
   */
  replaceableSet?: ReadonlySet<BlockId>;
}

/** 門框五格寬，連木牌與門前落地的那幾格一起留空 */
const PORTAL_KEEP_OUT_RADIUS = 5
const SPAWN_KEEP_OUT_RADIUS = 3
/** 神遊的站點只要腳下那一格與四周一圈是空的 */
const VIEWPOINT_KEEP_OUT_RADIUS = 1.6

/**
 * 建一份細節用的上下文，禁區從場景定義自動算出來
 *
 * 門、出生點、神遊特色主體的站點與路徑點都算。之後改了門的位置或補了站點，細節會自己讓開
 */
export function createDetailContext(
  state: Uint8Array,
  realm: RealmDefinition,
  random: () => number,
  scanTopY: number,
  replaceableSet?: ReadonlySet<BlockId>,
): DetailContext {
  const keepOutList: DetailKeepOutZone[] = [
    { x: realm.spawn.x, z: realm.spawn.z, radius: SPAWN_KEEP_OUT_RADIUS },
  ]
  for (const portal of realm.portalList) {
    keepOutList.push({ x: portal.x, z: portal.z, radius: PORTAL_KEEP_OUT_RADIUS })
  }
  for (const viewpoint of realm.driftViewpointList ?? []) {
    keepOutList.push({ x: viewpoint.x, z: viewpoint.z, radius: VIEWPOINT_KEEP_OUT_RADIUS })
  }
  for (const feature of realm.driftFeatureList ?? []) {
    for (const viewpoint of feature.viewpointList ?? []) {
      keepOutList.push({ x: viewpoint.x, z: viewpoint.z, radius: VIEWPOINT_KEEP_OUT_RADIUS })
    }
    for (const point of feature.pathList ?? []) {
      keepOutList.push({ x: point.x, z: point.z, radius: 1 })
    }
  }
  return { state, random, scanTopY, keepOutList, replaceableSet }
}

/** 這一格在不在禁區裡 */
export function isKeptOut(context: DetailContext, x: number, z: number): boolean {
  return context.keepOutList.some((zone) => Math.hypot(x - zone.x, z - zone.z) <= zone.radius)
}

/** 整格的實心方塊：東西立得住的地面。半磚、薄層、水、花草與樹葉（鏤空的）都不算 */
function isFullSolid(blockId: BlockId): boolean {
  return blockId !== BlockId.AIR
    && blockId !== BlockId.LAKE_BED
    && BLOCK_DEFS[blockId]?.cutout !== true
    && !isPassableBlock(blockId)
    && !isWaterBlock(blockId)
    && !isDecorationBlock(blockId)
    && BLOCK_DEFS[blockId]?.isLiquid !== true
}

export interface DetailGround {
  /** 地面那一格方塊的高度，東西放在 y + 1 */
  y: number;
  blockId: BlockId;
}

/**
 * 這一格柱可以放細節的地面
 *
 * 禁區裡、世界外、頂面不是整格實心、或頂上那一格已經有東西，都回傳 null
 */
export function findDetailGround(context: DetailContext, x: number, z: number, fromY = context.scanTopY): DetailGround | null {
  if (x < 1 || z < 1 || x >= WORLD_SIZE - 1 || z >= WORLD_SIZE - 1)
    return null
  if (isKeptOut(context, x, z))
    return null

  const y = findTopSolidY(context.state, x, z, fromY)
  if (y <= 0)
    return null
  const blockId = getBlock(context.state, x, y, z)
  if (!isFullSolid(blockId))
    return null
  const aboveBlock = getBlock(context.state, x, y + 1, z)
  if (aboveBlock !== BlockId.AIR && !context.replaceableSet?.has(aboveBlock))
    return null
  return { y, blockId }
}

/**
 * 在這一格柱的地面上放一個方塊，回傳放在哪一層（沒放成是 null）
 *
 * groundSet 有給的話，地面要是其中一種：沙上不長蕨、石板路上不擺石頭
 */
export function placeDetail(
  context: DetailContext,
  x: number,
  z: number,
  blockId: BlockId,
  groundSet?: ReadonlySet<BlockId>,
): number | null {
  const ground = findDetailGround(context, x, z)
  if (!ground || (groundSet && !groundSet.has(ground.blockId)))
    return null
  setBlock(context.state, x, ground.y + 1, z, blockId)
  return ground.y + 1
}

export interface DetailClusterParam {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 噪音的取樣位移，同一座場景的每一種地被給不同的值，叢才不會疊在同一處 */
  noiseOffset: number;
  /** 叢的大小：0.1 上下是十來格一叢，0.2 是五六格 */
  frequency: number;
  /** 噪音超過這個值的地方才長，越高叢越小越少（噪音大致落在 -0.6～0.6） */
  threshold: number;
  /** 叢裡每一格長出來的機率 */
  chance: number;
  pick: (random: () => number, x: number, z: number) => BlockId | null;
  groundSet: ReadonlySet<BlockId>;
  /** 額外的條件，例如只在水邊、只在林下 */
  isAllowed?: (x: number, z: number, ground: DetailGround) => boolean;
}

/**
 * 成叢地撒一種地被，回傳撒了幾格
 *
 * 低頻噪音決定哪裡有叢，叢心機率高、往邊緣淡掉，叢與叢之間是空的
 */
export function scatterDetailCluster(context: DetailContext, param: DetailClusterParam): number {
  let count = 0
  for (let x = param.minX; x <= param.maxX; x++) {
    for (let z = param.minZ; z <= param.maxZ; z++) {
      const density = fbm2D(x * param.frequency + param.noiseOffset, z * param.frequency - param.noiseOffset * 0.7, 2, 0.5) - param.threshold
      if (density <= 0)
        continue
      /** 越過門檻越多越密，叢的邊緣自然稀下來 */
      if (context.random() > param.chance * Math.min(1, 0.35 + density * 5))
        continue

      const ground = findDetailGround(context, x, z)
      if (!ground || !param.groundSet.has(ground.blockId))
        continue
      if (param.isAllowed && !param.isAllowed(x, z, ground))
        continue

      const blockId = param.pick(context.random, x, z)
      if (blockId === null)
        continue
      setBlock(context.state, x, ground.y + 1, z, blockId)
      count++
    }
  }
  return count
}

/**
 * 以一點為中心撒一小圈，越靠中心越密
 *
 * 石堆腳下的碎石、倒木旁的蕈、樹根四周的落葉都是這一種：東西是「因為那裡有什麼」才聚過去的
 */
export function scatterDetailRing(
  context: DetailContext,
  centerX: number,
  centerZ: number,
  radius: number,
  chance: number,
  pick: (random: () => number) => BlockId | null,
  groundSet?: ReadonlySet<BlockId>,
): number {
  let count = 0
  for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x++) {
    for (let z = Math.floor(centerZ - radius); z <= Math.ceil(centerZ + radius); z++) {
      const distance = Math.hypot(x - centerX, z - centerZ)
      if (distance > radius || context.random() > chance * (1 - distance / (radius + 1)))
        continue
      const blockId = pick(context.random)
      if (blockId !== null && placeDetail(context, x, z, blockId, groundSet) !== null)
        count++
    }
  }
  return count
}

export interface FallenLogParam {
  x: number;
  z: number;
  axis: 'x' | 'z';
  length: number;
  /** 順著 X 躺與順著 Z 躺各是一種方塊 */
  logBlockX: BlockId;
  logBlockZ: BlockId;
  /** 木頭頂上長的東西（苔毯、蕈），每一格依機率長 */
  topList?: readonly BlockId[];
  topChance?: number;
  /** 立在一頭的樹頭，倒木是從那裡斷的 */
  stumpBlock?: BlockId;
  /** 有給的話，整段底下都要是其中一種地面：倒木不躺到耙沙與石板上 */
  groundSet?: ReadonlySet<BlockId>;
}

/**
 * 一段倒木，回傳有沒有放成
 *
 * 整段要落在同一個高度的實心地面上、頭上是空的，不然木頭會一半懸空一半埋進坡裡。
 * 放不成就整段不放
 */
export function placeFallenLog(context: DetailContext, param: FallenLogParam): boolean {
  const stepX = param.axis === 'x' ? 1 : 0
  const stepZ = param.axis === 'z' ? 1 : 0
  const first = findDetailGround(context, param.x, param.z)
  if (!first)
    return false

  for (let index = 0; index < param.length; index++) {
    const ground = findDetailGround(context, param.x + stepX * index, param.z + stepZ * index)
    if (!ground || ground.y !== first.y || (param.groundSet && !param.groundSet.has(ground.blockId)))
      return false
  }

  const logBlock = param.axis === 'x' ? param.logBlockX : param.logBlockZ
  for (let index = 0; index < param.length; index++) {
    const x = param.x + stepX * index
    const z = param.z + stepZ * index
    setBlock(context.state, x, first.y + 1, z, logBlock)
    if (param.topList && param.topList.length > 0 && context.random() < (param.topChance ?? 0.5)) {
      const topBlock = param.topList[Math.floor(context.random() * param.topList.length)]!
      setBlock(context.state, x, first.y + 2, z, topBlock)
    }
  }

  if (param.stumpBlock !== undefined) {
    /** 樹頭立在倒木起點的後面兩格，中間空一格：樹是從那裡折斷倒下來的 */
    placeDetail(context, param.x - stepX * 2, param.z - stepZ * 2, param.stumpBlock)
  }
  return true
}

/**
 * 石堆（疊石）：一兩顆圓石疊起來，頂上一顆小石，腳邊幾顆碎石
 *
 * 山徑與岸邊的路標。回傳有沒有放成
 */
export function placeCairn(context: DetailContext, x: number, z: number, height: 1 | 2 = 1, baseBlock: BlockId = BlockId.COBBLESTONE): boolean {
  const ground = findDetailGround(context, x, z)
  if (!ground)
    return false
  for (let level = 1; level <= height; level++) {
    setBlock(context.state, x, ground.y + level, z, baseBlock)
  }
  setBlock(context.state, x, ground.y + height + 1, z, BlockId.SMALL_ROCK)
  scatterDetailRing(context, x, z, 1.6, 0.7, (random) => random() < 0.6 ? BlockId.PEBBLES : BlockId.SMALL_ROCK)
  return true
}

/**
 * 一小群石頭：一顆整格的、旁邊一兩顆小的，腳邊碎石
 *
 * capBlock 是大石頂上那一層（苔毯、薄雪），不給就是光的
 */
export function placeRockCluster(context: DetailContext, x: number, z: number, rockBlock: BlockId, capBlock?: BlockId): boolean {
  const ground = findDetailGround(context, x, z)
  if (!ground)
    return false
  setBlock(context.state, x, ground.y + 1, z, rockBlock)
  if (capBlock !== undefined)
    setBlock(context.state, x, ground.y + 2, z, capBlock)
  scatterDetailRing(context, x, z, 1.8, 0.6, (random) => random() < 0.5 ? BlockId.SMALL_ROCK : BlockId.PEBBLES)
  return true
}

/**
 * 一座大石：中間最高、四邊矮一階、斜角再矮一階或沒有，不是方方正正的一塊
 *
 * 每一格柱各自從自己的地面疊上去，放在緩坡上石腳也貼地。blockList 是混著用的幾種石（圓石、苔石、石），
 * capBlock 是露出來的頂面上那一層（苔毯、薄雪），依機率蓋。height 是中間那一柱的高度
 */
export function placeBoulderPile(
  context: DetailContext,
  x: number,
  z: number,
  height: number,
  blockList: readonly BlockId[],
  capBlock?: BlockId,
  capChance = 0.6,
): boolean {
  const center = findDetailGround(context, x, z)
  if (!center)
    return false

  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const ring = Math.abs(offsetX) + Math.abs(offsetZ)
      const columnHeight = ring === 0
        ? height
        : ring === 1
          ? height - 1 - (context.random() < 0.3 ? 1 : 0)
          : height - 2 - (context.random() < 0.45 ? 1 : 0)
      if (columnHeight <= 0)
        continue
      const ground = findDetailGround(context, x + offsetX, z + offsetZ)
      if (!ground || Math.abs(ground.y - center.y) > 1)
        continue
      const topY = center.y + columnHeight
      for (let y = ground.y + 1; y <= topY; y++) {
        setBlock(context.state, x + offsetX, y, z + offsetZ, blockList[Math.floor(context.random() * blockList.length)]!)
      }
      if (capBlock !== undefined && topY > ground.y && context.random() < capChance)
        setBlock(context.state, x + offsetX, topY + 1, z + offsetZ, capBlock)
    }
  }
  scatterDetailRing(context, x, z, 3, 0.5, (random) => random() < 0.6 ? BlockId.PEBBLES : BlockId.SMALL_ROCK)
  return true
}

/**
 * 路標：一根木樁頂著一片深色木板
 *
 * 岔路口與觀景點前各立一根。牌面順著 boardAxis 攤開
 */
export function placeSignpost(context: DetailContext, x: number, z: number, boardAxis: 'x' | 'z'): boolean {
  const ground = findDetailGround(context, x, z)
  if (!ground)
    return false
  setBlock(context.state, x, ground.y + 1, z, BlockId.WOOD_POST)
  setBlock(context.state, x, ground.y + 2, z, boardAxis === 'x' ? BlockId.STORM_PANEL_X : BlockId.STORM_PANEL_Z)
  return true
}

/** 椅背在哪一側，對應的木階梯方塊 */
const BENCH_BLOCK_MAP = {
  north: BlockId.WOOD_STAIRS_NORTH,
  south: BlockId.WOOD_STAIRS_SOUTH,
  east: BlockId.WOOD_STAIRS_EAST,
  west: BlockId.WOOD_STAIRS_WEST,
} as const

export type BenchBackSide = keyof typeof BENCH_BLOCK_MAP

/**
 * 長椅：兩格並排的木階梯，椅背在 backSide 那一側（人朝反方向坐著看出去）
 *
 * 兩格都放得下才放
 */
export function placeBench(context: DetailContext, x: number, z: number, backSide: BenchBackSide): boolean {
  const isAlongX = backSide === 'north' || backSide === 'south'
  const secondX = x + (isAlongX ? 1 : 0)
  const secondZ = z + (isAlongX ? 0 : 1)
  const first = findDetailGround(context, x, z)
  const second = findDetailGround(context, secondX, secondZ)
  if (!first || !second || first.y !== second.y)
    return false
  setBlock(context.state, x, first.y + 1, z, BENCH_BLOCK_MAP[backSide])
  setBlock(context.state, secondX, second.y + 1, secondZ, BENCH_BLOCK_MAP[backSide])
  return true
}

/**
 * 柴堆：兩根並排的短木、上面再橫一根，旁邊一截樹頭與一把斧頭
 *
 * 木頭順著 axis 躺。回傳有沒有放成
 */
export function placeWoodPile(
  context: DetailContext,
  x: number,
  z: number,
  axis: 'x' | 'z',
  logBlockX: BlockId,
  logBlockZ: BlockId,
  stumpBlock: BlockId,
): boolean {
  const sideX = axis === 'x' ? 0 : 1
  const sideZ = axis === 'x' ? 1 : 0
  const ground = findDetailGround(context, x, z)
  if (!ground || !placeFallenLog(context, { x, z, axis, length: 2, logBlockX, logBlockZ }))
    return false
  if (placeFallenLog(context, { x: x + sideX, z: z + sideZ, axis, length: 2, logBlockX, logBlockZ })) {
    /** 第三根壓在兩根上面：只有底下兩根都在才疊 */
    setBlock(context.state, x, ground.y + 2, z, axis === 'x' ? logBlockX : logBlockZ)
  }
  placeDetail(context, x - sideX * 2, z - sideZ * 2, stumpBlock)
  placeDetail(context, x - sideX, z - sideZ, BlockId.TOOL_AXE)
  return true
}
