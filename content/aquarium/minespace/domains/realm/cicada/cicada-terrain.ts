import type { CicadaClearing } from './cicada-layout'
import { createSeededRandom, fbm2D, fbm3D } from '../../../utils/noise'
import { BlockId, isPassableBlock } from '../../block/block-constants'
import { fillBox, placeStoneLantern, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import {
  createPathDistanceMap,
  fillGroundColumn,
  fillHiddenColumn,
  hollowEnclosedLeafList,
  measureDistance,
  plantOnGround,
  samplePathCurve,
} from '../land-realm-kit'
import { placePortalStructure } from '../portal-terrain'
import {
  ARRIVAL_CLEARING,
  CICADA_CENTER,
  CICADA_EDGE_RADIUS,
  CICADA_GROUND_Y,
  CICADA_PATH_CONTROL_POINT_LIST,
  CICADA_PORTAL_POINT,
  SHADE_CLEARING,
  SUN_CLEARING_LIST,
  VERANDA_HALF_LENGTH,
  VERANDA_LIST,
  WOOD_RADIUS,
} from './cicada-layout'
import { CICADA_REALM } from './cicada-realm'

/**
 * 蟬雨深林的地形
 *
 * 只有地形 worker 用。蟬時雨（buildCicadaGarden）放大：擠在一起的橡樹、合成一片濃蔭的樹冠
 * （兩成不到的縫漏光）、土與苔的地面、蕨腐葉高草與石生植物、朝北的緣廊與石燈籠。
 *
 * 第一版照蟬時雨「最高處補一整片葉子」的做法，把那片葉子鋪成一整張平的蓋子、底下一根根光樹幹，
 * 使用者說不自然。現在改成一棵一棵的樹：樹冠是吃了噪音的扁圓團，大小高低不一、彼此擠在一起，
 * 頂面與底面都是起伏的；幾棵兩格粗的老樹高出林冠，林冠底下一層矮樹、幼樹與灌叢；
 * 枝幹從樹幹斜伸出去撐住樹冠，從林下抬頭看得到。光從冠與冠之間、與幾道貫穿樹冠的縫漏下來。
 *
 * 樹葉的方塊很貴（每一格都整顆畫、還要進兩層陰影與深度圖），樹冠裡面包住看不到的葉子最後全拿掉。
 * 順序：先地面與土徑，再緣廊與石燈籠，再種樹（高的先）、開光縫、拿掉包在裡面的葉子，
 * 花草最後撒，傳送門排在花草之後
 */

const FLOOR_SET = new Set([BlockId.GRASS, BlockId.DIRT])
const LEAF_SET = new Set([BlockId.OAK_LEAVES])
const CROWN_SET = new Set([BlockId.OAK_LEAVES, BlockId.OAK_LOG, BlockId.OAK_LOG_X, BlockId.OAK_LOG_Z])

/** 林地上每一格長草的機率，與蟬時雨一樣三成四 */
const PLANT_CHANCE = 0.34

/**
 * 一棵樹的樣子
 *
 * 樹冠中心在腳底以上 crownHeight 格，水平半徑 radius、上下半徑 halfHeight，
 * 底面再壓扁一點（halfHeight × CROWN_BOTTOM_SQUASH），樹冠才是上圓下平的傘，不是一顆球
 */
interface TreeShape {
  crownHeight: number;
  radius: number;
  halfHeight: number;
  /** 兩格粗的老樹 */
  isThick: boolean;
  /** 從樹幹伸出去幾根枝幹 */
  branchCount: number;
  branchLength: number;
}

const CROWN_BOTTOM_SQUASH = 0.75

/** 每一格都記下樹幹在哪，新的樹離舊的樹幹太近就不種 */
type TrunkMap = Uint8Array

function measureClearingOvershoot(x: number, z: number, clearing: CicadaClearing): number {
  return measureDistance(x, z, clearing) - clearing.radius
}

/** 緣廊佔的那一塊（廊板、柵柱與前面一格），樹與草都要讓開 */
function isVerandaCell(x: number, z: number): boolean {
  return VERANDA_LIST.some((veranda) =>
    Math.abs(x - veranda.x) <= VERANDA_HALF_LENGTH + 1 && z >= veranda.z - 1 && z <= veranda.z + 1)
}

/** 離最近一片空地的邊多遠，負的就是在空地裡 */
function measureNearestClearing(x: number, z: number): number {
  return Math.min(
    measureClearingOvershoot(x, z, ARRIVAL_CLEARING),
    measureClearingOvershoot(x, z, SHADE_CLEARING),
    ...SUN_CLEARING_LIST.map((clearing) => measureClearingOvershoot(x, z, clearing)),
  )
}

/** 空地、門前與緣廊都要平：不隆起、不種樹 */
function isOpenGround(x: number, z: number): boolean {
  return measureNearestClearing(x, z) < 1
    || measureDistance(x, z, CICADA_PORTAL_POINT) < 4
    || isVerandaCell(x, z)
}

/**
 * 地面隆起幾格
 *
 * 林子裡零星一格高的小丘；外圍那一圈每三格高一格，最多四格，林子長在往上收的坡上
 */
function measureLevel(x: number, z: number, radius: number, pathDistance: number): number {
  if (pathDistance < 2.5 || isOpenGround(x, z))
    return 0
  const roll = fbm2D(x * 0.07 - 37, z * 0.07 + 5, 2, 0.5)
  if (radius < WOOD_RADIUS + 2)
    return roll > 0.34 ? 1 : 0
  const rise = Math.min(4, 1 + Math.floor((radius - WOOD_RADIUS - 2) / 3))
  return rise + (roll > 0.2 ? 1 : 0)
}

/**
 * 地面與土徑，回傳每一格的地表高度
 *
 * 蟬時雨的地是草皮中間一塊土，樹底下曬不到太陽的地方是土；
 * 這裡土與草一片一片交錯，土多一點；土徑整條是土，曬得到太陽的空地是草
 */
function shapeTerrain(state: Uint8Array, pathDistanceMap: Float32Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, CICADA_CENTER)
      if (radius > CICADA_EDGE_RADIUS + 2) {
        fillHiddenColumn(state, x, z, CICADA_GROUND_Y)
        groundTopMap[x * WORLD_SIZE + z] = CICADA_GROUND_Y
        continue
      }
      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      const topY = CICADA_GROUND_Y + measureLevel(x, z, radius, pathDistance)
      const isSunlit = SUN_CLEARING_LIST.some((clearing) => measureClearingOvershoot(x, z, clearing) < 0)
      const isDirt = !isSunlit && (pathDistance <= 1.05 || fbm2D(x * 0.11 + 9, z * 0.11 - 3, 2, 0.5) > -0.08)
      fillGroundColumn(state, x, z, topY, isDirt ? BlockId.DIRT : BlockId.GRASS)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }
  return groundTopMap
}

function readGroundY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/**
 * 緣廊
 *
 * 與蟬時雨一模一樣：廊板是七格木板（貼地那一層）、坐墊隔一格一個、
 * 後面兩端各一根三格高的柵柱撐著深色木的短簷，簷的前緣是朝北的階梯，簷下一盞吊燈
 */
function buildVerandaList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const veranda of VERANDA_LIST) {
    const deckY = groundTopMap[veranda.x * WORLD_SIZE + veranda.z]!
    const groundY = deckY + 1
    for (let offsetX = -VERANDA_HALF_LENGTH; offsetX <= VERANDA_HALF_LENGTH; offsetX++) {
      setBlock(state, veranda.x + offsetX, deckY, veranda.z, BlockId.PLANKS)
    }
    for (const offsetX of [-VERANDA_HALF_LENGTH, VERANDA_HALF_LENGTH]) {
      for (let level = 0; level < 3; level++) {
        setBlock(state, veranda.x + offsetX, groundY + level, veranda.z + 1, BlockId.FENCE)
      }
    }
    for (let offsetX = -VERANDA_HALF_LENGTH; offsetX <= VERANDA_HALF_LENGTH; offsetX++) {
      setBlock(state, veranda.x + offsetX, groundY + 3, veranda.z + 1, BlockId.DARK_PLANKS)
      setBlock(state, veranda.x + offsetX, groundY + 3, veranda.z, BlockId.DARK_STAIRS_NORTH)
    }
    for (const offsetX of [-3, -1, 1, 3]) {
      setBlock(state, veranda.x + offsetX, groundY, veranda.z, BlockId.CUSHION)
    }
    setBlock(state, veranda.x + 2, groundY + 2, veranda.z, BlockId.HANGING_LAMP)
  }
}

/**
 * 石燈籠
 *
 * 蟬時雨一盞，「白天不亮，但它是這片陰影裡唯一的直線」。
 * 這裡回程門東側（木牌再過去）一盞、兩片空地邊上各一盞，夜裡回頭找門與緣廊就靠它們
 */
function placeLanternList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const pointList = [
    { x: CICADA_PORTAL_POINT.x + 6, z: CICADA_PORTAL_POINT.z - 1 },
    { x: ARRIVAL_CLEARING.x + 5, z: ARRIVAL_CLEARING.z - 4 },
    { x: SHADE_CLEARING.x + 5, z: SHADE_CLEARING.z - 3 },
  ]
  for (const point of pointList) {
    placeStoneLantern(state, point.x, readGroundY(groundTopMap, point.x, point.z), point.z)
  }
}

/**
 * 一團樹冠
 *
 * 扁圓團的距離再加一層三維噪音，邊緣凹凸不定、頂面一塊高一塊低；
 * 只在空氣的格子上長葉，擠在一起的兩團自然長成一片
 */
function placeCrown(
  state: Uint8Array,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
  halfHeight: number,
): void {
  const reachXZ = Math.ceil(radius + 1)
  const reachY = Math.ceil(halfHeight + 1)
  for (let offsetY = -reachY; offsetY <= reachY; offsetY++) {
    const verticalRadius = offsetY < 0 ? halfHeight * CROWN_BOTTOM_SQUASH : halfHeight
    for (let offsetX = -reachXZ; offsetX <= reachXZ; offsetX++) {
      for (let offsetZ = -reachXZ; offsetZ <= reachXZ; offsetZ++) {
        const x = Math.round(centerX + offsetX)
        const y = centerY + offsetY
        const z = Math.round(centerZ + offsetZ)
        const shape = Math.hypot(offsetX / radius, offsetY / verticalRadius, offsetZ / radius)
        const roughness = fbm3D(x * 0.3 + 11, y * 0.35, z * 0.3 - 7, 2, 0.5) * 0.38
        if (shape + roughness > 1)
          continue
        setDecoration(state, x, y, z, BlockId.OAK_LEAVES)
      }
    }
  }
}

/** 四個水平方向，枝幹往這幾個方向伸 */
const DIRECTION_LIST = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
] as const

/**
 * 一棵樹：樹幹、枝幹、樹冠
 *
 * 枝幹從樹冠底下一兩格的地方橫著伸出去，末端往上拐進樹冠，
 * 從林下抬頭看，樹冠是被一根根枝幹撐起來的，不是頂在一根柱子上的一顆球。
 * 老樹兩格粗（2×2），枝幹也長
 */
function placeTree(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  shape: TreeShape,
  random: () => number,
): void {
  const crownY = groundY + shape.crownHeight
  const trunkTopY = crownY + (shape.isThick ? 1 : 0)
  const footprint = shape.isThick ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]
  for (const [offsetX, offsetZ] of footprint) {
    for (let y = groundY - 1; y <= trunkTopY; y++) {
      /** 坡上的樹腳往下補一格，樹幹不會懸在比較低的那一側 */
      if (y === groundY - 1 && getBlock(state, x + offsetX!, y, z + offsetZ!) !== BlockId.AIR)
        continue
      setBlock(state, x + offsetX!, y, z + offsetZ!, BlockId.OAK_LOG)
    }
  }

  const centerX = x + (shape.isThick ? 0.5 : 0)
  const centerZ = z + (shape.isThick ? 0.5 : 0)
  const bottomY = Math.round(crownY - shape.halfHeight * CROWN_BOTTOM_SQUASH)

  const startIndex = Math.floor(random() * DIRECTION_LIST.length)
  for (let index = 0; index < shape.branchCount; index++) {
    const direction = DIRECTION_LIST[(startIndex + index * (index % 2 === 0 ? 1 : 3)) % DIRECTION_LIST.length]!
    const branchY = bottomY - 1 - Math.floor(random() * 2)
    const baseX = direction.x > 0 && shape.isThick ? x + 1 : x
    const baseZ = direction.z > 0 && shape.isThick ? z + 1 : z
    const sideShift = shape.isThick && random() < 0.5 ? 1 : 0
    const logBlock = direction.x !== 0 ? BlockId.OAK_LOG_X : BlockId.OAK_LOG_Z
    let tipX = baseX + (direction.x === 0 ? sideShift : 0)
    let tipZ = baseZ + (direction.z === 0 ? sideShift : 0)
    for (let step = 1; step <= shape.branchLength; step++) {
      tipX += direction.x
      tipZ += direction.z
      /** 枝幹一節一節往上抬，越往外越高 */
      const rise = step > shape.branchLength / 2 ? 1 : 0
      setBlock(state, tipX, branchY + rise, tipZ, logBlock)
    }
    setBlock(state, tipX, branchY + 2, tipZ, BlockId.OAK_LOG)
    /** 枝梢上一小團葉子，接上主樹冠 */
    placeCrown(state, tipX, branchY + 3, tipZ, 1.8, 1.2)
  }

  placeCrown(state, centerX, crownY, centerZ, shape.radius, shape.halfHeight)
}

/** 這一格能不能長樹幹：不在土徑、空地、門前與緣廊上，離已經有的樹幹夠遠 */
function canPlaceTrunk(
  x: number,
  z: number,
  spacing: number,
  trunkMap: TrunkMap,
  pathDistanceMap: Float32Array,
): boolean {
  if (measureDistance(x, z, CICADA_CENTER) > CICADA_EDGE_RADIUS)
    return false
  if (pathDistanceMap[x * WORLD_SIZE + z]! < 2.2 || isOpenGround(x, z))
    return false
  if (measureDistance(x, z, CICADA_PORTAL_POINT) < 6 || measureNearestClearing(x, z) < 1.5)
    return false
  const reach = Math.ceil(spacing)
  for (let offsetX = -reach; offsetX <= reach; offsetX++) {
    for (let offsetZ = -reach; offsetZ <= reach; offsetZ++) {
      if (Math.hypot(offsetX, offsetZ) <= spacing && trunkMap[(x + offsetX) * WORLD_SIZE + z + offsetZ] === 1)
        return false
    }
  }
  return true
}

function markTrunk(trunkMap: TrunkMap, x: number, z: number, isThick: boolean): void {
  trunkMap[x * WORLD_SIZE + z] = 1
  if (isThick) {
    trunkMap[(x + 1) * WORLD_SIZE + z] = 1
    trunkMap[x * WORLD_SIZE + z + 1] = 1
    trunkMap[(x + 1) * WORLD_SIZE + z + 1] = 1
  }
}

/**
 * 種樹，高的先種
 *
 * - 老樹：兩格粗，樹冠在腳底以上十二到十四格、半徑五到六格，高出林冠一截，約每二十格一棵
 * - 主林層：樹冠在腳底以上七到十格、半徑三到四格半，間距四格半上下，疏密吃一層低頻噪音，
 *   樹冠彼此擠成一片，冠與冠之間自然留下漏光的縫
 * - 林下的矮樹：樹冠在腳底以上四格、半徑兩格，長在主林層底下的空隙裡，
 *   最低一層葉子在頭頂上方，走得過去
 * - 幼樹：一兩格高的細幹頂一小撮葉
 */
function placeTreeList(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('cicada-realm-tree')
  const trunkMap: TrunkMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  const reach = CICADA_EDGE_RADIUS

  const plantLayer = (cellSize: number, chanceAt: (x: number, z: number) => number, spacing: number, pickShape: (x: number, z: number) => TreeShape) => {
    for (let cellX = CICADA_CENTER.x - reach; cellX < CICADA_CENTER.x + reach; cellX += cellSize) {
      for (let cellZ = CICADA_CENTER.z - reach; cellZ < CICADA_CENTER.z + reach; cellZ += cellSize) {
        const x = cellX + Math.floor(random() * cellSize)
        const z = cellZ + Math.floor(random() * cellSize)
        const roll = random()
        if (roll > chanceAt(x, z) || !canPlaceTrunk(x, z, spacing, trunkMap, pathDistanceMap))
          continue
        const shape = pickShape(x, z)
        if (shape.isThick && !canPlaceTrunk(x + 1, z + 1, 0.5, trunkMap, pathDistanceMap))
          continue
        const groundY = readGroundY(groundTopMap, x, z)
        if (getBlock(state, x, groundY, z) !== BlockId.AIR)
          continue
        markTrunk(trunkMap, x, z, shape.isThick)
        placeTree(state, x, groundY, z, shape, random)
      }
    }
  }

  /** 老樹：只種在林子裡，外圍那一圈不種（樹冠會探出林子外緣） */
  plantLayer(18, (x, z) => (measureDistance(x, z, CICADA_CENTER) < WOOD_RADIUS - 6 ? 0.7 : 0), 6, () => ({
    crownHeight: 12 + Math.floor(random() * 3),
    radius: 5 + random(),
    halfHeight: 2.6 + random() * 0.6,
    isThick: true,
    branchCount: 3 + Math.floor(random() * 2),
    branchLength: 3 + Math.floor(random() * 2),
  }))

  /** 主林層：林子裡疏密吃噪音，外圍那一圈更密、樹冠小一點 */
  plantLayer(4, (x, z) => {
    const radius = measureDistance(x, z, CICADA_CENTER)
    if (radius > WOOD_RADIUS + 2)
      return 0.8
    const density = fbm2D(x * 0.05 + 17, z * 0.05 - 23, 2, 0.5)
    return Math.min(0.9, Math.max(0.45, 0.68 + density * 0.5))
  }, 3.6, (x, z) => {
    const isRim = measureDistance(x, z, CICADA_CENTER) > WOOD_RADIUS + 2
    return {
      crownHeight: 7 + Math.floor(random() * 4),
      radius: isRim ? 2.8 + random() * 0.6 : 3 + random() * 1.5,
      halfHeight: 1.8 + random() * 0.8,
      isThick: false,
      branchCount: isRim ? 0 : 1 + Math.floor(random() * 2),
      branchLength: 2 + Math.floor(random() * 2),
    }
  })

  /** 林下的矮樹 */
  plantLayer(5, (x, z) => (measureDistance(x, z, CICADA_CENTER) < WOOD_RADIUS ? 0.35 : 0), 2.5, () => ({
    crownHeight: 4,
    radius: 1.8 + random() * 0.6,
    halfHeight: 1.4,
    isThick: false,
    branchCount: 0,
    branchLength: 0,
  }))

  /** 幼樹：一兩格的細幹，頂上幾片葉 */
  for (let attempt = 0; attempt < 160; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = random() * (WOOD_RADIUS - 2)
    const height = 1 + Math.floor(random() * 2)
    const x = Math.round(CICADA_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(CICADA_CENTER.z + Math.sin(angle) * radius)
    if (!canPlaceTrunk(x, z, 1.5, trunkMap, pathDistanceMap))
      continue
    const groundY = readGroundY(groundTopMap, x, z)
    if (getBlock(state, x, groundY, z) !== BlockId.AIR)
      continue
    markTrunk(trunkMap, x, z, false)
    for (let level = 0; level < height; level++) {
      setBlock(state, x, groundY + level, z, BlockId.OAK_LOG)
    }
    setDecoration(state, x, groundY + height, z, BlockId.OAK_LEAVES)
    for (const direction of DIRECTION_LIST) {
      if (random() < 0.5)
        setDecoration(state, x + direction.x, groundY + height, z + direction.z, BlockId.OAK_LEAVES)
    }
  }
}

/**
 * 光縫
 *
 * 樹冠擠得太滿時，冠與冠之間的縫不夠，林下一片均勻的暗。
 * 隨機挑幾處，把那一柱的葉子整根拿掉（半徑一到兩格、邊緣不規則），
 * 正午的陽光就從那裡斜斜打下來一道，落在地上是一塊亮斑
 */
function carveSunShaftList(state: Uint8Array): void {
  const random = createSeededRandom('cicada-realm-shaft')
  for (let index = 0; index < 34; index++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * (WOOD_RADIUS + 4)
    const radius = 1 + random() * 1.2
    const centerX = CICADA_CENTER.x + Math.cos(angle) * distance
    const centerZ = CICADA_CENTER.z + Math.sin(angle) * distance
    for (let x = Math.floor(centerX - radius - 1); x <= Math.ceil(centerX + radius + 1); x++) {
      for (let z = Math.floor(centerZ - radius - 1); z <= Math.ceil(centerZ + radius + 1); z++) {
        const edge = fbm2D(x * 0.6 + index, z * 0.6 - index, 1, 0.5) * 0.7
        if (Math.hypot(x - centerX, z - centerZ) + edge > radius)
          continue
        for (let y = CICADA_GROUND_Y + 3; y < CICADA_GROUND_Y + 22; y++) {
          if (getBlock(state, x, y, z) === BlockId.OAK_LEAVES)
            setBlock(state, x, y, z, BlockId.AIR)
        }
      }
    }
  }
}

/**
 * 林下的草
 *
 * 與蟬時雨同一組、同一個比例，三成四；林下再混一成灌叢，貼地那一層才有高低。
 * 土徑上不長，空地裡少一點；開花的東西照蟬時雨一律不放
 */
function scatterUndergrowth(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('cicada-realm-plant')
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureDistance(x, z, CICADA_CENTER) > CICADA_EDGE_RADIUS)
        continue
      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      if (pathDistance < 1.6 || isVerandaCell(x, z))
        continue
      const chance = isOpenGround(x, z) ? 0.18 : PLANT_CHANCE
      if (random() > chance)
        continue
      const roll = random()
      let blockId: BlockId
      if (roll < 0.1 && !isOpenGround(x, z))
        blockId = BlockId.BUSH
      else if (roll < 0.4)
        blockId = BlockId.FERN
      else if (roll < 0.63)
        blockId = BlockId.FOREST_LITTER
      else if (roll < 0.83)
        blockId = BlockId.TALL_GRASS
      else
        blockId = BlockId.STONE_PLANT
      plantOnGround(state, x, readGroundY(groundTopMap, x, z), z, blockId, FLOOR_SET)
    }
  }
}

/** 生成整片蟬雨深林 */
export function generateCicadaWorld(state: Uint8Array): void {
  const pathPointList = samplePathCurve(CICADA_PATH_CONTROL_POINT_LIST)
  const pathDistanceMap = createPathDistanceMap([pathPointList], 6)
  const groundTopMap = shapeTerrain(state, pathDistanceMap)
  buildVerandaList(state, groundTopMap)
  placeLanternList(state, groundTopMap)
  placeTreeList(state, groundTopMap, pathDistanceMap)
  carveSunShaftList(state)
  hollowEnclosedLeafList(state, LEAF_SET, CROWN_SET, CICADA_GROUND_Y + 2, CICADA_GROUND_Y + 22)
  scatterUndergrowth(state, groundTopMap, pathDistanceMap)

  /** 門框排在花草之後：門洞前後與木牌前面的草由它清掉 */
  for (const portal of CICADA_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  /** 回程門往北、落腳那幾格也清掉 */
  for (let offsetZ = -4; offsetZ <= 2; offsetZ++) {
    const x = CICADA_PORTAL_POINT.x
    const z = CICADA_PORTAL_POINT.z + offsetZ
    const y = readGroundY(groundTopMap, x, z)
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && isPassableBlock(blockId))
      setBlock(state, x, y, z, BlockId.AIR)
  }
}
