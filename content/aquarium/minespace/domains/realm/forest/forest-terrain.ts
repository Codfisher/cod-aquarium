import type { ForestClearing } from './forest-layout'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  fillBox,
  placeOakTree,
  placePineTree,
  placeStoneLantern,
  placeTorii,
  plantWithStack,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import {
  ARRIVAL_CLEARING,
  FOREST_CENTER,
  FOREST_EDGE_RADIUS,
  FOREST_GROUND_Y,
  FOREST_PATH_POINT_LIST,
  FOREST_PORTAL_POINT,
  SHRINE_CLEARING,
  THICKET_START_RADIUS,
} from './forest-layout'
import { FOREST_REALM } from './forest-realm'

/**
 * 林海的地形
 *
 * 只有地形 worker 用。整片林子照松籟林（buildForestGarden）放大：
 * 草地、一條兩格寬的石板小徑彎彎地穿過去、針葉樹為主混幾棵橡樹、倒木、
 * 落葉蕨草高草灌叢與兩種菇、石燈籠與鳥居。那一座把樹種密，讓人看不到對岸的木框；
 * 這裡把木座拿掉，林子往四面長，最外面一圈密成一堵牆。
 *
 * 樹葉的方塊很貴（每一格都整顆畫、還要進兩層陰影與深度圖），
 * 所以樹只種到 FOREST_EDGE_RADIUS，外面的地面換成不畫的 LAKE_BED，由布景的地面平面代替。
 *
 * 順序有講究：先有地面與小徑，樹才知道哪裡不能種；花草最後撒，
 * 傳送門排在花草之後，門洞與木牌前面那幾格要清乾淨
 */

/** 種樹的格子：每兩格見方抽一次籤，樹幹落在格子裡的隨機一點 */
const TREE_CELL_SIZE = 2

/**
 * 密林那一圈每一格種樹的機率
 *
 * 枝葉相接就夠了：再密，樹葉的方塊數一路往上漲，畫面上卻還是同一面綠牆
 */
const THICKET_TREE_CHANCE = 0.62

/**
 * 密林那一圈的松：八到十格高的細長樹幹，頂上一小撮枝葉
 *
 * 從林子裡往外看，平視的那一層是一排一排越來越密的樹幹、灌叢與隆起的地面，
 * 樹冠全在頭頂上；那一圈的樹冠只要從下面看得出是松就夠了。
 * 整棵松（二十九到四十九格葉）種滿那一圈，葉子是林子裡的兩倍，
 * 平視時一層疊一層的鏤空樹葉又最吃 GPU，所以換成這種細高的
 */
const THICKET_TRUNK_HEIGHT_MIN = 8

/**
 * 密林的細高松
 *
 * 頂上三層：最上面一格，往下兩層各是十字形的四格，最下一層再加四個斜角，
 * 遠看是一支收尖的松梢，一棵十三格葉
 */
function placeThicketPine(state: Uint8Array, x: number, groundY: number, z: number, trunkHeight: number): void {
  for (let level = 0; level < trunkHeight; level++) {
    setBlock(state, x, groundY + level, z, BlockId.PINE_LOG)
  }
  const topY = groundY + trunkHeight
  setDecoration(state, x, topY, z, BlockId.PINE_LEAVES)
  for (let layer = 1; layer <= 2; layer++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const isCross = Math.abs(offsetX) + Math.abs(offsetZ) === 1
        const isCorner = Math.abs(offsetX) + Math.abs(offsetZ) === 2
        if (isCross || (isCorner && layer === 2)) {
          setDecoration(state, x + offsetX, topY - layer, z + offsetZ, BlockId.PINE_LEAVES)
        }
      }
    }
  }
}

/** 小徑兩側幾格內不長樹幹，樹冠可以從兩邊蓋過來 */
const PATH_TRUNK_CLEARANCE = 2.6

/** 某一點離圓心的距離 */
function measureDistance(x: number, z: number, point: { x: number; z: number }): number {
  return Math.hypot(x - point.x, z - point.z)
}

/**
 * 每一格離小徑中心線多遠
 *
 * 種樹、撒花草、隆起地面都要問，先整片算一次存起來。
 * 只算小徑附近那一圈，其餘當成很遠
 */
function createPathDistanceMap(): Float32Array {
  const distanceMap = new Float32Array(WORLD_SIZE * WORLD_SIZE).fill(Number.POSITIVE_INFINITY)
  const reach = 6
  for (const point of FOREST_PATH_POINT_LIST) {
    for (let x = Math.floor(point.x - reach); x <= Math.ceil(point.x + reach); x++) {
      for (let z = Math.floor(point.z - reach); z <= Math.ceil(point.z + reach); z++) {
        const index = x * WORLD_SIZE + z
        distanceMap[index] = Math.min(distanceMap[index]!, Math.hypot(x - point.x, z - point.z))
      }
    }
  }
  return distanceMap
}

/** 這一格離空地中心比半徑多出幾格，負的就是在空地裡 */
function measureClearingOvershoot(x: number, z: number, clearing: ForestClearing): number {
  return measureDistance(x, z, clearing) - clearing.radius
}

/** 兩片空地與門前都要平：不隆起、不種樹 */
function isOpenGround(x: number, z: number): boolean {
  return measureClearingOvershoot(x, z, ARRIVAL_CLEARING) < 1
    || measureClearingOvershoot(x, z, SHRINE_CLEARING) < 1
    || measureDistance(x, z, FOREST_PORTAL_POINT) < 4
}

/**
 * 地面隆起幾格
 *
 * 林子裡零星一格高的小丘，整片林地才有起伏；小徑、空地與門前不隆，人才走得順。
 * 密林那一圈往外一路抬高成丘，最多四格，從裡面看林地是往上收的，像走進了山腳的林子
 */
function measureGroundLevel(x: number, z: number, radius: number, pathDistance: number): number {
  if (pathDistance < 2.5 || isOpenGround(x, z))
    return 0

  const roll = fbm2D(x * 0.07 + 13, z * 0.07 - 29, 2, 0.5)
  if (radius < THICKET_START_RADIUS + 3)
    return roll > 0.3 ? 1 : 0

  const rise = Math.floor((radius - THICKET_START_RADIUS - 3) / 4)
  return Math.min(4, rise + (roll > 0.15 ? 1 : 0))
}

/** 地面與小徑，回傳每一格的地表高度 */
function shapeTerrain(state: Uint8Array, pathDistanceMap: Float32Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, FOREST_CENTER)

      /** 林子外面：碰撞照算、不畫，由布景的地面平面代替 */
      if (radius > FOREST_EDGE_RADIUS + 2) {
        for (let y = 1; y < FOREST_GROUND_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, FOREST_GROUND_Y, z, BlockId.LAKE_BED)
        groundTopMap[x * WORLD_SIZE + z] = FOREST_GROUND_Y
        continue
      }

      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      const topY = FOREST_GROUND_Y + measureGroundLevel(x, z, radius, pathDistance)
      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      /** 兩格寬的石板：中心線兩側各一格 */
      setBlock(state, x, topY, z, pathDistance <= 1.05 ? BlockId.STONE_TILE : BlockId.GRASS)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }

  return groundTopMap
}

/**
 * 這一格要不要種樹的機率
 *
 * 林子裡疏密由低頻噪音決定，有的地方密到枝葉相接、有的地方透光；
 * 空地邊緣往外三格漸漸密回來，看起來是林子自己讓出來的，而不是一個挖好的圓。
 * 密林那一圈幾乎每一格都種
 */
function measureTreeChance(x: number, z: number, radius: number, pathDistance: number): number {
  if (radius > FOREST_EDGE_RADIUS || pathDistance < PATH_TRUNK_CLEARANCE)
    return 0
  if (measureDistance(x, z, FOREST_PORTAL_POINT) < 5)
    return 0

  const clearingOvershoot = Math.min(
    measureClearingOvershoot(x, z, ARRIVAL_CLEARING),
    measureClearingOvershoot(x, z, SHRINE_CLEARING),
  )
  if (clearingOvershoot < 0)
    return 0

  const density = fbm2D(x * 0.045 - 7, z * 0.045 + 19, 2, 0.5)
  const interior = Math.min(0.62, Math.max(0.12, 0.34 + density * 0.45))
  const thicket = Math.min(1, Math.max(0, (radius - THICKET_START_RADIUS) / 8))
  const chance = interior + (THICKET_TREE_CHANCE - interior) * thicket
  return chance * Math.min(1, clearingOvershoot / 3 + 0.25)
}

/**
 * 種樹
 *
 * 林子裡的松六到九格高，樹幹下半截光禿禿的，平視看到的是一根一根的樹幹；
 * 密林那一圈是細高的松（placeThicketPine），樹幹一排比一排密，看出去是一整面樹幹的牆。
 * 一成是橡樹，照松籟林「一整片針葉會太整齊」的意思混進去
 */
function placeTreeList(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('forest-tree')

  for (let cellX = 0; cellX < WORLD_SIZE; cellX += TREE_CELL_SIZE) {
    for (let cellZ = 0; cellZ < WORLD_SIZE; cellZ += TREE_CELL_SIZE) {
      const x = cellX + Math.floor(random() * TREE_CELL_SIZE)
      const z = cellZ + Math.floor(random() * TREE_CELL_SIZE)
      const roll = random()
      const heightRoll = random()
      const kindRoll = random()
      if (x >= WORLD_SIZE || z >= WORLD_SIZE)
        continue

      const radius = measureDistance(x, z, FOREST_CENTER)
      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      if (roll > measureTreeChance(x, z, radius, pathDistance))
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      /** 已經有東西（相鄰那棵的樹幹或枝葉）就讓開 */
      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      const isThicket = radius > THICKET_START_RADIUS
      if (!isThicket && kindRoll < 0.1) {
        placeOakTree(state, x, groundY, z, 4 + Math.floor(heightRoll * 3))
        continue
      }
      if (isThicket) {
        placeThicketPine(state, x, groundY, z, THICKET_TRUNK_HEIGHT_MIN + Math.floor(heightRoll * 3))
        continue
      }
      placePineTree(state, x, groundY, z, 6 + Math.floor(heightRoll * 4))
    }
  }
}

/**
 * 小徑盡頭的空地
 *
 * 松籟林的鳥居跨在小徑走進空地的那一口，兩盞石燈籠守著空地中央一棵老橡樹，
 * 四周一圈蕨與菇。走了一路的林子，到這裡頭頂開了一片天
 */
function buildShrineClearing(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { x, z, radius } = SHRINE_CLEARING
  const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1

  /** 鳥居跨在小徑走進空地的那一口：小徑從南邊（+Z）進來 */
  const gateZ = z + radius - 2
  placeTorii(state, x, groundY, gateZ, true)

  placeOakTree(state, x, groundY, z - 2, 6)
  for (const side of [-3, 3]) {
    placeStoneLantern(state, x + side, groundY, z + 1)
  }

  const random = createSeededRandom('forest-shrine')
  for (let offsetX = -radius; offsetX <= radius; offsetX++) {
    for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
      const distance = Math.hypot(offsetX, offsetZ)
      if (distance < radius - 2.5 || distance > radius + 1 || random() > 0.45)
        continue
      const plantX = x + offsetX
      const plantZ = z + offsetZ
      const plantY = groundTopMap[plantX * WORLD_SIZE + plantZ]! + 1
      if (getBlock(state, plantX, plantY - 1, plantZ) !== BlockId.GRASS)
        continue
      setDecoration(state, plantX, plantY, plantZ, random() < 0.7 ? BlockId.FERN : BlockId.BROWN_MUSHROOM)
    }
  }
}

/**
 * 小徑旁的石燈籠
 *
 * 松籟林兩盞，這裡沿著小徑每十幾格一盞、左右交錯，夜裡一路亮到小徑盡頭；
 * 回程門東側再一盞，與湖中島、海中沙島一樣，回頭找門就靠它
 */
function placeLanternList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const pointList: { x: number; z: number }[] = [
    { x: FOREST_PORTAL_POINT.x + 4, z: FOREST_PORTAL_POINT.z - 1 },
  ]

  const spacing = 16
  for (let index = spacing; index < FOREST_PATH_POINT_LIST.length - spacing; index += spacing) {
    const point = FOREST_PATH_POINT_LIST[index]!
    const next = FOREST_PATH_POINT_LIST[index + 1]!
    const directionX = next.x - point.x
    const directionZ = next.z - point.z
    const length = Math.hypot(directionX, directionZ) || 1
    /** 小徑的法線，左右交錯 */
    const side = (index / spacing) % 2 === 0 ? 1 : -1
    pointList.push({
      x: Math.round(point.x - (directionZ / length) * 2.5 * side),
      z: Math.round(point.z + (directionX / length) * 2.5 * side),
    })
  }

  for (const point of pointList) {
    const groundY = groundTopMap[point.x * WORLD_SIZE + point.z]! + 1
    if (getBlock(state, point.x, groundY - 1, point.z) !== BlockId.GRASS)
      continue
    if (getBlock(state, point.x, groundY, point.z) !== BlockId.AIR)
      continue
    placeStoneLantern(state, point.x, groundY, point.z)
  }
}

/**
 * 倒木
 *
 * 松籟林兩根，林子大了多躺幾根：長短不一，只躺在平的地方，
 * 碰到樹幹或小丘就不放，免得一截木頭插進坡裡
 */
function placeFallenLogList(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('forest-log')

  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 8 + random() * (THICKET_START_RADIUS + 10)
    const x = Math.round(FOREST_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(FOREST_CENTER.z + Math.sin(angle) * radius)
    const isAlongX = random() < 0.5
    const length = 3 + Math.floor(random() * 3)
    const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1

    const cellList = Array.from({ length }, (_, step) => ({
      x: x + (isAlongX ? step : 0),
      z: z + (isAlongX ? 0 : step),
    }))
    const isClear = cellList.every((cell) => (
      groundTopMap[cell.x * WORLD_SIZE + cell.z]! + 1 === groundY
      && pathDistanceMap[cell.x * WORLD_SIZE + cell.z]! > 2
      && !isOpenGround(cell.x, cell.z)
      && getBlock(state, cell.x, groundY, cell.z) === BlockId.AIR
    ))
    if (!isClear)
      continue

    for (const cell of cellList) {
      setBlock(state, cell.x, groundY, cell.z, isAlongX ? BlockId.DEAD_LOG_X : BlockId.DEAD_LOG_Z)
    }
  }
}

/**
 * 林下的花草
 *
 * 與松籟林同一組、同一個比例：落葉最多，蕨、高草次之，灌叢與兩種菇點綴。
 * 密林那一圈灌叢加倍，貼地那一層也擋住視線；空地與小徑邊稀一點，路才看得出來
 */
function scatterUndergrowth(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('forest-plant')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, FOREST_CENTER)
      if (radius > FOREST_EDGE_RADIUS)
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      const isThicket = radius > THICKET_START_RADIUS
      const chance = pathDistance < 2 || isOpenGround(x, z) ? 0.12 : isThicket ? 0.5 : 0.34
      if (random() > chance)
        continue

      const roll = random()
      const bushShare = isThicket ? 0.16 : 0.06
      let blockId: BlockId
      if (roll < 0.42 - bushShare / 2)
        blockId = BlockId.FOREST_LITTER
      else if (roll < 0.66 - bushShare / 2)
        blockId = BlockId.FERN
      else if (roll < 0.84 - bushShare / 2)
        blockId = BlockId.TALL_GRASS
      else if (roll < 0.84 + bushShare / 2)
        blockId = BlockId.BUSH
      else if (roll < 0.95)
        blockId = BlockId.MUSHROOM
      else
        blockId = BlockId.BROWN_MUSHROOM
      plantWithStack(state, x, groundY, z, blockId, random)
    }
  }
}

/** 樹冠的方塊（樹葉與樹幹），掏空樹冠時用來判斷一格是不是被包在裡面 */
const CROWN_BLOCK_SET = new Set([BlockId.PINE_LEAVES, BlockId.OAK_LEAVES, BlockId.PINE_LOG, BlockId.OAK_LOG])

/**
 * 掏空樹冠
 *
 * 樹葉是鏤空的方塊，每一格都整顆畫，不被相鄰的樹葉剔除，還要進兩層陰影與深度圖。
 * 上下前後左右六面都貼著樹葉或樹幹的那些格子，從外面幾乎看不到
 * （只有從鏤空的縫隙裡隱約一點），拿掉之後樹冠外觀不變，葉子少三成。
 * 先整片判斷完再一起拿，免得拿掉一格之後旁邊那格的判斷跟著變
 */
function hollowCrownList(state: Uint8Array): void {
  const enclosedList: { x: number; y: number; z: number }[] = []
  const isCrown = (x: number, y: number, z: number) => CROWN_BLOCK_SET.has(getBlock(state, x, y, z))

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      for (let y = FOREST_GROUND_Y + 2; y < FOREST_GROUND_Y + 20; y++) {
        const blockId = getBlock(state, x, y, z)
        if (blockId !== BlockId.PINE_LEAVES && blockId !== BlockId.OAK_LEAVES)
          continue
        if (
          isCrown(x + 1, y, z) && isCrown(x - 1, y, z)
          && isCrown(x, y + 1, z) && isCrown(x, y - 1, z)
          && isCrown(x, y, z + 1) && isCrown(x, y, z - 1)
        ) {
          enclosedList.push({ x, y, z })
        }
      }
    }
  }

  for (const { x, y, z } of enclosedList) {
    setBlock(state, x, y, z, BlockId.AIR)
  }
}

/** 生成整片林海 */
export function generateForestWorld(state: Uint8Array): void {
  const pathDistanceMap = createPathDistanceMap()
  const groundTopMap = shapeTerrain(state, pathDistanceMap)
  buildShrineClearing(state, groundTopMap)
  placeLanternList(state, groundTopMap)
  placeTreeList(state, groundTopMap, pathDistanceMap)
  hollowCrownList(state)
  placeFallenLogList(state, groundTopMap, pathDistanceMap)
  scatterUndergrowth(state, groundTopMap, pathDistanceMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of FOREST_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
