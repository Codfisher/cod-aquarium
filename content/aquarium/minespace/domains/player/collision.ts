import { BlockId, getCollisionHeight, isPassableBlock, isThinFloorBlock, isWaterBlock } from '../block/block-constants'
import { ISLAND_CENTER, ISLAND_WALL_RADIUS } from '../world/biome'
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
  if (blockX < 0 || blockX >= WORLD_SIZE || blockZ < 0 || blockZ >= WORLD_SIZE) {
    /** 水平邊界外視為實體牆壁，避免走出世界 */
    return true
  }

  if (blockY < 0 || blockY >= WORLD_HEIGHT) {
    return false
  }

  return !isPassableBlock(readBlock(worldState, blockX, blockY, blockZ))
}

/**
 * 是否游出島嶼範圍
 *
 * 海上看不見的那道牆，免得玩家一路游進沒有東西的外海
 */
export function isOutsideIslandWall(positionX: number, positionZ: number): boolean {
  return Math.hypot(positionX - ISLAND_CENTER.x, positionZ - ISLAND_CENTER.z) > ISLAND_WALL_RADIUS
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
  if (isOutsideIslandWall(positionX, positionZ)) {
    return true
  }

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

        const collisionHeight = getCollisionHeight(readBlock(worldState, blockX, blockY, blockZ))
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
        isWaterBlock(readBlock(worldState, blockX, footY, blockZ))
        || isWaterBlock(readBlock(worldState, blockX, chestY, blockZ))
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
): boolean {
  const blockX = Math.floor(positionX + 0.5)
  const blockZ = Math.floor(positionZ + 0.5)
  const blockY = Math.floor(positionY + PLAYER_EYE_HEIGHT + 0.5)

  return isWaterBlock(readBlock(worldState, blockX, blockY, blockZ))
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
function findStandableFootY(worldState: Uint8Array, blockX: number, blockZ: number): number | null {
  for (let blockY = WORLD_HEIGHT - 3; blockY >= 1; blockY--) {
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
