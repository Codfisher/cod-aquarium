import type { RainhallRect } from './rainhall-layout'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  carveWater,
  fillBox,
  getNoisyDistance,
  placeStoneLantern,
  plantWithStack,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_HEIGHT, WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import {
  BRIDGE_MAX_Z,
  BRIDGE_MIN_Z,
  CLOISTER_OUTER_RECT,
  CLOISTER_WALL_HEIGHT,
  CLOISTER_WIDTH,
  COURTYARD_POOL,
  HALL_RECT,
  HALL_WALL_HEIGHT,
  RAINHALL_CENTER,
  RAINHALL_FLOOR_Y,
} from './rainhall-layout'
import { RAINHALL_REALM } from './rainhall-realm'

/**
 * 雨聽深院的地形
 *
 * 只有地形 worker 用。照雨聽堂（buildRainhallGarden）放大：石板地、深色木的牆與屋頂、
 * 榻榻米、側牆腰部一排玻璃窗、開口兩角的障子、往外收薄的出簷（四邊各一種朝向的階梯）、
 * 出簷正下方一圈卵石滴水線與上面積起來的幾窪水、屋裡的和紙燈與吊燈、簷角的風鈴、
 * 開口前的坐墊、屋外的石燈籠，地上零星的蕨與捲葉草。
 * 雨聽堂沒有樹、沒有草地，這裡也不加。
 *
 * 順序：地面 → 大堂、迴廊、渡廊與北牆 → 依屋頂算出滴水線、鋪卵石、挖積水 →
 * 燈、坐墊、風鈴 → 中庭的石燈籠與花草 → 傳送門
 */

const CENTER_X = RAINHALL_CENTER.x
const CENTER_Z = RAINHALL_CENTER.z
const FLOOR_Y = RAINHALL_FLOOR_Y
/** 腳底的整數高度 */
const GROUND_Y = FLOOR_Y + 1

/** 屋頂的方塊：滴水線靠它判斷頭頂有沒有遮 */
const ROOF_BLOCK_SET = new Set<BlockId>([
  BlockId.DARK_PLANKS,
  BlockId.DARK_WOOD_SLAB,
  BlockId.DARK_STAIRS_NORTH,
  BlockId.DARK_STAIRS_SOUTH,
  BlockId.DARK_STAIRS_EAST,
  BlockId.DARK_STAIRS_WEST,
])

/** 相對院子中心的座標換成世界座標，填一個矩形的一層 */
function fillRect(state: Uint8Array, rect: RainhallRect, y: number, blockId: BlockId): void {
  fillBox(state, CENTER_X + rect.minX, y, CENTER_Z + rect.minZ, CENTER_X + rect.maxX, y, CENTER_Z + rect.maxZ, blockId)
}

function setLocal(state: Uint8Array, offsetX: number, y: number, offsetZ: number, blockId: BlockId): void {
  setBlock(state, CENTER_X + offsetX, y, CENTER_Z + offsetZ, blockId)
}

function getLocal(state: Uint8Array, offsetX: number, y: number, offsetZ: number): BlockId {
  return getBlock(state, CENTER_X + offsetX, y, CENTER_Z + offsetZ)
}

function insetRect(rect: RainhallRect, inset: number): RainhallRect {
  return { minX: rect.minX + inset, maxX: rect.maxX - inset, minZ: rect.minZ + inset, maxZ: rect.maxZ - inset }
}

/** 院子裡（外牆以內）的範圍 */
const COMPOUND_RECT = insetRect(CLOISTER_OUTER_RECT, 1)

/**
 * 出簷那一層
 *
 * 與雨聽堂同一種做法：四邊各用一種朝向的階梯，靠背朝內、薄的那一側朝外，
 * 屋簷才是往外收薄的斜面；裡面是實心的深色木。edgeList 決定哪幾邊要收成階梯，
 * 迴廊靠外牆那一邊壓在牆頂上，不必收
 */
function placeEave(
  state: Uint8Array,
  rect: RainhallRect,
  y: number,
  edgeList: ('north' | 'south' | 'east' | 'west')[],
): void {
  for (let offsetX = rect.minX; offsetX <= rect.maxX; offsetX++) {
    for (let offsetZ = rect.minZ; offsetZ <= rect.maxZ; offsetZ++) {
      let blockId = BlockId.DARK_PLANKS
      if (offsetZ === rect.minZ && edgeList.includes('north'))
        blockId = BlockId.DARK_STAIRS_SOUTH
      else if (offsetZ === rect.maxZ && edgeList.includes('south'))
        blockId = BlockId.DARK_STAIRS_NORTH
      else if (offsetX === rect.minX && edgeList.includes('west'))
        blockId = BlockId.DARK_STAIRS_EAST
      else if (offsetX === rect.maxX && edgeList.includes('east'))
        blockId = BlockId.DARK_STAIRS_WEST
      setLocal(state, offsetX, y, offsetZ, blockId)
    }
  }
}

/** 屋頂往上收的一層：外圈半磚、裡面實心（placeRoofCap 的矩形版） */
function placeRoofLayer(state: Uint8Array, rect: RainhallRect, y: number): void {
  for (let offsetX = rect.minX; offsetX <= rect.maxX; offsetX++) {
    for (let offsetZ = rect.minZ; offsetZ <= rect.maxZ; offsetZ++) {
      const isEdge = offsetX === rect.minX || offsetX === rect.maxX || offsetZ === rect.minZ || offsetZ === rect.maxZ
      setLocal(state, offsetX, y, offsetZ, isEdge ? BlockId.DARK_WOOD_SLAB : BlockId.DARK_PLANKS)
    }
  }
}

/** 地面：院子裡是石板，牆外走不到的地方是不畫的 LAKE_BED */
function shapeGround(state: Uint8Array): void {
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)
  fillBox(state, 0, 1, 0, WORLD_SIZE - 1, FLOOR_Y - 1, WORLD_SIZE - 1, BlockId.STONE)
  fillBox(state, 0, FLOOR_Y, 0, WORLD_SIZE - 1, FLOOR_Y, WORLD_SIZE - 1, BlockId.LAKE_BED)
  fillRect(state, CLOISTER_OUTER_RECT, FLOOR_Y, BlockId.STONE_TILE)
}

/**
 * 大堂
 *
 * 雨聽堂那間屋子放大：北、東、西三面牆，南面整排敞開；側牆腰部（第三層）隔一格開一扇玻璃窗，
 * 看得到兩側小庭的雨。地板是一圈深色木框著榻榻米，開口那一排是深色木的門檻。
 * 開口太寬（二十三格），兩角各一扇障子之外再立兩根柱子，屋簷才看得出是被撐著的
 */
function buildHall(state: Uint8Array): void {
  fillRect(state, HALL_RECT, FLOOR_Y, BlockId.DARK_PLANKS)
  fillRect(state, { ...insetRect(HALL_RECT, 1), maxZ: HALL_RECT.maxZ - 1 }, FLOOR_Y, BlockId.TATAMI)

  for (let level = 0; level < HALL_WALL_HEIGHT; level++) {
    const y = GROUND_Y + level
    for (let offsetX = HALL_RECT.minX; offsetX <= HALL_RECT.maxX; offsetX++) {
      for (let offsetZ = HALL_RECT.minZ; offsetZ < HALL_RECT.maxZ; offsetZ++) {
        const isSide = offsetX === HALL_RECT.minX || offsetX === HALL_RECT.maxX
        const isBack = offsetZ === HALL_RECT.minZ
        if (!isSide && !isBack)
          continue

        const isWindow = level === 2 && isSide && !isBack && Math.abs(offsetZ) % 2 === 1
        setLocal(state, offsetX, y, offsetZ, isWindow ? BlockId.GLASS_PANE : BlockId.DARK_PLANKS)
      }
    }
  }

  for (const offsetX of [HALL_RECT.minX, HALL_RECT.maxX]) {
    for (let level = 0; level < 2; level++) {
      setLocal(state, offsetX, GROUND_Y + level, HALL_RECT.maxZ, BlockId.SHOJI_PANEL_X)
    }
  }
  for (const offsetX of [-6, 6]) {
    for (let level = 0; level < HALL_WALL_HEIGHT; level++) {
      setLocal(state, offsetX, GROUND_Y + level, HALL_RECT.maxZ, BlockId.DARK_PLANKS)
    }
  }

  const eaveY = GROUND_Y + HALL_WALL_HEIGHT
  placeEave(state, insetRect(HALL_RECT, -1), eaveY, ['north', 'south', 'east', 'west'])
  placeRoofLayer(state, HALL_RECT, eaveY + 1)
  placeRoofLayer(state, insetRect(HALL_RECT, 1), eaveY + 2)
}

/**
 * 迴廊
 *
 * 外牆一格、走道三格、內側一排柱子（每三格一根），屋頂從外牆頂伸到柱子外一格，
 * 那一格就是迴廊的出簷，雨從那裡落進中庭。屋頂只有兩層（出簷加一道半磚的脊），
 * 走在迴廊裡頭頂的遮蔽不會被當成進了洞穴
 */
function buildCloister(state: Uint8Array): void {
  const outer = CLOISTER_OUTER_RECT
  const roofY = GROUND_Y + CLOISTER_WALL_HEIGHT
  const pillarInset = CLOISTER_WIDTH
  const eaveInset = CLOISTER_WIDTH + 1

  /** 外牆一整圈（北面也是，北面沒有迴廊，就是一道封住院子的牆） */
  for (let level = 0; level < CLOISTER_WALL_HEIGHT; level++) {
    for (let offsetX = outer.minX; offsetX <= outer.maxX; offsetX++) {
      for (let offsetZ = outer.minZ; offsetZ <= outer.maxZ; offsetZ++) {
        const isEdge = offsetX === outer.minX || offsetX === outer.maxX || offsetZ === outer.minZ || offsetZ === outer.maxZ
        if (isEdge)
          setLocal(state, offsetX, GROUND_Y + level, offsetZ, BlockId.DARK_PLANKS)
      }
    }
  }
  /** 北牆頂壓一道半磚 */
  fillRect(state, { minX: outer.minX, maxX: outer.maxX, minZ: outer.minZ, maxZ: outer.minZ }, roofY, BlockId.DARK_WOOD_SLAB)

  const westRect = { minX: outer.minX, maxX: outer.minX + eaveInset, minZ: outer.minZ, maxZ: outer.maxZ }
  const eastRect = { minX: outer.maxX - eaveInset, maxX: outer.maxX, minZ: outer.minZ, maxZ: outer.maxZ }
  const southRect = { minX: outer.minX, maxX: outer.maxX, minZ: outer.maxZ - eaveInset, maxZ: outer.maxZ }

  /** 走道鋪深色木 */
  for (const rect of [westRect, eastRect, southRect]) {
    fillRect(state, rect, FLOOR_Y, BlockId.DARK_PLANKS)
  }

  placeEave(state, southRect, roofY, ['north'])
  placeEave(state, westRect, roofY, ['east'])
  placeEave(state, eastRect, roofY, ['west'])
  /** 屋脊：走道正上方一道半磚 */
  fillRect(state, { minX: outer.minX + 1, maxX: outer.minX + pillarInset - 1, minZ: outer.minZ, maxZ: outer.maxZ - 1 }, roofY + 1, BlockId.DARK_WOOD_SLAB)
  fillRect(state, { minX: outer.maxX - pillarInset + 1, maxX: outer.maxX - 1, minZ: outer.minZ, maxZ: outer.maxZ - 1 }, roofY + 1, BlockId.DARK_WOOD_SLAB)
  fillRect(state, { minX: outer.minX + 1, maxX: outer.maxX - 1, minZ: outer.maxZ - pillarInset + 1, maxZ: outer.maxZ - 1 }, roofY + 1, BlockId.DARK_WOOD_SLAB)

  /** 內側的柱子：每三格一根，轉角那一根兩邊共用 */
  const pillarX = outer.minX + pillarInset
  const pillarZ = outer.maxZ - pillarInset
  for (let offsetZ = BRIDGE_MAX_Z + 1; offsetZ <= pillarZ; offsetZ++) {
    if ((pillarZ - offsetZ) % 3 !== 0)
      continue
    for (let level = 0; level < CLOISTER_WALL_HEIGHT; level++) {
      setLocal(state, pillarX, GROUND_Y + level, offsetZ, BlockId.DARK_PLANKS)
      setLocal(state, -pillarX, GROUND_Y + level, offsetZ, BlockId.DARK_PLANKS)
    }
  }
  for (let offsetX = pillarX; offsetX <= -pillarX; offsetX++) {
    if ((offsetX - pillarX) % 3 !== 0)
      continue
    for (let level = 0; level < CLOISTER_WALL_HEIGHT; level++) {
      setLocal(state, offsetX, GROUND_Y + level, pillarZ, BlockId.DARK_PLANKS)
    }
  }
  /** 兩側小庭那一段（渡廊以北）同樣立柱，面對小庭 */
  for (let offsetZ = outer.minZ + 3; offsetZ < BRIDGE_MIN_Z - 1; offsetZ += 3) {
    for (let level = 0; level < CLOISTER_WALL_HEIGHT; level++) {
      setLocal(state, pillarX, GROUND_Y + level, offsetZ, BlockId.DARK_PLANKS)
      setLocal(state, -pillarX, GROUND_Y + level, offsetZ, BlockId.DARK_PLANKS)
    }
  }
}

/**
 * 渡廊
 *
 * 大堂敞開的那一排往東西兩邊各接一道三格寬的短廊，接到迴廊上。
 * 從大堂走到迴廊一路都在簷下；短廊南北兩邊都收出簷，北邊是大堂側牆外的小庭、南邊是中庭
 */
function buildBridgeList(state: Uint8Array): void {
  const roofY = GROUND_Y + CLOISTER_WALL_HEIGHT
  const innerX = -(CLOISTER_OUTER_RECT.minX + CLOISTER_WIDTH + 1)
  for (const sign of [-1, 1]) {
    const nearX = sign * (HALL_RECT.maxX + 1)
    const farX = sign * (innerX - 1)
    const rect = { minX: Math.min(nearX, farX), maxX: Math.max(nearX, farX), minZ: BRIDGE_MIN_Z, maxZ: BRIDGE_MAX_Z }
    fillRect(state, rect, FLOOR_Y, BlockId.DARK_PLANKS)
    placeEave(state, { ...rect, minZ: rect.minZ - 1, maxZ: rect.maxZ + 1 }, roofY, ['north', 'south'])
    /** 屋脊不壓到大堂的出簷底下（大堂出簷在牆外一格） */
    const ridgeRect = sign < 0 ? { ...rect, maxX: rect.maxX - 1 } : { ...rect, minX: rect.minX + 1 }
    fillRect(state, ridgeRect, roofY + 1, BlockId.DARK_WOOD_SLAB)

    /** 柱子立在出簷底下那兩排（走道兩側），不擋走道 */
    for (const offsetZ of [BRIDGE_MIN_Z - 1, BRIDGE_MAX_Z + 1]) {
      for (let level = 0; level < CLOISTER_WALL_HEIGHT; level++) {
        setLocal(state, sign * 15, GROUND_Y + level, offsetZ, BlockId.DARK_PLANKS)
      }
    }
  }
}

/** 頭頂有沒有屋頂（地板上方五到九格之間有屋頂的方塊） */
function isRoofed(state: Uint8Array, offsetX: number, offsetZ: number): boolean {
  for (let y = GROUND_Y + CLOISTER_WALL_HEIGHT; y < Math.min(WORLD_HEIGHT, GROUND_Y + HALL_WALL_HEIGHT + 4); y++) {
    if (ROOF_BLOCK_SET.has(getLocal(state, offsetX, y, offsetZ)))
      return true
  }
  return false
}

/** 地板那一格上面能不能站人（不是牆、不是柱） */
function isWalkable(state: Uint8Array, offsetX: number, offsetZ: number): boolean {
  return getLocal(state, offsetX, GROUND_Y, offsetZ) === BlockId.AIR
}

function isInsideRect(offsetX: number, offsetZ: number, rect: RainhallRect): boolean {
  return offsetX >= rect.minX && offsetX <= rect.maxX && offsetZ >= rect.minZ && offsetZ <= rect.maxZ
}

/**
 * 滴水線
 *
 * 出簷正下方那一圈鋪卵石（雨聽堂：屋簷落下來的水打在裸土上會濺泥，鋪一排石頭才不會）。
 * 這裡屋頂有好幾片，不一片一片算，改成看頭頂：頭上有屋頂、旁邊一格是露天的那些格子，
 * 就是出簷的最外一圈。卵石上隨機積幾窪水（雨聽堂三十來格滴水線上三窪，約一成）
 */
function layDripLine(state: Uint8Array): { x: number; z: number }[] {
  const random = createSeededRandom('rainhall-drip')
  const dripList: { x: number; z: number }[] = []

  for (let offsetX = COMPOUND_RECT.minX; offsetX <= COMPOUND_RECT.maxX; offsetX++) {
    for (let offsetZ = COMPOUND_RECT.minZ; offsetZ <= COMPOUND_RECT.maxZ; offsetZ++) {
      if (!isWalkable(state, offsetX, offsetZ) || !isRoofed(state, offsetX, offsetZ))
        continue
      const isEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([stepX, stepZ]) => {
        const nextX = offsetX + stepX!
        const nextZ = offsetZ + stepZ!
        return isInsideRect(nextX, nextZ, COMPOUND_RECT)
          && isWalkable(state, nextX, nextZ)
          && !isRoofed(state, nextX, nextZ)
      })
      if (isEdge)
        dripList.push({ x: offsetX, z: offsetZ })
    }
  }

  for (const cell of dripList) {
    setLocal(state, cell.x, FLOOR_Y, cell.z, BlockId.GRAVEL)
  }
  for (const cell of dripList) {
    if (random() < 0.1) {
      carveWater(state, CENTER_X + cell.x, FLOOR_Y, CENTER_Z + cell.z, 1, BlockId.GRAVEL)
    }
  }

  return dripList
}

/**
 * 中庭正中的一大窪積水
 *
 * 雨聽堂的積水都在滴水線上；中庭大了，雨水在正中積成一窪，邊上一圈卵石，
 * 下雨時整片水面被打得一圈一圈
 */
function carveCourtyardPool(state: Uint8Array): void {
  const { x, z, radius } = COURTYARD_POOL
  const limit = Math.ceil(radius + 3)
  for (let offsetX = -limit; offsetX <= limit; offsetX++) {
    for (let offsetZ = -limit; offsetZ <= limit; offsetZ++) {
      const worldX = CENTER_X + x + offsetX
      const worldZ = CENTER_Z + z + offsetZ
      const distance = getNoisyDistance(worldX, worldZ, CENTER_X + x, CENTER_Z + z, 0.3, 1.2)
      if (distance <= radius)
        carveWater(state, worldX, FLOOR_Y, worldZ, 1, BlockId.GRAVEL)
      else if (distance <= radius + 1.3)
        setBlock(state, worldX, FLOOR_Y, worldZ, BlockId.GRAVEL)
    }
  }
}

/**
 * 燈、坐墊與風鈴
 *
 * 雨聽堂屋內一盞落地的和紙燈、天花板中央一盞吊燈；大堂大了，四角與兩側各一盞落地燈、天花板三盞吊燈。
 * 迴廊靠外牆每十來格一盞落地燈，夜裡沿著迴廊一路亮過去。
 * 坐墊擺在大堂開口前一排（雨聽堂兩個），迴廊內側柱子邊也零星幾個，坐下來面對中庭。
 * 風鈴掛在大堂東西兩側的出簷底下（雨聽堂在東南簷角）
 */
function placeFurnishing(state: Uint8Array): void {
  for (const point of [
    { x: HALL_RECT.minX + 1, z: HALL_RECT.minZ + 1 },
    { x: HALL_RECT.maxX - 1, z: HALL_RECT.minZ + 1 },
    { x: HALL_RECT.minX + 1, z: -19 },
    { x: HALL_RECT.maxX - 1, z: -19 },
  ]) {
    setLocal(state, point.x, GROUND_Y, point.z, BlockId.PAPER_LAMP)
  }
  for (const point of [{ x: -6, z: -20 }, { x: 6, z: -20 }, { x: 0, z: -18 }]) {
    setLocal(state, point.x, GROUND_Y + HALL_WALL_HEIGHT - 1, point.z, BlockId.HANGING_LAMP)
  }
  for (const offsetX of [-7, -4, -1, 1, 4, 7]) {
    setLocal(state, offsetX, GROUND_Y, HALL_RECT.maxZ - 1, BlockId.CUSHION)
  }
  for (const offsetX of [-(HALL_RECT.maxX + 1), HALL_RECT.maxX + 1]) {
    setLocal(state, offsetX, GROUND_Y + HALL_WALL_HEIGHT - 1, -17, BlockId.WIND_CHIME)
  }

  const outer = CLOISTER_OUTER_RECT
  const lampX = outer.minX + 1
  const lampZ = outer.maxZ - 1
  for (const offsetZ of [-20, -8, 4, 16]) {
    setLocal(state, lampX, GROUND_Y, offsetZ, BlockId.PAPER_LAMP)
    setLocal(state, -lampX, GROUND_Y, offsetZ, BlockId.PAPER_LAMP)
  }
  for (const offsetX of [-12, 0, 12]) {
    setLocal(state, offsetX, GROUND_Y, lampZ, BlockId.PAPER_LAMP)
  }

  const cushionX = outer.minX + CLOISTER_WIDTH - 1
  const cushionZ = outer.maxZ - CLOISTER_WIDTH + 1
  for (const offsetZ of [-5, 7, 19]) {
    if (isWalkable(state, cushionX, offsetZ))
      setLocal(state, cushionX, GROUND_Y, offsetZ, BlockId.CUSHION)
    if (isWalkable(state, -cushionX, offsetZ))
      setLocal(state, -cushionX, GROUND_Y, offsetZ, BlockId.CUSHION)
  }
  for (const offsetX of [-8, 8]) {
    if (isWalkable(state, offsetX, cushionZ))
      setLocal(state, offsetX, GROUND_Y, cushionZ, BlockId.CUSHION)
  }
}

/**
 * 屋外的石燈籠
 *
 * 雨聽堂兩盞，立在滴水線外兩格、照著那條滴水線；
 * 這裡沿著大堂前、迴廊內側與兩側小庭各立一盞，同樣離滴水線兩格
 */
const LANTERN_LIST = [
  { x: -8, z: -10 },
  { x: 8, z: -10 },
  { x: -15, z: 1 },
  { x: 15, z: 4 },
  { x: -15, z: 15 },
  { x: 15, z: 17 },
  { x: -7, z: 20 },
  { x: 7, z: 20 },
  { x: -15, z: -22 },
  { x: 15, z: -20 },
]

/**
 * 地上零星的蕨與捲葉草
 *
 * 與雨聽堂同一組、同一個機率：石板上每格兩成二，蕨六成、捲葉草四成。
 * 只長在露天的石板上，簷下、卵石與積水上不長
 */
function scatterPlant(state: Uint8Array): void {
  const random = createSeededRandom('rainhall-plant')
  for (let offsetX = COMPOUND_RECT.minX; offsetX <= COMPOUND_RECT.maxX; offsetX++) {
    for (let offsetZ = COMPOUND_RECT.minZ; offsetZ <= COMPOUND_RECT.maxZ; offsetZ++) {
      if (random() > 0.22)
        continue
      if (getLocal(state, offsetX, FLOOR_Y, offsetZ) !== BlockId.STONE_TILE || !isWalkable(state, offsetX, offsetZ))
        continue
      if (isRoofed(state, offsetX, offsetZ))
        continue
      plantWithStack(state, CENTER_X + offsetX, GROUND_Y, CENTER_Z + offsetZ, random() < 0.6 ? BlockId.FERN : BlockId.CURLY_PLANT, random)
    }
  }
}

/** 生成整座雨聽深院 */
export function generateRainhallWorld(state: Uint8Array): void {
  shapeGround(state)
  buildCloister(state)
  buildBridgeList(state)
  buildHall(state)
  carveCourtyardPool(state)
  layDripLine(state)
  placeFurnishing(state)
  for (const lantern of LANTERN_LIST) {
    placeStoneLantern(state, CENTER_X + lantern.x, GROUND_Y, CENTER_Z + lantern.z)
  }
  scatterPlant(state)

  /** 門框排在最後：門洞前後與木牌旁的花草由它清掉 */
  for (const portal of RAINHALL_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
