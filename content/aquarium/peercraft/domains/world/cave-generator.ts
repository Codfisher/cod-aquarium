import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 隧道生成參數 */
const TUNNEL_COUNT = 24 // 隧道數量
const TUNNEL_STEPS = Math.floor(WORLD_HEIGHT * 1.25) // 80 -> 1.25 * 64
const TUNNEL_RADIUS = 3 // 基礎挖掘半徑
const HALL_RADIUS = 5 // 大廳挖掘半徑
const HALL_CHANCE = 0.08 // 每步變成大廳的機率
const HALL_DURATION = 8 // 大廳持續步數
const TURN_RATE = 0.3 // 方向轉彎幅度（弧度）
const STEP_SIZE = 2 // 每步前進距離

/**
 * 在指定位置挖掘球形空間
 */
function carvesphere(state: Uint8Array, cx: number, cy: number, cz: number, radius: number, maxY: number): void {
  const r = Math.ceil(radius)
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy + dz * dz > radius * radius)
          continue

        const bx = Math.floor(cx + dx)
        const by = Math.floor(cy + dy)
        const bz = Math.floor(cz + dz)

        if (bx < 0 || bx >= WORLD_SIZE || bz < 0 || bz >= WORLD_SIZE)
          continue
        if (by < 1 || by >= maxY) // 保留 y=0 基岩
          continue

        const index = coordinateToIndex(bx, by, bz)
        if (state[index] !== BlockId.AIR && state[index] !== BlockId.BEDROCK)
          state[index] = BlockId.AIR
      }
    }
  }
}

/**
 * 生成一條隨機隧道
 *
 * 從隨機地下位置出發，沿水平偏向的隨機方向前進，
 * 每步挖掘球形截面，偶爾擴大為大廳
 */
function carveTunnel(state: Uint8Array, heightMap: Uint8Array): void {
  // 隨機起始位置（地下）
  let x = 4 + Math.random() * (WORLD_SIZE - 8)
  let z = 4 + Math.random() * (WORLD_SIZE - 8)
  const surfaceY = heightMap[Math.floor(x) * WORLD_SIZE + Math.floor(z)]!
  let y = 2 + Math.random() * Math.max(1, surfaceY - 10)

  // 隨機水平方向（弧度）
  let angle = Math.random() * Math.PI * 2
  // 垂直傾斜角（偏水平）
  let pitch = (Math.random() - 0.5) * 0.3

  let hallRemaining = 0

  for (let step = 0; step < TUNNEL_STEPS; step++) {
    // 計算此位置的地殼保護上限
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    if (ix < 0 || ix >= WORLD_SIZE || iz < 0 || iz >= WORLD_SIZE)
      break

    const localSurface = heightMap[ix * WORLD_SIZE + iz]!
    const maxY = Math.min(localSurface - 3, WORLD_HEIGHT - 4)

    // 決定是否進入大廳
    if (hallRemaining <= 0 && Math.random() < HALL_CHANCE)
      hallRemaining = HALL_DURATION

    const radius = hallRemaining > 0 ? HALL_RADIUS : TUNNEL_RADIUS
    if (hallRemaining > 0)
      hallRemaining--

    // 挖掘
    carvesphere(state, x, y, z, radius, maxY)

    // 前進
    const dx = Math.cos(angle) * Math.cos(pitch) * STEP_SIZE
    const dy = Math.sin(pitch) * STEP_SIZE
    const dz = Math.sin(angle) * Math.cos(pitch) * STEP_SIZE

    x += dx
    z += dz
    y += dy

    // 隨機轉向
    angle += (Math.random() - 0.5) * TURN_RATE * 2
    pitch += (Math.random() - 0.5) * TURN_RATE
    // 限制垂直角度，保持偏水平
    pitch = Math.max(-0.4, Math.min(0.4, pitch))
    // 限制 Y 範圍
    y = Math.max(3, Math.min(y, maxY - 2))
  }
}

/**
 * 地板平坦化 — 填平孤立凹坑
 */
function flattenFloors(state: Uint8Array, heightMap: Uint8Array): void {
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const surfaceHeight = heightMap[x * WORLD_SIZE + z]!
      const maxY = Math.min(surfaceHeight - 3, WORLD_HEIGHT - 4)

      for (let y = 2; y < maxY; y++) {
        const index = coordinateToIndex(x, y, z)
        if (state[index] !== BlockId.AIR)
          continue

        const above = state[coordinateToIndex(x, y + 1, z)]
        const below = state[coordinateToIndex(x, y - 1, z)]

        if (above !== BlockId.AIR || below === BlockId.AIR)
          continue

        let solidNeighbors = 0
        if (state[coordinateToIndex(x - 1, y, z)] !== BlockId.AIR)
          solidNeighbors++
        if (state[coordinateToIndex(x + 1, y, z)] !== BlockId.AIR)
          solidNeighbors++
        if (state[coordinateToIndex(x, y, z - 1)] !== BlockId.AIR)
          solidNeighbors++
        if (state[coordinateToIndex(x, y, z + 1)] !== BlockId.AIR)
          solidNeighbors++

        if (solidNeighbors >= 3)
          state[index] = BlockId.STONE
      }
    }
  }
}

/**
 * 完整洞穴生成管線
 *
 * 依序執行：
 * 1. 隨機蟲洞隧道挖掘（含大廳擴張）
 * 2. 地板平坦化（填平孤立凹坑）
 */
export function generateCaves(state: Uint8Array, heightMap: Uint8Array): void {
  for (let i = 0; i < TUNNEL_COUNT; i++)
    carveTunnel(state, heightMap)

  flattenFloors(state, heightMap)
}
