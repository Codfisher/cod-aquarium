import { BlockId, getCollisionHeight, getCollisionWidth, isDecorationBlock, isPassableBlock, isThinFloorBlock, isWaterBlock, LIQUID_SURFACE_DROP } from '../block/block-constants'
import { SAND_LEVEL } from '../garden/garden-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from '../world/world-constants'

/** 玩家 AABB 尺寸 */
export const PLAYER_WIDTH = 0.6
export const PLAYER_HEIGHT = 1.8
/** 眼睛相對於腳底的高度 */
export const PLAYER_EYE_HEIGHT = 1.62

/** 碰撞解析結果 */
export interface CollisionResult {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  isOnGround: boolean;
  /** 這一幀因為跨階而被抬高的高度，畫面用它做平滑過渡 */
  stepUpHeight: number;
}

/** 讀取方塊（界外視為空氣） */
export function readBlock(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
): BlockId {
  if (
    blockX < 0 || blockX >= WORLD_SIZE
    || blockZ < 0 || blockZ >= WORLD_SIZE
    || blockY < 0 || blockY >= WORLD_HEIGHT
  ) {
    return BlockId.AIR
  }

  return worldState[coordinateToIndex(blockX, blockY, blockZ)] as BlockId
}

/**
 * 查詢指定網格座標是否會擋住玩家
 */
export function isBlockSolid(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
): boolean {
  if (blockY < 0 || blockY >= WORLD_HEIGHT) {
    return false
  }

  /**
   * 水平邊界外一樣是白沙地
   *
   * 舊版在這裡回傳「實體牆壁」，因為那是一座四面環海的島。
   * 現在世界是循環的：玩家會走過邊界再從另一頭出來，
   * 邊界擺一道看不見的牆會讓他在跨過去的前一刻被卡住。
   * 沙地在感覺上是無限延伸的，這裡就照著那個感覺繼續往外鋪
   */
  if (blockX < 0 || blockX >= WORLD_SIZE || blockZ < 0 || blockZ >= WORLD_SIZE) {
    return blockY <= SAND_LEVEL
  }

  return !isPassableBlock(readBlock(worldState, blockX, blockY, blockZ))
}

/**
 * 檢查 AABB 是否與任何實體方塊重疊
 *
 * 玩家 AABB 以腳底中心為原點：
 * - X: [x - halfWidth, x + halfWidth]
 * - Y: [y, y + height]
 * - Z: [z - halfWidth, z + halfWidth]
 */
export function checkOverlap(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
): boolean {
  const halfWidth = PLAYER_WIDTH / 2

  /** 方塊中心在整數座標，實體邊界位於 [coord - 0.5, coord + 0.5]，故加上 0.5 偏移 */
  const minBlockX = Math.floor(positionX - halfWidth + 0.5)
  const maxBlockX = Math.floor(positionX + halfWidth + 0.5 - 0.001)
  const minBlockY = Math.floor(positionY + 0.5)
  const maxBlockY = Math.floor(positionY + PLAYER_HEIGHT + 0.5 - 0.001)
  const minBlockZ = Math.floor(positionZ - halfWidth + 0.5)
  const maxBlockZ = Math.floor(positionZ + halfWidth + 0.5 - 0.001)

  for (let blockX = minBlockX; blockX <= maxBlockX; blockX++) {
    for (let blockY = minBlockY; blockY <= maxBlockY; blockY++) {
      for (let blockZ = minBlockZ; blockZ <= maxBlockZ; blockZ++) {
        if (!isBlockSolid(worldState, blockX, blockY, blockZ))
          continue

        const blockId = readBlock(worldState, blockX, blockY, blockZ)

        /** 細的東西（圍籬柱）只擋住格子中央那一小塊，得先看水平方向有沒有真的撞上 */
        const bounds = getHorizontalBounds(worldState, blockX, blockY, blockZ, blockId)
        if (bounds) {
          const isHorizontalOverlap = positionX + halfWidth > blockX + bounds.minX
            && positionX - halfWidth < blockX + bounds.maxX
            && positionZ + halfWidth > blockZ + bounds.minZ
            && positionZ - halfWidth < blockZ + bounds.maxZ
          if (!isHorizontalOverlap)
            continue
        }

        const collisionHeight = getCollisionHeight(blockId)
        if (collisionHeight >= 1) {
          return true
        }

        /** 半磚只佔下半格，玩家的身體要真的落在那半格裡才算撞到 */
        const blockBottomY = blockY - 0.5
        if (
          positionY < blockBottomY + collisionHeight
          && positionY + PLAYER_HEIGHT > blockBottomY
        ) {
          return true
        }
      }
    }
  }

  return false
}

/** 水平方向的碰撞範圍，相對於方塊中心 */
interface HorizontalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 一根圍籬柱與相鄰方塊算不算連在一起
 *
 * 判定要與渲染器完全一致，否則會出現「看得到橫桿卻穿得過去」，
 * 或反過來「什麼都沒有卻走不過去」
 */
function checkFenceConnected(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
  blockId: BlockId,
): boolean {
  const neighborId = readBlock(worldState, blockX, blockY, blockZ)
  if (neighborId === blockId)
    return true

  return neighborId !== BlockId.AIR
    && !isPassableBlock(neighborId)
    && !isDecorationBlock(neighborId)
}

/**
 * 取得方塊的水平碰撞範圍
 *
 * 一般方塊佔滿整格，回傳 null 代表不必另外判斷。
 * 圍籬則只有中央一根細柱：整格寬的碰撞箱會讓一根孤零零的柱子
 * 像一堵看不見的牆，繞過去要多走一格。
 *
 * 但也不能一律只算細柱——一整排圍籬柱之間會空出縫隙，
 * 玩家有機會擠過去。所以有連到隔壁的那幾側要補滿到格子邊緣，
 * 連成一排時就是一道完整的牆，單獨立著時才是一根細柱
 */
function getHorizontalBounds(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
  blockId: BlockId,
): HorizontalBounds | null {
  const collisionWidth = getCollisionWidth(blockId)
  if (collisionWidth >= 1)
    return null

  const half = collisionWidth / 2
  const bounds: HorizontalBounds = { minX: -half, maxX: half, minZ: -half, maxZ: half }

  if (checkFenceConnected(worldState, blockX - 1, blockY, blockZ, blockId)) {
    bounds.minX = -0.5
  }
  if (checkFenceConnected(worldState, blockX + 1, blockY, blockZ, blockId)) {
    bounds.maxX = 0.5
  }
  if (checkFenceConnected(worldState, blockX, blockY, blockZ - 1, blockId)) {
    bounds.minZ = -0.5
  }
  if (checkFenceConnected(worldState, blockX, blockY, blockZ + 1, blockId)) {
    bounds.maxZ = 0.5
  }

  return bounds
}

/**
 * 玩家身體是否泡在水中
 *
 * 腳與胸口任一處碰到水就算，浮在水面時腳還在水裡，
 * 這樣才踩得到水、也才游得上岸
 */
export function isInWater(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
  matchLiquid: (blockId: BlockId) => boolean = isWaterBlock,
): boolean {
  /**
   * 取身體四個角而不是只看正中央那一柱
   *
   * 瀑布落下的水柱只有三格寬，站在邊緣時身體有一半泡在水裡，
   * 中心點卻落在旁邊的空氣格，判定就會失效，人只能往下掉而浮不上來
   */
  const halfWidth = PLAYER_WIDTH / 2
  const footY = Math.floor(positionY + 0.6)
  const chestY = Math.floor(positionY + 1.4)

  for (const offsetX of [-halfWidth, halfWidth]) {
    for (const offsetZ of [-halfWidth, halfWidth]) {
      const blockX = Math.floor(positionX + offsetX + 0.5)
      const blockZ = Math.floor(positionZ + offsetZ + 0.5)

      if (
        matchLiquid(readBlock(worldState, blockX, footY, blockZ))
        || matchLiquid(readBlock(worldState, blockX, chestY, blockZ))
      ) {
        return true
      }
    }
  }

  return false
}

/** 玩家頭部是否浸在水中 */
export function isHeadInWater(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
  matchLiquid: (blockId: BlockId) => boolean = isWaterBlock,
): boolean {
  const blockX = Math.floor(positionX + 0.5)
  const blockZ = Math.floor(positionZ + 0.5)
  const blockY = Math.floor(positionY + PLAYER_EYE_HEIGHT + 0.5)

  return matchLiquid(readBlock(worldState, blockX, blockY, blockZ))
}

/**
 * 液面往上還要找幾格
 *
 * 只找到眼睛那一格是不夠的：整個人沉在深池底下時，
 * 液面在頭頂好幾格外，找不到就會誤判成剛好貼著液面。
 * 四格足夠——再深的地方早就滿檔了，多找幾格算出來的數字一模一樣
 */
const LIQUID_SURFACE_SEARCH = 4

/**
 * 眼睛沉進液面底下多深（格）
 *
 * isHeadInWater 只回答是與不是，而視野的變化該是連續的：
 * 液面剛碰到眼睛就要開始變，不是等整顆頭泡進去才一次跳完。
 *
 * 回傳零代表眼睛還在液面上，這一格液體與視野無關
 */
export function measureEyeSubmergeDepth(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
  matchLiquid: (blockId: BlockId) => boolean = isWaterBlock,
): number {
  const blockX = Math.floor(positionX + 0.5)
  const blockZ = Math.floor(positionZ + 0.5)
  const eyeY = positionY + PLAYER_EYE_HEIGHT
  const eyeBlockY = Math.floor(eyeY + 0.5)

  if (!matchLiquid(readBlock(worldState, blockX, eyeBlockY, blockZ)))
    return 0

  /** 一路往上找到最後一格液體，液面就是它的頂面 */
  let topBlockY = eyeBlockY
  while (
    topBlockY - eyeBlockY < LIQUID_SURFACE_SEARCH
    && matchLiquid(readBlock(worldState, blockX, topBlockY + 1, blockZ))
  ) {
    topBlockY++
  }

  return Math.max(0, topBlockY + 0.5 - LIQUID_SURFACE_DROP - eyeY)
}

/**
 * 薄地板的頂面相對於方塊中心的高度
 *
 * 睡蓮那片葉子貼在水面上，而水面比方塊頂面矮八分之一格，
 * 腳底就踩在那個高度
 */
const THIN_FLOOR_SURFACE_OFFSET = -0.6

/**
 * 找出這一幀墜落途中會踩到的薄地板高度
 *
 * 只在往下掉時判斷：腳底從 fromY 落到 toY，
 * 中間若掃過某片葉子的表面就停在那裡。
 * 水平移動完全不受影響，游泳時可以直接從葉子底下穿過去
 */
function findThinFloorY(
  worldState: Uint8Array,
  positionX: number,
  positionZ: number,
  fromY: number,
  toY: number,
): number | null {
  const halfWidth = PLAYER_WIDTH / 2
  const minBlockX = Math.floor(positionX - halfWidth + 0.5)
  const maxBlockX = Math.floor(positionX + halfWidth + 0.5 - 0.001)
  const minBlockZ = Math.floor(positionZ - halfWidth + 0.5)
  const maxBlockZ = Math.floor(positionZ + halfWidth + 0.5 - 0.001)
  const minBlockY = Math.floor(toY + 0.5) - 1
  const maxBlockY = Math.floor(fromY + 0.5) + 1

  let highestSurfaceY: number | null = null

  for (let blockX = minBlockX; blockX <= maxBlockX; blockX++) {
    for (let blockZ = minBlockZ; blockZ <= maxBlockZ; blockZ++) {
      for (let blockY = minBlockY; blockY <= maxBlockY; blockY++) {
        if (!isThinFloorBlock(readBlock(worldState, blockX, blockY, blockZ)))
          continue

        const surfaceY = blockY + THIN_FLOOR_SURFACE_OFFSET
        /** 這一幀確實跨過了這片葉子才算踩到 */
        if (surfaceY > fromY + 0.001 || surfaceY < toY)
          continue

        if (highestSurfaceY === null || surfaceY > highestSurfaceY) {
          highestSurfaceY = surfaceY
        }
      }
    }
  }

  return highestSurfaceY
}

/**
 * 自動跨上去的最大高度
 *
 * 只夠跨過半磚與階梯，一整格的方塊仍舊得跳。
 * 沒有這一段的話，村裡的石板路與營火的石緣走到就會被卡住
 */
const STEP_ASSIST_HEIGHT = 0.55

/**
 * 嘗試往前跨一小階
 *
 * 抬高一點再試一次，成功就回傳抬高後的高度
 */
function tryStepUp(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
): number | null {
  const steppedY = positionY + STEP_ASSIST_HEIGHT
  if (checkOverlap(worldState, positionX, steppedY, positionZ))
    return null

  return steppedY
}

/**
 * 分軸碰撞解析（Separate Axis Resolution）
 *
 * 依序處理 X → Y → Z 軸，撞牆時歸零該軸速度，產生滑牆效果。
 * 遇到一格高的方塊不會自動爬上去，想上去就得跳；
 * 半磚這種半格高的東西則會自動跨上去。
 *
 * canStepUp 由呼叫端決定：只有腳踏實地、而且不是正在往上跳的時候才允許跨階。
 * 少了這個條件，跳向一格高的方塊時只要升到剩下不足半格，
 * 跨階判斷就會成立，人會在半空中被推上去，看起來像卡進方塊裡爬上牆
 */
export function resolveCollision(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
  velocityX: number,
  velocityY: number,
  velocityZ: number,
  canStepUp: boolean,
): CollisionResult {
  let resultX = positionX
  let resultY = positionY
  let resultZ = positionZ
  let resultVelocityX = velocityX
  let resultVelocityY = velocityY
  let resultVelocityZ = velocityZ
  let isOnGround = false
  let stepUpHeight = 0

  /** X 軸 */
  const nextX = resultX + velocityX
  if (!checkOverlap(worldState, nextX, resultY, resultZ)) {
    resultX = nextX
  }
  else {
    const steppedY = canStepUp ? tryStepUp(worldState, nextX, resultY, resultZ) : null
    if (steppedY === null) {
      resultVelocityX = 0
    }
    else {
      resultX = nextX
      stepUpHeight += steppedY - resultY
      resultY = steppedY
    }
  }

  /** Y 軸 */
  const nextY = resultY + velocityY
  if (!checkOverlap(worldState, resultX, nextY, resultZ)) {
    const thinFloorY = velocityY < 0
      ? findThinFloorY(worldState, resultX, resultZ, resultY, nextY)
      : null

    if (thinFloorY === null) {
      resultY = nextY
    }
    else {
      resultY = thinFloorY
      resultVelocityY = 0
      isOnGround = true
    }
  }
  else {
    if (velocityY <= 0) {
      isOnGround = true
    }
    resultVelocityY = 0
  }

  /** Z 軸 */
  const nextZ = resultZ + velocityZ
  if (!checkOverlap(worldState, resultX, resultY, nextZ)) {
    resultZ = nextZ
  }
  else {
    const steppedY = canStepUp ? tryStepUp(worldState, resultX, resultY, nextZ) : null
    if (steppedY === null) {
      resultVelocityZ = 0
    }
    else {
      resultZ = nextZ
      stepUpHeight += steppedY - resultY
      resultY = steppedY
    }
  }

  return {
    x: resultX,
    y: resultY,
    z: resultZ,
    velocityX: resultVelocityX,
    velocityY: resultVelocityY,
    velocityZ: resultVelocityZ,
    isOnGround,
    stepUpHeight,
  }
}

export interface StandingPosition {
  x: number;
  y: number;
  z: number;
}

/** 樹冠不算地面，不然傳送會把玩家丟到樹頂上 */
const NON_STANDABLE_SET = new Set<BlockId>([BlockId.OAK_LEAVES, BlockId.PINE_LEAVES])

/** 在單一方塊柱中，由上往下找第一個站得住又不會卡住的高度 */
/**
 * 找出這一柱最低的落腳點
 *
 * 由下往上找，不是由上往下。
 * 由上往下找到的永遠是最高的那個平面——樹冠的頂端、屋頂的斜面、
 * 山的稜線——於是快速前往一按，人就站在樹上或屋頂上，
 * 還得自己想辦法爬下來。
 *
 * 由下往上找到的是地面：樹底下、屋簷下、山腳邊，
 * 那才是「傳送到這座箱庭」該有的落點
 */
function findStandableFootY(worldState: Uint8Array, blockX: number, blockZ: number): number | null {
  for (let blockY = 1; blockY <= WORLD_HEIGHT - 3; blockY++) {
    if (!isBlockSolid(worldState, blockX, blockY, blockZ))
      continue
    if (NON_STANDABLE_SET.has(readBlock(worldState, blockX, blockY, blockZ)))
      continue

    const footY = blockY + 1
    if (!checkOverlap(worldState, blockX, footY, blockZ)) {
      return footY
    }
  }

  return null
}

/**
 * 找一個站得住腳的落點
 *
 * 傳送時直接用地表高度會出事：樹上、屋頂、洞頂都可能把玩家塞進方塊裡。
 * 這裡以目標點為中心一圈一圈往外找，並優先挑沒有泡在水裡的乾地。
 */
export function findSafeStandingPosition(
  worldState: Uint8Array,
  targetX: number,
  targetZ: number,
  maxSearchRadius = 8,
): StandingPosition {
  let wetFallback: StandingPosition | null = null

  for (let radius = 0; radius <= maxSearchRadius; radius++) {
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
        /** 只檢查這一圈的外框，內圈上一輪已經找過了 */
        if (Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== radius)
          continue

        const blockX = Math.round(targetX) + offsetX
        const blockZ = Math.round(targetZ) + offsetZ
        const footY = findStandableFootY(worldState, blockX, blockZ)
        if (footY === null)
          continue

        const position = { x: blockX, y: footY, z: blockZ }
        if (!isInWater(worldState, position.x, position.y, position.z)) {
          return position
        }

        /** 水裡也站得住，但先繼續找乾地，找完整圈都沒有才用它 */
        wetFallback ??= position
      }
    }
  }

  if (wetFallback) {
    return wetFallback
  }

  /** 真的找不到就丟到高空，讓重力把玩家帶回地面 */
  return { x: Math.round(targetX), y: WORLD_HEIGHT - PLAYER_HEIGHT - 1, z: Math.round(targetZ) }
}
