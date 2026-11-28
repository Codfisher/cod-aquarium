import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  fillNoisyDisc,
  placeAspenTree,
  placeStoneLantern,
  placeTorii,
  plantWithStack,
  rakeRipple,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { decorateAutumnDetail } from './autumn-detail'
import {
  AUTUMN_CENTER,
  AUTUMN_PORTAL_POINT,
  GROVE_GROUND_Y,
  GROVE_RADIUS,
  GROVE_RIM_WIDTH,
  LOWLAND_Y,
  measureGroveDistance,
  SAND_CLEARING_LIST,
  SLOPE_RUN,
} from './autumn-layout'
import { AUTUMN_REALM } from './autumn-realm'

/**
 * 金葉林的地形
 *
 * 只有地形 worker 用。整片照金葉苑（buildAutumnGarden）放大：
 * 金葉苑是一方高一格的草地木座，白楊種成疏林、金黃與琥珀兩種葉色交錯，
 * 地面幾乎鋪滿落葉，夾著乾草、枯灌與幾叢高草；林間一小片耙好的白沙，
 * 沙旁一張朝西的長凳與一盞紙燈，角落一盞石燈籠，入口一座鳥居。
 * 這裡一樣一樣照搬，只是林地大了，耙沙與長凳擺兩組、石燈籠擺幾盞，
 * 鳥居立在林地西緣，與東緣的回程門隔著整座林子遙遙相對。
 *
 * 金葉苑的聲音是從一地乾葉上來的，不是從樹梢，所以林地上的樹照樣疏；
 * 邊界那一圈才密，而且是落了葉的白楊：只剩白色的樹幹與枝頭幾片葉子，
 * 地上的葉子就是從它們身上掉下來的。
 *
 * 順序有講究：先有地形，耙沙、長凳與鳥居才擺得上去；樹排在造景之後，避開它們；
 * 落葉最後撒，傳送門排在落葉之後，門洞與木牌前面那幾格要清乾淨
 */

/** 林地上的草地與唇的分界：比這個近是林地，再往外 GROVE_RIM_WIDTH 格是矮一格的唇 */
const GROUND_RADIUS = GROVE_RADIUS - GROVE_RIM_WIDTH

/** 地面可能是哪幾種方塊：找地面時跳過樹幹、樹冠與花草 */
const GROUND_SET = new Set([BlockId.GRASS, BlockId.DIRT, BlockId.LAKE_BED, BlockId.GARDEN_SAND, BlockId.RAKED_SAND])

/** 草地上偶爾隆起一格的小丘，整座林地不至於是一塊平板 */
const MOUND_THRESHOLD = 0.26

/**
 * 緩坡與低林上的樹種到多遠
 *
 * 推回線外再幾格就不種了：再遠的樹沒有人走得到，霧裡也只剩一片影子，
 * 那一片影子由布景的山稜接手
 */
const BELT_OUTER_DISTANCE = GROVE_RADIUS + 20

/** 林地上的白楊彼此至少隔幾格：金葉苑是疏林，放大了也要疏 */
const GROVE_TREE_SPACING = 5.5
/**
 * 林地上種幾棵
 *
 * 金葉苑大約每三十八格見方一棵；這裡九十棵、每六十格見方一棵，比箱庭疏一點，
 * 留得出耙沙與長凳四周的空地，但不至於空曠（第一版三十六棵，每一百五十格一棵，看起來是一片草坪）
 */
const GROVE_TREE_COUNT = 90

/**
 * 邊界那一圈的白楊彼此至少隔幾格
 *
 * 三格多，人鑽得過兩根樹幹之間，但一眼望過去是一整排白色的樹幹，
 * 看得出「林子到這裡密起來了」
 */
const BELT_TREE_SPACING = 3.2
const BELT_TREE_COUNT = 260

/**
 * 落了葉的白楊還留幾成葉子
 *
 * 留太多就與林地上的樹分不出來，邊界成了一堵葉子牆（葉子方塊整顆都要畫，也最貴）；
 * 一片都不留又像一排電線桿。半成到兩成：枝頭零星幾簇金黃。
 * 林地上的白楊從三十六棵加到九十棵之後，高畫質在出生點掉了一成多，
 * 這一圈從一到三成收到這裡，把多出來的葉子讓回去
 */
const BARE_LEAF_KEEP_RANGE: [number, number] = [0.05, 0.2]

const LEAF_LIST = [BlockId.GOLD_LEAVES, BlockId.AMBER_LEAVES] as const

/** 某一點離林地中心的水平距離（不吃噪音），擺樹、避造景用 */
function measureCenterDistance(x: number, z: number): number {
  return Math.hypot(x - AUTUMN_CENTER.x, z - AUTUMN_CENTER.z)
}

/**
 * 這一格柱的地面高度
 *
 * 不用 findTopSolidY：坡上的白楊樹冠低，會壓在隔壁格柱的「地面」上，
 * 從上往下找第一個實心方塊會找到葉子。這裡只認地面那幾種方塊
 */
function findGroundY(state: Uint8Array, x: number, z: number): number {
  for (let y = GROVE_GROUND_Y + 1; y > 0; y--) {
    if (GROUND_SET.has(getBlock(state, x, y, z)))
      return y
  }
  return 0
}

/** 擺好的造景零件，樹要離它們遠一點；radius 是零件本身佔的範圍 */
interface ReservedSpot {
  x: number;
  z: number;
  radius: number;
}

/**
 * 回程門西側那一條「第一眼」的視線
 *
 * 落地時面朝西：門在背後，前面要看得到林地與那一大片耙沙，
 * 不能一睜眼就是一根樹幹貼在臉上
 */
function isInArrivalView(x: number, z: number): boolean {
  const ahead = AUTUMN_PORTAL_POINT.x - x
  return ahead > -2 && ahead < 16 && Math.abs(z - AUTUMN_PORTAL_POINT.z) < 3 + ahead * 0.2
}

/**
 * 門外那一段坡：回程門的東側、鳥居的西側
 *
 * 從林地望過門洞，看到的是坡下的低林；樹若正好長在門外，
 * 門洞裡就是一根樹幹。step 是往門外的方向（東 1、西 −1）
 */
function isInOutlook(x: number, z: number, point: { x: number; z: number }, step: 1 | -1): boolean {
  const outward = (x - point.x) * step
  return outward > -1 && outward < 10 && Math.abs(z - point.z) < 3
}

/**
 * 林地上這一格要不要隆起一格
 *
 * 門前、耙沙與鳥居附近都不隆：門柱與鳥居的柱子要落在同一個高度，
 * 耙沙是一片平整的白，隆起來就不像耙過的沙
 */
function isMound(x: number, z: number, reservedList: readonly ReservedSpot[]): boolean {
  if (measureGroveDistance(x, z) > GROUND_RADIUS - 3)
    return false
  if (Math.hypot(x - AUTUMN_PORTAL_POINT.x, z - AUTUMN_PORTAL_POINT.z) < 8)
    return false
  if (reservedList.some((spot) => Math.hypot(x - spot.x, z - spot.z) < spot.radius + 2))
    return false
  return fbm2D(x * 0.08 - 23, z * 0.08 + 9, 2, 0.5) > MOUND_THRESHOLD
}

/**
 * 某一格柱的地面高度與質地
 *
 * 林地是草；唇矮一格；再往外每兩格半降一格，降到低林的高度為止。
 * 低林那一層是不畫的 LAKE_BED：一整圈走不到的地面若照方塊畫，
 * 連同兩層陰影與深度圖要多畫幾十萬個三角形，改由布景的地面平面代替
 */
function measureColumn(x: number, z: number, reservedList: readonly ReservedSpot[]): { topY: number; isLowland: boolean } {
  const distance = measureGroveDistance(x, z)
  if (distance < GROUND_RADIUS)
    return { topY: GROVE_GROUND_Y + (isMound(x, z, reservedList) ? 1 : 0), isLowland: false }
  if (distance < GROVE_RADIUS)
    return { topY: GROVE_GROUND_Y - 1, isLowland: false }

  /** 坡面吃一點噪音，才不是一圈一圈的同心台階 */
  const bump = fbm2D(x * 0.09 + 3, z * 0.09 - 7, 2, 0.5) * 1.2
  const topY = Math.round(GROVE_GROUND_Y - 2 - (distance - GROVE_RADIUS) / SLOPE_RUN + bump)
  if (topY <= LOWLAND_Y)
    return { topY: LOWLAND_Y, isLowland: true }
  return { topY: Math.min(GROVE_GROUND_Y - 1, topY), isLowland: false }
}

/** 林地、唇、緩坡與低林 */
function shapeTerrain(state: Uint8Array, reservedList: readonly ReservedSpot[]): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      setBlock(state, x, 0, z, BlockId.BEDROCK)
      const { topY, isLowland } = measureColumn(x, z, reservedList)

      /** 低林整根都是 LAKE_BED：不畫，旁邊坡腳的石頭也就不會露出側面 */
      if (isLowland) {
        for (let y = 1; y <= topY; y++) {
          setBlock(state, x, y, z, BlockId.LAKE_BED)
        }
        continue
      }

      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, BlockId.GRASS)
    }
  }
}

/** 林地中心加上偏移的格子 */
function atGrove(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: AUTUMN_CENTER.x + offsetX, z: AUTUMN_CENTER.z + offsetZ }
}

/**
 * 鳥居的位置：林地西緣草地的最外一排
 *
 * 金葉苑的鳥居立在木座西緣、正對著東邊的林子；這裡同樣立在西緣，
 * 與東緣的回程門隔著整座林地遙遙相對。五格寬的柱腳都要落在草地上，
 * 所以往西走到「五格都還是草地」的最後一排
 */
function findToriiPoint(): { x: number; z: number } {
  const { z } = AUTUMN_CENTER
  let { x } = AUTUMN_CENTER
  const isGroundRow = (rowX: number) => [-2, -1, 0, 1, 2].every((offset) => measureGroveDistance(rowX, z + offset) < GROUND_RADIUS - 1)
  while (x > 0 && isGroundRow(x - 1)) {
    x -= 1
  }
  return { x, z }
}

/**
 * 造景零件的位置
 *
 * 耙沙、長凳、紙燈、石燈籠與鳥居。先算出來，地形的小丘與種樹都要避開它們
 */
function planReservedList(): { reservedList: ReservedSpot[]; toriiPoint: { x: number; z: number } } {
  const toriiPoint = findToriiPoint()
  const reservedList: ReservedSpot[] = SAND_CLEARING_LIST.map((clearing) => ({
    ...atGrove(clearing.offsetX, clearing.offsetZ),
    /** 連同沙旁的長凳與紙燈一起讓出來 */
    radius: clearing.radius + 3,
  }))
  reservedList.push({ ...toriiPoint, radius: 4 })
  reservedList.push({ ...atGrove(-8, 12), radius: 2 })
  return { reservedList, toriiPoint }
}

/**
 * 林間的耙沙、長凳與紙燈
 *
 * 與金葉苑同一個擺法：沙鋪在林地那一層（甲板那一層）並耙出一圈圈的紋，
 * 沙的西側一張三格長的朝西長凳，長凳南端再過去一格是一根深色木柱頂紙燈
 */
function placeSandClearingList(state: Uint8Array): void {
  for (const clearing of SAND_CLEARING_LIST) {
    const { x, z } = atGrove(clearing.offsetX, clearing.offsetZ)
    fillNoisyDisc(state, x, z, clearing.radius, GROVE_GROUND_Y, BlockId.GARDEN_SAND, 1.2)
    rakeRipple(state, x, z, GROVE_GROUND_Y, clearing.rippleFrom, clearing.rippleTo)

    const benchX = x - Math.round(clearing.radius + 1)
    for (let offset = -1; offset <= 1; offset++) {
      setBlock(state, benchX, GROVE_GROUND_Y + 1, z + offset, BlockId.WOOD_STAIRS_WEST)
    }
    setBlock(state, benchX, GROVE_GROUND_Y + 1, z + 3, BlockId.DARK_PLANKS)
    setBlock(state, benchX, GROVE_GROUND_Y + 2, z + 3, BlockId.PAPER_LAMP)
  }
}

/**
 * 鳥居與石燈籠
 *
 * 金葉苑的石燈籠在木座西南角，這裡照那個相對位置擺一盞；
 * 鳥居內側與回程門旁各再一盞，夜裡從林地兩頭都找得到門在哪
 */
function placeGatePieceList(state: Uint8Array, toriiPoint: { x: number; z: number }): void {
  placeTorii(state, toriiPoint.x, GROVE_GROUND_Y + 1, toriiPoint.z, false)

  const lanternList = [
    atGrove(-8, 12),
    { x: toriiPoint.x + 3, z: toriiPoint.z + 4 },
    /** 回程門南側四格、同一排草地上 */
    { x: AUTUMN_PORTAL_POINT.x, z: AUTUMN_PORTAL_POINT.z + 4 },
  ]
  for (const lantern of lanternList) {
    const groundY = findGroundY(state, lantern.x, lantern.z) + 1
    placeStoneLantern(state, lantern.x, groundY, lantern.z)
  }
}

/**
 * 一棵落了葉的白楊
 *
 * 照金葉苑的白楊種（placeAspenTree），再把它剛長出來的葉子拔掉大半。
 * 只拔這一棵新放的：先記下樹冠範圍裡原本是空氣的格子，
 * 隔壁那棵已經長好的樹冠不會被順手拔禿
 */
function placeBareAspen(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  trunkHeight: number,
  leafBlock: BlockId,
  keepRatio: number,
  random: () => number,
): void {
  const crownY = groundY + trunkHeight
  const emptyList: { x: number; y: number; z: number }[] = []
  for (let offsetY = -3; offsetY <= 1; offsetY++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
        if (getBlock(state, x + offsetX, crownY + offsetY, z + offsetZ) === BlockId.AIR) {
          emptyList.push({ x: x + offsetX, y: crownY + offsetY, z: z + offsetZ })
        }
      }
    }
  }

  placeAspenTree(state, x, groundY, z, trunkHeight, leafBlock)

  for (const cell of emptyList) {
    if (getBlock(state, cell.x, cell.y, cell.z) === leafBlock && random() > keepRatio) {
      setBlock(state, cell.x, cell.y, cell.z, BlockId.AIR)
    }
  }
}

/**
 * 依最小間距撒點（拒絕取樣）
 *
 * 在 accept 認可的範圍裡亂數挑點，離已經挑到的點太近就丟掉，
 * 挑到 count 個或試完 attemptCount 次為止。種樹用：均勻撒開的樹看起來像果園，
 * 完全亂撒又會兩棵擠在一起
 */
function scatterSpaced(
  random: () => number,
  count: number,
  attemptCount: number,
  spacing: number,
  reach: number,
  accept: (x: number, z: number) => boolean,
  occupiedList: { x: number; z: number }[],
): { x: number; z: number }[] {
  const pickedList: { x: number; z: number }[] = []
  for (let attempt = 0; attempt < attemptCount && pickedList.length < count; attempt++) {
    const x = AUTUMN_CENTER.x + Math.round((random() * 2 - 1) * reach)
    const z = AUTUMN_CENTER.z + Math.round((random() * 2 - 1) * reach)
    if (!accept(x, z))
      continue
    if (occupiedList.some((point) => Math.hypot(point.x - x, point.z - z) < spacing))
      continue
    pickedList.push({ x, z })
    occupiedList.push({ x, z })
  }
  return pickedList
}

/**
 * 白楊
 *
 * 林地上照金葉苑種成疏林，葉色金黃與琥珀各半；
 * 唇、緩坡與坡腳那一圈種得密，而且是落了葉的，只剩幾簇葉子掛在枝頭
 */
function plantTreeList(state: Uint8Array, reservedList: readonly ReservedSpot[], toriiPoint: { x: number; z: number }): void {
  const random = createSeededRandom('autumn-tree')
  const occupiedList: { x: number; z: number }[] = []
  const isReserved = (x: number, z: number, margin: number) =>
    reservedList.some((spot) => Math.hypot(x - spot.x, z - spot.z) < spot.radius + margin)
  const isNearGate = (x: number, z: number) =>
    Math.hypot(x - AUTUMN_PORTAL_POINT.x, z - AUTUMN_PORTAL_POINT.z) < 6

  const groveTreeList = scatterSpaced(random, GROVE_TREE_COUNT, 3000, GROVE_TREE_SPACING, GROUND_RADIUS, (x, z) =>
    measureGroveDistance(x, z) < GROUND_RADIUS - 3
    && !isReserved(x, z, 2)
    && !isNearGate(x, z)
    && !isInArrivalView(x, z), occupiedList)

  for (const point of groveTreeList) {
    const groundY = findGroundY(state, point.x, point.z) + 1
    placeAspenTree(state, point.x, groundY, point.z, 6 + Math.floor(random() * 4), LEAF_LIST[random() < 0.5 ? 0 : 1])
  }

  const beltTreeList = scatterSpaced(random, BELT_TREE_COUNT, 9000, BELT_TREE_SPACING, BELT_OUTER_DISTANCE, (x, z) => {
    const distance = measureGroveDistance(x, z)
    return distance >= GROUND_RADIUS - 1
      && measureCenterDistance(x, z) < BELT_OUTER_DISTANCE
      && !isReserved(x, z, 1)
      && !isNearGate(x, z)
      && !isInOutlook(x, z, AUTUMN_PORTAL_POINT, 1)
      && !isInOutlook(x, z, toriiPoint, -1)
  }, occupiedList)

  const [keepMin, keepMax] = BARE_LEAF_KEEP_RANGE
  for (const point of beltTreeList) {
    const groundY = findGroundY(state, point.x, point.z) + 1
    placeBareAspen(
      state,
      point.x,
      groundY,
      point.z,
      6 + Math.floor(random() * 4),
      LEAF_LIST[random() < 0.5 ? 0 : 1],
      keepMin + random() * (keepMax - keepMin),
      random,
    )
  }
}

/**
 * 一地乾葉
 *
 * 金葉苑撒的是一半的格子、其中六成是落葉；這裡要的是「整片地都鋪滿了」，
 * 所以每一格草地都撒，八成是落葉，其餘是乾草、枯灌與零星高草。
 * 坡腳外的低林地面是布景的平面，只在看得清楚的近處那一圈撒落葉
 */
function scatterGroundCover(state: Uint8Array): void {
  const random = createSeededRandom('autumn-ground')
  const reach = Math.ceil(BELT_OUTER_DISTANCE)

  for (let x = AUTUMN_CENTER.x - reach; x <= AUTUMN_CENTER.x + reach; x++) {
    for (let z = AUTUMN_CENTER.z - reach; z <= AUTUMN_CENTER.z + reach; z++) {
      if (measureCenterDistance(x, z) > reach)
        continue
      const topY = findGroundY(state, x, z)
      const topBlock = getBlock(state, x, topY, z)
      if (getBlock(state, x, topY + 1, z) !== BlockId.AIR)
        continue

      const roll = random()
      if (topBlock === BlockId.LAKE_BED) {
        if (roll < 0.55) {
          setBlock(state, x, topY + 1, z, BlockId.FALLEN_LEAVES)
        }
        continue
      }
      if (topBlock !== BlockId.GRASS)
        continue

      if (roll < 0.8)
        setBlock(state, x, topY + 1, z, BlockId.FALLEN_LEAVES)
      else if (roll < 0.87)
        plantWithStack(state, x, topY + 1, z, BlockId.DRY_GRASS, random)
      else if (roll < 0.92)
        plantWithStack(state, x, topY + 1, z, BlockId.DRY_SHRUB, random)
      else if (roll < 0.95)
        plantWithStack(state, x, topY + 1, z, BlockId.TALL_GRASS, random)
    }
  }
}

/** 生成整座金葉林 */
export function generateAutumnWorld(state: Uint8Array): void {
  const { reservedList, toriiPoint } = planReservedList()
  shapeTerrain(state, reservedList)
  placeSandClearingList(state)
  placeGatePieceList(state, toriiPoint)
  plantTreeList(state, reservedList, toriiPoint)
  scatterGroundCover(state)
  /** 細節排在落葉之後：林地幾乎鋪滿，細節是換掉其中幾片（見 autumn-detail） */
  decorateAutumnDetail(state)

  /** 門框排在落葉之後：門洞前後與木牌四周的花草由它清掉 */
  for (const portal of AUTUMN_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
