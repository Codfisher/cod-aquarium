import { BlockId, coordinateToIndex, WORLD_SIZE } from '../world/world-constants'

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
}

/**
 * 查詢指定網格座標是否為實體方塊
 */
export function isBlockSolid(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
): boolean {
  if (
    blockX < 0 || blockX >= WORLD_SIZE
    || blockY < 0 || blockY >= WORLD_SIZE
    || blockZ < 0 || blockZ >= WORLD_SIZE
  ) {
    /** 世界邊界外視為實體牆壁 */
    return true
  }

  const index = coordinateToIndex(blockX, blockY, blockZ)
  return worldState[index] !== BlockId.AIR
}

/**
 * 檢查 AABB 是否與任何實體方塊重疊
 *
 * 玩家 AABB 以腳底中心為原點：
 * - X: [x - halfWidth, x + halfWidth]
 * - Y: [y, y + height]
 * - Z: [z - halfWidth, z + halfWidth]
 */
function checkOverlap(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
): boolean {
  const halfWidth = PLAYER_WIDTH / 2

  /**
   * 加上 0.5 偏移，因為方塊中心在整數座標，
   * 實體邊界位於 [coord - 0.5, coord + 0.5]
   */
  const minBlockX = Math.floor(positionX - halfWidth + 0.5)
  const maxBlockX = Math.floor(positionX + halfWidth + 0.5 - 0.001)
  const minBlockY = Math.floor(positionY + 0.5)
  const maxBlockY = Math.floor(positionY + PLAYER_HEIGHT + 0.5 - 0.001)
  const minBlockZ = Math.floor(positionZ - halfWidth + 0.5)
  const maxBlockZ = Math.floor(positionZ + halfWidth + 0.5 - 0.001)

  for (let blockX = minBlockX; blockX <= maxBlockX; blockX++) {
    for (let blockY = minBlockY; blockY <= maxBlockY; blockY++) {
      for (let blockZ = minBlockZ; blockZ <= maxBlockZ; blockZ++) {
        if (isBlockSolid(worldState, blockX, blockY, blockZ)) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * 分軸碰撞解析（Separate Axis Resolution）
 *
 * 依序處理 X → Y → Z 軸：
 * 1. 嘗試沿該軸移動
 * 2. 若移動後與方塊重疊，歸零該軸速度（滑牆效果）
 *
 * @param worldState - 世界資料
 * @param positionX - 目前腳底 X 座標
 * @param positionY - 目前腳底 Y 座標
 * @param positionZ - 目前腳底 Z 座標
 * @param velocityX - 當前 X 速度
 * @param velocityY - 當前 Y 速度
 * @param velocityZ - 當前 Z 速度
 */
export function resolveCollision(
  worldState: Uint8Array,
  positionX: number,
  positionY: number,
  positionZ: number,
  velocityX: number,
  velocityY: number,
  velocityZ: number,
): CollisionResult {
  let resultX = positionX
  let resultY = positionY
  let resultZ = positionZ
  let resultVelocityX = velocityX
  let resultVelocityY = velocityY
  let resultVelocityZ = velocityZ
  let isOnGround = false

  /** X 軸 */
  const nextX = resultX + velocityX
  if (!checkOverlap(worldState, nextX, resultY, resultZ)) {
    resultX = nextX
  }
  else {
    resultVelocityX = 0
  }

  /** Y 軸 */
  const nextY = resultY + velocityY
  if (!checkOverlap(worldState, resultX, nextY, resultZ)) {
    resultY = nextY
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
    resultVelocityZ = 0
  }

  return {
    x: resultX,
    y: resultY,
    z: resultZ,
    velocityX: resultVelocityX,
    velocityY: resultVelocityY,
    velocityZ: resultVelocityZ,
    isOnGround,
  }
}
