import { BLOCK_DEFS, BlockId, isLavaBlock, isPassableBlock } from '../block/block-constants'
import { WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 世界裡的一個光源方塊 */
export interface BlockLightSource {
  x: number;
  y: number;
  z: number;
  /** 亮度等級 0 ～ 1 */
  level: number;
  /** 光色，火與燈籠的暖度不一樣 */
  color: [number, number, number];
  /** 是不是燒著的東西，火光要更亮、還要會晃 */
  isFire: boolean;
  /**
   * 這是不是一片躺平的面光源
   *
   * 只有岩漿。它與一盞燈籠差在兩件事：它不是一個點，而是一整片；
   * 而且圓盤有一半會埋在自己的液面底下。
   *
   * 兩件事現在都有解：埋在液面下的那半交給柔性淡出化開
   * （見 halo-soft-fade），一整片則靠更疏的格距與更大更淡的圓盤，
   * 讓幾顆疊起來是一層熱氣而不是一塊白。
   * 光暈那一側怎麼分別處理寫在 lamp-glow.ts
   */
  isAreaLight: boolean;
}

/**
 * 弱到不值得為它點一盞真光的等級
 *
 * 鑽石礦那種微光交給烘進去的方塊光就好，
 * 把它算進來只會佔掉燈池的名額
 */
const MIN_LIGHT_LEVEL = 0.5

/** 這幾種是燒著的，光色比燈籠更橘 */
const FIRE_BLOCK_SET = new Set<BlockId>([BlockId.EMBER, BlockId.LAVA, BlockId.FURNACE])

/**
 * 這幾種是躺平的面光源
 *
 * 只有岩漿。它一樣點真光、一樣有暈，只是兩者的擺法都要放疏
 */
const AREA_LIGHT_SET = new Set<BlockId>([BlockId.LAVA])

/**
 * 每幾格留一顆的格距指數
 *
 * 一般的燈是一個點，兩格一顆（指數一）剛好——燈籠本來就擺得比這疏，
 * 只有連成一串的餘燼會被收掉幾顆，而它們照出來的範圍幾乎完全重疊。
 *
 * 岩漿是一整池，兩格一顆會在液面上排出幾十顆光暈，
 * 相加混合疊起來就是一塊死白，而地獄谷正好是全場網格最多的地方。
 * 放到四格一顆（指數二），數量剩四分之一，
 * 再配上更大更淡的圓盤，疊出來的才是一層浮在液面上的熱氣
 */
const DEFAULT_CELL_SHIFT = 1
const AREA_LIGHT_CELL_SHIFT = 2

/**
 * 火塘的光要從火焰的高度發出來，不是從餘燼那一格的中心
 *
 * 營火的餘燼沉在地面那一層（爐火壇、營火谷），方塊中心比地面低半格。
 * 光源擺在那裡，四周的地面、矮凳的頂面全在光的「背面」（法線朝上、光從底下來），
 * 一點都照不到；只剩石圈與矮凳朝火的那幾個側面亮，整堆火只照亮腳邊一小圈。
 * 全局光的種子也落在被地面包住的那一格裡。
 *
 * 往上抬到火焰中段（餘燼頂面再一格半左右，高過半磚石圈），光才灑得到整片地、
 * 座位、棚子與旁邊的樹幹；全局光的種子跟著落進上面那一格空氣裡，光暈也正好罩住火焰。
 * 頭上要有兩格空的才抬滿，只有一格空的抬一半（灶台上方有東西），被蓋住的不抬。
 * 只抬餘燼：岩漿是一整片面光源，光暈的擺法另有講究（見 lamp-glow），不動它
 */
const FIRE_PIT_BLOCK_SET = new Set<BlockId>([BlockId.EMBER])
const FIRE_PIT_LIFT = 1.2

/** 某一格餘燼的光往上抬多少：頭上兩格空抬滿、一格空抬一半 */
function measureFirePitLift(worldState: Uint8Array, x: number, y: number, z: number): number {
  const isOpenAt = (level: number) => y + level < WORLD_HEIGHT
    && isPassableBlock(worldState[(x * WORLD_HEIGHT + y + level) * WORLD_SIZE + z]! as BlockId)
  if (!isOpenAt(1))
    return 0
  return isOpenAt(2) ? FIRE_PIT_LIFT : FIRE_PIT_LIFT / 2
}

/** 燈籠、紙燈這類的光色：暖，但不到火的程度 */
const LAMP_COLOR: [number, number, number] = [1, 0.86, 0.62]
const FIRE_COLOR: [number, number, number] = [1, 0.66, 0.34]

/**
 * 這種方塊發的是什麼顏色的光
 *
 * 真光與光暈用的是同一份色表——燈籠在地上灑的那圈暖色，
 * 與它自己外圍那圈暈本來就該是同一種暖。兩邊各寫一份，
 * 調過其中一邊就會對不起來
 */
export function getBlockLightTint(blockId: BlockId): [number, number, number] {
  return FIRE_BLOCK_SET.has(blockId) ? FIRE_COLOR : LAMP_COLOR
}

/**
 * 掃出世界裡所有夠亮的光源方塊
 *
 * 地形生成完只跑這一次。三百萬格的線性掃描在主執行緒上是幾毫秒的事，
 * 換來的是一份「哪裡有燈」的清單，之後每一幀都靠它決定真光要擺在哪
 */
export function collectLightSourceList(worldState: Uint8Array): BlockLightSource[] {
  /**
   * 每個小方格只留最亮的一顆
   *
   * 岩漿是一整池、餘燼也常常連著好幾格，逐格點燈的話光是一個湯屋
   * 就吃掉幾十盞。它們彼此只差一兩格，照出來的範圍幾乎完全重疊，
   * 留一顆與留十顆看起來沒有差別，成本卻差十倍。
   *
   * 燈籠本來就擺得比這個間距疏，不受影響
   */
  const cellMap = new Map<string, BlockLightSource>()

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const blockId = worldState[(x * WORLD_HEIGHT + y) * WORLD_SIZE + z]!
        if (blockId === 0)
          continue

        const blockDef = BLOCK_DEFS[blockId as BlockId]
        const level = blockDef.lightLevel ?? blockDef.emissive ?? 0
        /** 夠亮但標明不進清單的（熔岩湖那一種熔岩），見 BlockDef 的 isListedLightSource */
        if (level < MIN_LIGHT_LEVEL || blockDef.isListedLightSource === false)
          continue

        const isAreaLight = AREA_LIGHT_SET.has(blockId as BlockId)
        const shift = isAreaLight ? AREA_LIGHT_CELL_SHIFT : DEFAULT_CELL_SHIFT

        /**
         * 格距也寫進鍵裡
         *
         * 兩種格距共用一張表，不分開的話，一顆四格見方的岩漿格
         * 會與兩格見方的燈籠格撞在同一個鍵上，其中一盞就這樣沒了。
         * 湯屋的岩池底下正好埋著岩漿、岸邊又點著燈，那裡每次都會撞
         */
        const cellKey = `${shift}_${x >> shift}_${y >> shift}_${z >> shift}`
        const existing = cellMap.get(cellKey)
        if (existing && existing.level >= level)
          continue

        const isFire = FIRE_BLOCK_SET.has(blockId as BlockId)
        cellMap.set(cellKey, {
          x,
          y: FIRE_PIT_BLOCK_SET.has(blockId as BlockId) ? y + measureFirePitLift(worldState, x, y, z) : y,
          z,
          level,
          color: getBlockLightTint(blockId as BlockId),
          isFire,
          isAreaLight,
        })
      }
    }
  }

  return [...cellMap.values()]
}

/**
 * 一盞真光
 *
 * 燈火的真光（use-block-lights）吃的是這份清單，不是上面那份光源方塊的清單：
 * 燈籠與火一格一盞照舊，熔岩則是整片液面併成少數幾盞大的（見 collectPointLightList）
 */
export interface BlockPointLight {
  x: number;
  y: number;
  z: number;
  color: [number, number, number];
  /** 相對於一盞滿等燈籠的亮度倍率，已含亮度等級與面光源合併之後的增益 */
  intensityRatio: number;
  /** 照得到多遠（格） */
  range: number;
  /** 是不是燒著的東西，火光要更亮、還要會晃 */
  isFire: boolean;
  /** 是不是一片熔岩併出來的面光源，晃動要比一團火慢、淺 */
  isAreaLight: boolean;
}

export interface PointLightOptions {
  /**
   * 熔岩的面光源最多幾盞，預設 AREA_LIGHT_LIMIT
   *
   * 超過時不是丟掉遠的或小的，而是把最近的兩群併成一群（亮度與範圍跟著放大），
   * 所以再大的熔岩湖也不會有一段岸邊是暗的，只是光的落點變粗
   */
  areaLightLimit?: number;
}

/** 一盞滿等的燈照得到多遠（格），實際距離還要乘上亮度等級 */
export const POINT_LIGHT_RANGE = 20

/** 熔岩的面光源預設最多幾盞 */
export const AREA_LIGHT_LIMIT = 12

/**
 * 併熔岩時先分的磚（格）：水平十六格見方、垂直八格一層
 *
 * 一片大湖先照這個格距切開，每一塊一盞；瀑布則沿著高度每八格一盞。
 * 十六格配上二十幾格的照明半徑，湖面上任何一點大約落在四五盞的範圍裡。
 * 叢集光照的成本是「每個像素 × 罩到它的燈數」，原本四格一盞時同一點罩著幾十盞
 * （湯煙谷 54 盞，主畫面多 15.8 毫秒，見 docs/development-notes.md 的效能優化）
 */
const AREA_TILE_SHIFT = 4
const AREA_TILE_HEIGHT_SHIFT = 3

/** 小於這個格數的零碎小群，旁邊十六格內有別群就併過去 */
const AREA_FRAGMENT_CELL_COUNT = 8
const AREA_FRAGMENT_MERGE_DISTANCE = 16

/** 面光源的亮度：液面的亮度等級總和到這個數時等於一盞滿等的火，之後照平方根增加 */
const AREA_REFERENCE_WEIGHT = 10
const AREA_INTENSITY_MIN = 0.7
const AREA_INTENSITY_MAX = 2.2

/** 面光源照得到多遠：基本值加上液面的半徑 */
const AREA_RANGE_BASE = 18
const AREA_RANGE_PER_EXTENT = 1.3
const AREA_RANGE_MIN = 20
const AREA_RANGE_MAX = 36

/**
 * 面光源抬到液面上方多高
 *
 * 貼著液面的點光只照得亮正上方與貼岸的那一圈側面，岸上的地面全在光的背面。
 * 抬高之後光是斜著灑下來的，岸、岩壁與橋底都吃得到；液面越大抬得越高，
 * 一盞才罩得住整片。頭上有岩頂就停在岩頂下面
 */
const AREA_LIFT_BASE = 1.5
const AREA_LIFT_PER_EXTENT = 0.4
const AREA_LIFT_MAX = 6

interface AreaCluster {
  /** 以亮度等級加權的座標總和，除以 weight 就是重心 */
  sumX: number;
  sumY: number;
  sumZ: number;
  /** 亮度等級總和 */
  weight: number;
  /** 露在外面的熔岩格（世界索引） */
  cellList: number[];
}

function measureClusterCenter(cluster: AreaCluster): [number, number, number] {
  return [cluster.sumX / cluster.weight, cluster.sumY / cluster.weight, cluster.sumZ / cluster.weight]
}

function mergeCluster(target: AreaCluster, source: AreaCluster): void {
  target.sumX += source.sumX
  target.sumY += source.sumY
  target.sumZ += source.sumZ
  target.weight += source.weight
  for (const cell of source.cellList) {
    target.cellList.push(cell)
  }
}

/**
 * 掃出露在外面的熔岩格，照磚分群
 *
 * 「露在外面」是頭上或四周有一格是空的：湖面、河面是頂面露出，瀑布是側面露出。
 * 埋在液面底下的那幾層不算，它們照不到任何東西
 */
function collectAreaClusterList(worldState: Uint8Array): AreaCluster[] {
  const clusterMap = new Map<number, AreaCluster>()
  const tileSpan = (WORLD_SIZE >> AREA_TILE_SHIFT) + 1

  const readLevel = (blockId: number): number => {
    if (!isLavaBlock(blockId as BlockId))
      return 0
    const blockDef = BLOCK_DEFS[blockId as BlockId]
    return blockDef.lightLevel ?? blockDef.emissive ?? 0
  }
  const isOpenAt = (x: number, y: number, z: number): boolean => {
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y >= WORLD_HEIGHT)
      return false
    const blockId = worldState[(x * WORLD_HEIGHT + y) * WORLD_SIZE + z]! as BlockId
    return !isLavaBlock(blockId) && isPassableBlock(blockId)
  }

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const index = (x * WORLD_HEIGHT + y) * WORLD_SIZE + z
        const blockId = worldState[index]!
        if (blockId === 0)
          continue
        const level = readLevel(blockId)
        if (level <= 0)
          continue

        const isExposed = isOpenAt(x, y + 1, z)
          || isOpenAt(x + 1, y, z)
          || isOpenAt(x - 1, y, z)
          || isOpenAt(x, y, z + 1)
          || isOpenAt(x, y, z - 1)
        if (!isExposed)
          continue

        const tileKey = ((x >> AREA_TILE_SHIFT) * tileSpan + (z >> AREA_TILE_SHIFT)) * WORLD_HEIGHT
          + (y >> AREA_TILE_HEIGHT_SHIFT)
        let cluster = clusterMap.get(tileKey)
        if (!cluster) {
          cluster = { sumX: 0, sumY: 0, sumZ: 0, weight: 0, cellList: [] }
          clusterMap.set(tileKey, cluster)
        }
        cluster.sumX += x * level
        cluster.sumY += y * level
        cluster.sumZ += z * level
        cluster.weight += level
        cluster.cellList.push(index)
      }
    }
  }

  return [...clusterMap.values()]
}

/** 兩群重心的距離平方 */
function measureClusterDistanceSquared(first: AreaCluster, second: AreaCluster): number {
  const [firstX, firstY, firstZ] = measureClusterCenter(first)
  const [secondX, secondY, secondZ] = measureClusterCenter(second)
  return (firstX - secondX) ** 2 + (firstY - secondY) ** 2 + (firstZ - secondZ) ** 2
}

/**
 * 把磚切出來的碎片收乾淨，再併到上限以內
 *
 * 一、磚的邊界會把一池切成一大塊加幾格碎片，碎片併回旁邊那一群。
 * 二、超過上限時，反覆把「併起來最不傷」的兩群併成一群：代價是距離平方乘上
 *     兩群權重的調和（Ward 法），所以先被併掉的是又小又近的，
 *     兩片各自很大的湖面要到最後才會被併在一起
 */
function reduceAreaClusterList(clusterList: AreaCluster[], limit: number): AreaCluster[] {
  const list = [...clusterList]

  for (;;) {
    let fragmentIndex = -1
    let targetIndex = -1
    let nearest = AREA_FRAGMENT_MERGE_DISTANCE ** 2
    for (const [index, cluster] of list.entries()) {
      if (cluster.cellList.length >= AREA_FRAGMENT_CELL_COUNT)
        continue
      for (const [otherIndex, other] of list.entries()) {
        if (otherIndex === index)
          continue
        const distanceSquared = measureClusterDistanceSquared(cluster, other)
        if (distanceSquared < nearest) {
          nearest = distanceSquared
          fragmentIndex = index
          targetIndex = otherIndex
        }
      }
    }
    if (fragmentIndex === -1)
      break

    mergeCluster(list[targetIndex]!, list[fragmentIndex]!)
    list.splice(fragmentIndex, 1)
  }

  while (list.length > Math.max(1, limit)) {
    let firstIndex = 0
    let secondIndex = 1
    let lowestCost = Number.POSITIVE_INFINITY
    for (let first = 0; first < list.length; first++) {
      for (let second = first + 1; second < list.length; second++) {
        const firstCluster = list[first]!
        const secondCluster = list[second]!
        const cost = measureClusterDistanceSquared(firstCluster, secondCluster)
          * (firstCluster.weight * secondCluster.weight) / (firstCluster.weight + secondCluster.weight)
        if (cost < lowestCost) {
          lowestCost = cost
          firstIndex = first
          secondIndex = second
        }
      }
    }

    mergeCluster(list[firstIndex]!, list[secondIndex]!)
    list.splice(secondIndex, 1)
  }

  return list
}

/** 一群熔岩換成一盞面光源 */
function createAreaLight(worldState: Uint8Array, cluster: AreaCluster): BlockPointLight {
  const [centerX, centerY, centerZ] = measureClusterCenter(cluster)

  /**
   * 光要落在這一群自己的某一格上，不能直接擺在重心
   *
   * 彎的河、環形的池，重心會落在中間那塊岩石裡面：光源埋在實心裡，
   * 朝外的岩面全在它的背面，一點都照不到。取離重心最近的那一格再往上抬
   */
  let anchorX = 0
  let anchorY = 0
  let anchorZ = 0
  let nearest = Number.POSITIVE_INFINITY
  let spreadSum = 0
  for (const cell of cluster.cellList) {
    const z = cell % WORLD_SIZE
    const column = (cell - z) / WORLD_SIZE
    const y = column % WORLD_HEIGHT
    const x = (column - y) / WORLD_HEIGHT

    const horizontalSquared = (x - centerX) ** 2 + (z - centerZ) ** 2
    spreadSum += horizontalSquared
    const distanceSquared = horizontalSquared + (y - centerY) ** 2
    if (distanceSquared < nearest) {
      nearest = distanceSquared
      anchorX = x
      anchorY = y
      anchorZ = z
    }
  }

  /** 這一群攤開來多寬：一片圓形液面算出來就是它的半徑 */
  const extent = Math.sqrt(2 * spreadSum / cluster.cellList.length) + 0.5

  const liftGoal = Math.min(AREA_LIFT_MAX, AREA_LIFT_BASE + extent * AREA_LIFT_PER_EXTENT)
  let openCount = 0
  while (openCount < Math.ceil(liftGoal)) {
    const y = anchorY + openCount + 1
    if (y >= WORLD_HEIGHT)
      break
    const blockId = worldState[(anchorX * WORLD_HEIGHT + y) * WORLD_SIZE + anchorZ]! as BlockId
    if (isLavaBlock(blockId) || !isPassableBlock(blockId))
      break
    openCount++
  }
  /** 留半格別貼著岩頂；頭上完全被蓋住的（瀑布背後）就留在那一格的中心 */
  const lift = openCount === 0 ? 0 : 0.5 + Math.min(liftGoal, openCount - 0.5)

  const intensityRatio = Math.min(
    AREA_INTENSITY_MAX,
    Math.max(AREA_INTENSITY_MIN, Math.sqrt(cluster.weight / AREA_REFERENCE_WEIGHT)),
  )
  const range = Math.min(
    AREA_RANGE_MAX,
    Math.max(AREA_RANGE_MIN, AREA_RANGE_BASE + extent * AREA_RANGE_PER_EXTENT),
  )

  return {
    x: anchorX,
    y: anchorY + lift,
    z: anchorZ,
    color: FIRE_COLOR,
    intensityRatio,
    range,
    isFire: true,
    isAreaLight: true,
  }
}

/**
 * 世界裡要點的真光
 *
 * 燈籠、紙燈、營火、火爐：光源清單裡的每一顆各點一盞，與以前相同。
 *
 * 熔岩（isLavaBlock 認得的每一種，含不進光源清單的 LAVA_FIELD）不照光源清單一格一盞：把所有露在外面的熔岩格
 * 依位置分群，每一群只點一盞，位置在那一群的重心上方，亮度與照明半徑跟著那一群的大小放大，
 * 總數不超過 areaLightLimit。場景的地形不必為了省燈而少放熔岩，
 * 一整座熔岩湖、幾道熔岩瀑布加起來也只有十來盞。
 *
 * 光源清單（collectLightSourceList）照舊是四格一顆，光暈、全局光的種子、環境粒子還是用它：
 * 那幾樣要的是「液面上到處都有」，而且不是逐像素算的
 */
export function collectPointLightList(
  worldState: Uint8Array,
  sourceList: readonly BlockLightSource[],
  options: PointLightOptions = {},
): BlockPointLight[] {
  const pointLightList: BlockPointLight[] = []

  for (const source of sourceList) {
    if (source.isAreaLight)
      continue

    pointLightList.push({
      x: source.x,
      y: source.y,
      z: source.z,
      color: source.color,
      intensityRatio: source.level,
      range: POINT_LIGHT_RANGE * source.level,
      isFire: source.isFire,
      isAreaLight: false,
    })
  }

  const clusterList = reduceAreaClusterList(
    collectAreaClusterList(worldState),
    options.areaLightLimit ?? AREA_LIGHT_LIMIT,
  )
  for (const cluster of clusterList) {
    pointLightList.push(createAreaLight(worldState, cluster))
  }

  return pointLightList
}
