import type { RealmPortal } from './realm-definition'
import { BlockId, getCollisionWidth, isPassableBlock, isWaterBlock } from '../block/block-constants'
import { getBlock, setBlock } from '../world/world-access'

/**
 * 傳送門的門框與木牌（方塊的部分）
 *
 * 只有地形 worker 用。門洞裡那片流動的霧與牌面是渲染端的事，
 * 見 portal-gate.ts；這裡只負責把骨架用方塊搭起來
 */

/** 兩根門柱離門洞中心幾格：門洞就是正中那一格，柱子立在左右兩格的中央 */
export const PORTAL_POST_OFFSET = 1

/** 門柱是木樁（WOOD_POST），粗細與碰撞寬度同一個數字 */
const PORTAL_POST_THICKNESS = getCollisionWidth(BlockId.WOOD_POST)

/**
 * 兩根門柱之間淨空的半寬（格），約 0.79
 *
 * 人寬 0.6，從正中走過去兩側各還有半格的餘裕。
 * 霧面的寬度與觸發範圍都照這個數字，貼著兩根柱子的內緣
 */
export const PORTAL_CLEAR_HALF_WIDTH = PORTAL_POST_OFFSET - PORTAL_POST_THICKNESS / 2

/** 門洞高三格，人高 1.8，抬頭也碰不到樑 */
export const PORTAL_OPENING_HEIGHT = 3

/** 沿著門洞攤開的那一軸走 along 格、穿過門洞的那一軸走 across 格 */
function toSpanPoint(portal: RealmPortal, along: number, across = 0): { x: number; z: number } {
  return portal.spanAxis === 'x'
    ? { x: portal.x + along, z: portal.z + across }
    : { x: portal.x + across, z: portal.z + along }
}

/**
 * 清掉某一格柱從腳底往上三格裡的花草
 *
 * 紙莎草會疊兩三格高，長在門洞正後方會擋住從門外望進去的那一眼，
 * 長在木牌前面會從牌面穿出來
 */
function clearPlant(state: Uint8Array, x: number, y: number, z: number): void {
  for (let level = 0; level < 3; level++) {
    const blockId = getBlock(state, x, y + level, z)
    if (blockId !== BlockId.AIR && isPassableBlock(blockId) && !isWaterBlock(blockId)) {
      setBlock(state, x, y + level, z, BlockId.AIR)
    }
  }
}

/**
 * 門框
 *
 * 一座小鳥居：兩根細木樁、一道深色的島木壓在柱頭上，最上面再一片笠木，
 * 兩端用階梯收尾（與箱庭裡的鳥居 placeTorii 同一種收法）。
 * 整座五格寬、五格高，箱庭十五格見方的木座邊上放得下，不會壓過池子。
 *
 * 拿掉了穿過門洞的那根「貫」：門洞只有三格高，那一根正好在頭的高度，碰撞會把人擋在門外。
 * 柱子用細木樁而不是整格的木頭：整格的柱子把一格寬的門洞夾成一道窄縫，
 * 細樁兩根之間淨空一格半，看起來是一道門，走起來也不卡。
 *
 * 柱腳底下那一格換成石板，柱子才是「立在上面」，不是插進地裡
 */
export function placePortalFrame(state: Uint8Array, portal: RealmPortal): void {
  const isAlongX = portal.spanAxis === 'x'

  for (const side of [-PORTAL_POST_OFFSET, PORTAL_POST_OFFSET]) {
    const point = toSpanPoint(portal, side)
    setBlock(state, point.x, portal.y - 1, point.z, BlockId.STONE_TILE)
    for (let level = 0; level < PORTAL_OPENING_HEIGHT; level++) {
      setBlock(state, point.x, portal.y + level, point.z, BlockId.WOOD_POST)
    }
  }

  /**
   * 門洞裡清空，門前門後各一格的花草也清掉，穿過門的那一條路與那一眼是空的
   *
   * 腳底那一格若是半磚木棧就留著：水鏡池的門立在池中、木棧一路鋪進門洞，
   * 拿掉的話門洞裡是一格水，人走到門口會先掉下去
   */
  const center = toSpanPoint(portal, 0)
  for (let level = 0; level < PORTAL_OPENING_HEIGHT; level++) {
    const isBoardwalk = level === 0 && getBlock(state, center.x, portal.y, center.z) === BlockId.WOOD_SLAB
    if (!isBoardwalk) {
      setBlock(state, center.x, portal.y + level, center.z, BlockId.AIR)
    }
  }
  for (const across of [-1, 1]) {
    const point = toSpanPoint(portal, 0, across)
    clearPlant(state, point.x, portal.y, point.z)
  }

  /** 島木：壓在兩根柱頭上 */
  const beamY = portal.y + PORTAL_OPENING_HEIGHT
  for (let offset = -PORTAL_POST_OFFSET; offset <= PORTAL_POST_OFFSET; offset++) {
    const point = toSpanPoint(portal, offset)
    setBlock(state, point.x, beamY, point.z, BlockId.DARK_PLANKS)
  }

  /** 笠木：用半磚收薄，比島木再寬一格，兩端的階梯做出往外翹的收尾 */
  const capY = beamY + 1
  for (let offset = -PORTAL_POST_OFFSET; offset <= PORTAL_POST_OFFSET; offset++) {
    const point = toSpanPoint(portal, offset)
    setBlock(state, point.x, capY, point.z, BlockId.DARK_WOOD_SLAB)
  }
  const capStart = toSpanPoint(portal, -PORTAL_POST_OFFSET - 1)
  const capEnd = toSpanPoint(portal, PORTAL_POST_OFFSET + 1)
  setBlock(state, capStart.x, capY, capStart.z, isAlongX ? BlockId.DARK_STAIRS_EAST : BlockId.DARK_STAIRS_SOUTH)
  setBlock(state, capEnd.x, capY, capEnd.z, isAlongX ? BlockId.DARK_STAIRS_WEST : BlockId.DARK_STAIRS_NORTH)

  placePortalLights(state, portal, beamY)
}

/**
 * 門上會亮的裝飾
 *
 * 一座深色木頭的小鳥居站在箱庭邊上，白天還認得出來，入夜就只剩一個黑框，
 * 遠遠看不出那裡有一道門。所以讓門自己亮：
 *
 * - 島木正中央、門洞正上方那一格換成和紙燈箱，位置正是鳥居掛「額」的地方，
 *   像一塊會發光的匾，人一抬頭就知道這是入口
 * - 笠木兩端往外翹的那一格底下各吊一盞提燈，勾出整座門的寬
 *
 * 這幾格都是方塊光源，燈火那一套會自己掃到：真光照亮門框與門前的地，
 * 夜裡還有一圈光暈。提燈可以穿過，掛在柱子外側，不會擋到門洞
 */
function placePortalLights(state: Uint8Array, portal: RealmPortal, beamY: number): void {
  const plaque = toSpanPoint(portal, 0)
  setBlock(state, plaque.x, beamY, plaque.z, BlockId.PAPER_LAMP)

  for (const side of [-PORTAL_POST_OFFSET - 1, PORTAL_POST_OFFSET + 1]) {
    const point = toSpanPoint(portal, side)
    setBlock(state, point.x, beamY, point.z, BlockId.HANGING_LAMP)
  }
}

/** 牌面朝向換算成水平的單位向量：北是 -Z */
export const SIGN_FACING_OFFSET_MAP = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
} as const

/**
 * 木牌的柱子有幾格高
 *
 * 一根細木樁，牌面掛在它朝外那一側（見 portal-gate 的 SIGN_BOARD_*）。
 * 兩格高：牌面頂緣約在眼睛的高度，柱頭再冒出牌面一點點，看得出牌子是釘在柱上的
 */
export const SIGN_POST_HEIGHT = 2

/**
 * 木牌的骨架：一根細木樁
 *
 * 牌面本身不是方塊：整格的木板做成的牌子是一塊大木箱，
 * 渲染端改用一片薄板貼在柱子前面，木紋與字都畫在同一張貼圖上
 */
export function placeSignPost(state: Uint8Array, portal: RealmPortal): void {
  const { sign } = portal
  if (!sign)
    return

  for (let level = 0; level < SIGN_POST_HEIGHT; level++) {
    setBlock(state, sign.x, portal.y + level, sign.z, BlockId.WOOD_POST)
  }

  /**
   * 柱子四周一圈的花草清掉
   *
   * 牌面掛在柱子朝外那一側、寬一格半，那一側的花草會從牌面穿出來；
   * 背後的紙莎草比牌子高，從正面看會從牌頂冒出一截
   */
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      if (offsetX !== 0 || offsetZ !== 0) {
        clearPlant(state, sign.x + offsetX, portal.y, sign.z + offsetZ)
      }
    }
  }
}

/** 一座傳送門的全部方塊 */
export function placePortalStructure(state: Uint8Array, portal: RealmPortal): void {
  placePortalFrame(state, portal)
  placeSignPost(state, portal)
}
