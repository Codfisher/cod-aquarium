import type { BlockId } from '../block/block-constants'
import { isWaterBlock, LIQUID_SURFACE_DROP } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/**
 * 沒有水的格柱記成這個高度
 *
 * 用零不行：世界的最底層本來就在零附近，那會讓「沒有水」
 * 與「水面在地板高度」變成同一件事。負數不可能是任何一格的水面
 */
const NO_WATER = -1

/**
 * 相鄰兩格算不算同一片水
 *
 * 水面是齊平的，同一片水的相鄰格柱高度應該完全相同。
 * 留半格的容差是為了瀑布與河道的落差處——那裡一格一格往下掉，
 * 但它確實是同一條水
 */
const SAME_BODY_TOLERANCE = 0.6

/** 幾格以下的水不成一片，水缽與滴水都在這個量級 */
const MIN_BODY_COLUMN_COUNT = 8

export interface WaterBody {
  centerX: number;
  centerZ: number;
  /** 從中心量到最遠那一格的距離 */
  radius: number;
  /** 水面的世界高度 */
  surfaceY: number;
  columnCount: number;
}

export interface WaterMap {
  /** 每一格柱最上層的水面高度，沒有水是 {@link NO_WATER} */
  levelList: Float32Array;
  /** 連在一起的水各自成一片，由大到小 */
  bodyList: WaterBody[];
}

function toColumnIndex(x: number, z: number): number {
  return x * WORLD_SIZE + z
}

/**
 * 一份沒有水的地圖
 *
 * 與 createWorldState 同一個用途：世界還沒生成之前先有個東西可以指著，
 * 免得每一個讀者都要處理「還沒掃過」這個狀態。
 * 掃過之後整份會被換掉
 */
export function createEmptyWaterMap(): WaterMap {
  return {
    levelList: new Float32Array(WORLD_SIZE * WORLD_SIZE).fill(NO_WATER),
    bodyList: [],
  }
}

/**
 * 世界上的水長什麼樣子
 *
 * 掃一次就好，地形生成之後不再變動。
 *
 * ── 為什麼要有這份資料 ──
 *
 * 兩個效果需要它，而它們各自去問世界都太貴。
 *
 * 漣漪要知道「這個落點是不是水面」：雨每一幀打下幾十滴，
 * 逐滴掃一整根格柱是四十次讀取，改成查表是一次。
 *
 * 焦散要知道「這一帶的水面在多高、範圍多大」。這件事沒辦法逐片元問世界，
 * 所以走的是另一條路：先在這裡把連在一起的水歸成一片一片，
 * 著色器每一幀只收到離玩家最近的那一片的中心、半徑與高度
 *
 * ── 為什麼要分片而不是只存高度 ──
 *
 * 只有高度的話，焦散會出現在「任何低於某個高度的地方」——
 * 包括水池隔壁那條乾的石階，只要它比水面矮。
 * 分片之後才問得出「這個點在不在那片水底下」
 */
export function scanWaterMap(worldState: Uint8Array): WaterMap {
  const levelList = new Float32Array(WORLD_SIZE * WORLD_SIZE).fill(NO_WATER)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      /**
       * 直接沿著格柱走索引，不逐格呼叫 getBlock
       *
       * 這個迴圈要走三百多萬次。getBlock 每次都要做一遍範圍檢查
       * 與三個乘法，而這裡的座標本來就保證在世界內、
       * 同一根格柱的相鄰兩格在陣列上又剛好差一個世界寬度。
       * 一根格柱只算一次基底，往上加就是了
       */
      const columnBase = coordinateToIndex(x, 0, z)

      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        if (!isWaterBlock(worldState[columnBase + y * WORLD_SIZE] as BlockId))
          continue

        /** 最上層那一格的水面比方塊頂面矮八分之一格，與算繪那邊同一個數字 */
        levelList[toColumnIndex(x, z)] = y + 0.5 - LIQUID_SURFACE_DROP
        break
      }
    }
  }

  return { levelList, bodyList: collectBodyList(levelList) }
}

/**
 * 把連在一起的水歸成一片
 *
 * 廣度優先走訪，四方相鄰且水面高度接近的算同一片。
 * 用陣列當佇列而不是遞迴：蛙聲澤那片水有上千格，
 * 遞迴會把呼叫堆疊塞爆
 */
function collectBodyList(levelList: Float32Array): WaterBody[] {
  const visitedList = new Uint8Array(levelList.length)
  const bodyList: WaterBody[] = []
  const queue: number[] = []

  for (let startIndex = 0; startIndex < levelList.length; startIndex++) {
    if (visitedList[startIndex] || levelList[startIndex] === NO_WATER)
      continue

    visitedList[startIndex] = 1
    queue.length = 0
    queue.push(startIndex)

    let sumX = 0
    let sumZ = 0
    let sumY = 0
    const columnList: number[] = []

    /** 用索引往前走而不是 shift，後者在上千格的水池上是平方級的搬移 */
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!
      const level = levelList[index]!
      const x = Math.floor(index / WORLD_SIZE)
      const z = index % WORLD_SIZE

      columnList.push(index)
      sumX += x
      sumZ += z
      sumY += level

      const neighborList = [
        x > 0 ? toColumnIndex(x - 1, z) : -1,
        x < WORLD_SIZE - 1 ? toColumnIndex(x + 1, z) : -1,
        z > 0 ? toColumnIndex(x, z - 1) : -1,
        z < WORLD_SIZE - 1 ? toColumnIndex(x, z + 1) : -1,
      ]

      for (const neighbor of neighborList) {
        if (neighbor < 0 || visitedList[neighbor])
          continue

        const neighborLevel = levelList[neighbor]!
        if (neighborLevel === NO_WATER || Math.abs(neighborLevel - level) > SAME_BODY_TOLERANCE)
          continue

        visitedList[neighbor] = 1
        queue.push(neighbor)
      }
    }

    if (columnList.length < MIN_BODY_COLUMN_COUNT)
      continue

    const centerX = sumX / columnList.length
    const centerZ = sumZ / columnList.length

    let radius = 0
    for (const index of columnList) {
      const x = Math.floor(index / WORLD_SIZE)
      const z = index % WORLD_SIZE
      radius = Math.max(radius, Math.hypot(x - centerX, z - centerZ))
    }

    bodyList.push({
      centerX,
      centerZ,
      radius,
      surfaceY: sumY / columnList.length,
      columnCount: columnList.length,
    })
  }

  return bodyList.sort((left, right) => right.columnCount - left.columnCount)
}

/**
 * 這個座標的水面在多高，沒有水回傳 null
 *
 * 吃的是世界座標而不是格子索引，呼叫者拿到的多半是粒子或玩家的位置
 */
export function getWaterLevel(waterMap: WaterMap, x: number, z: number): number | null {
  const blockX = Math.floor(x + 0.5)
  const blockZ = Math.floor(z + 0.5)
  if (blockX < 0 || blockX >= WORLD_SIZE || blockZ < 0 || blockZ >= WORLD_SIZE)
    return null

  const level = waterMap.levelList[toColumnIndex(blockX, blockZ)]!

  return level === NO_WATER ? null : level
}

/**
 * 離這個座標最近的那一片水
 *
 * 量的是到中心的距離減掉半徑，也就是「離岸邊多遠」——
 * 用中心距離的話，站在蛙聲澤的岸上會挑到遠處某個小水窪，
 * 因為那個水窪的中心比這片大湖的中心更近
 */
export function findNearestWaterBody(
  waterMap: WaterMap,
  x: number,
  z: number,
  maxDistance: number,
): WaterBody | null {
  let nearest: WaterBody | null = null
  let nearestDistance = maxDistance

  for (const body of waterMap.bodyList) {
    const distance = Math.hypot(x - body.centerX, z - body.centerZ) - body.radius
    if (distance >= nearestDistance)
      continue

    nearestDistance = distance
    nearest = body
  }

  return nearest
}
