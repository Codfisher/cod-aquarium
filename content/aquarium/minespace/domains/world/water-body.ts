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

/**
 * 編碼水面高度時除以這個數
 *
 * 世界只有四十格高，除以六十四之後一定落在 0 到 1 之間，
 * 而六十四是二的冪，除下去不會有浮點數的零頭
 */
export const WATER_LEVEL_ENCODE_RANGE = 64

/**
 * 離岸距離量到幾格為止
 *
 * 超過這個距離就一律當成「外海」。湧浪的相位吃這個數字，
 * 而整座潮汐磯的水從岸線到外緣也只有十來格，三十二格綽綽有餘。
 * 存成一個位元組，一階是八分之一格——遠小於一個波長，相位不會跳
 */
export const SHORE_DISTANCE_MAX = 32

/**
 * 每一格水離岸邊有多遠
 *
 * ── 為什麼需要它 ──
 *
 * 湧浪原本的相位是「離箱庭中心多少 Z」，也就是一條直線。
 * 真正的浪不是那樣：波進到淺水會變慢（淺水波速約為 √(gh)），
 * 同一道浪頭上先碰到淺水的那一段先慢下來，整條浪頭於是被拗彎，
 * 愈接近岸邊愈貼合岸的形狀——這叫折射，也是為什麼不管湧浪從哪個方向來，
 * 拍上沙灘時永遠幾乎與海岸平行，還會繞著岬角包過去。
 *
 * 要重現這件事，最省事的作法不是去解波速，而是換一個相位座標：
 * 把「離岸多遠」當成相位，浪頭就是這個距離場的等值線。
 * 等值線本來就與岸平行、本來就會繞過岬角——折射的結果自己長出來，
 * 一個 sin 都不必多算。
 *
 * ── 怎麼算 ──
 *
 * 兩趟的 chamfer 距離轉換，不是廣度優先。
 *
 * 廣度優先只走四方向，量出來是曼哈頓距離，等值線是四十五度的菱形——
 * 浪頭會照著菱形的稜線折，看起來像折紙不像浪。
 * 而且距離只有整數，一格差一整格；波長才五格，
 * 一整個波長只有五個離散的階，浪不會前進，只會一塊一塊地跳。
 *
 * chamfer 走八方向，斜角的權重給根號二，逼近的是歐氏距離，
 * 等值線是圓的；而且它會算出小數，相位才連續得起來
 */
export function createShoreDistanceList(waterMap: WaterMap): Float32Array {
  const distanceList = new Float32Array(WORLD_SIZE * WORLD_SIZE)
  const diagonal = Math.SQRT2

  /** 陸地是零，水先給一個大得不可能的值，兩趟掃描再把它壓下來 */
  for (let index = 0; index < distanceList.length; index++) {
    distanceList[index] = waterMap.levelList[index] === NO_WATER ? 0 : Number.POSITIVE_INFINITY
  }

  const relax = (index: number, fromIndex: number, weight: number) => {
    const candidate = distanceList[fromIndex]! + weight
    if (candidate < distanceList[index]!) {
      distanceList[index] = candidate
    }
  }

  /** 往前掃：只看左邊與上面那幾格 */
  for (let x = 1; x < WORLD_SIZE; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const index = toColumnIndex(x, z)
      if (distanceList[index] === 0)
        continue

      relax(index, toColumnIndex(x - 1, z), 1)
      relax(index, toColumnIndex(x, z - 1), 1)
      relax(index, toColumnIndex(x - 1, z - 1), diagonal)
      relax(index, toColumnIndex(x - 1, z + 1), diagonal)
    }
  }

  /** 往回掃：補上右邊與下面那幾格 */
  for (let x = WORLD_SIZE - 2; x >= 0; x--) {
    for (let z = WORLD_SIZE - 2; z >= 1; z--) {
      const index = toColumnIndex(x, z)
      if (distanceList[index] === 0)
        continue

      relax(index, toColumnIndex(x + 1, z), 1)
      relax(index, toColumnIndex(x, z + 1), 1)
      relax(index, toColumnIndex(x + 1, z + 1), diagonal)
      relax(index, toColumnIndex(x + 1, z - 1), diagonal)
    }
  }

  return distanceList
}

/**
 * 把水面地圖烘成一張貼圖
 *
 * ── 為什麼需要它 ──
 *
 * 焦散原本問的是「我在不在最近那片水的圓圈裡，而且比水面矮」。
 * 圓圈是拿中心加最遠一格的距離框出來的，遇到形狀規矩的池子還好，
 * 遇到蛙聲澤那種散在整片箱庭上的淺水就整個失準：
 * 圓圈的半徑會長到二十格，把箱庭連同它外圈那道台壁一起框進去，
 * 於是台壁上凡是比水面矮的地方全都亮起了水底才有的網。
 *
 * 一張圖就沒有這個問題。每一格柱存自己的水面高度，
 * 著色器查一次就知道「我頭頂上到底有沒有水」——
 * 那才是這個問題本來的樣子，圓圈只是它的近似。
 *
 * ── 編碼 ──
 *
 * 高度用兩個通道存十六位元。只用一個通道的話一階是四分之一格，
 * 而焦散的深度門檻本身只有 0.05 格，那個精度會讓岸邊一階一階地跳。
 *
 * 藍色通道存「這裡有沒有水」。用高度是零來代表沒有水不行，
 * 世界的最底層本來就在零附近。
 *
 * 離岸距離不放在這張，它必須雙線性內插而這張必須最近鄰，
 * 兩者不能共存（見 water-map-texture 的 getShoreDistanceTexture）
 */
export function createWaterLevelTextureData(waterMap: WaterMap): Uint8Array {
  const data = new Uint8Array(WORLD_SIZE * WORLD_SIZE * 4)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const columnIndex = toColumnIndex(x, z)
      const level = waterMap.levelList[columnIndex]!
      if (level === NO_WATER)
        continue

      /**
       * 貼圖是逐列存的，而格柱索引是逐行存的
       *
       * 這兩個順序不一樣。搞反的話整張圖會沿著對角線鏡射，
       * 而鏡射過的水面地圖看起來仍然「有水」，只是水在錯的地方——
       * 那種錯很難從畫面上看出來
       */
      const texel = (z * WORLD_SIZE + x) * 4
      const encoded = Math.round(
        Math.min(1, Math.max(0, level / WATER_LEVEL_ENCODE_RANGE)) * 65535,
      )

      data[texel] = encoded >> 8
      data[texel + 1] = encoded & 255
      data[texel + 2] = 255
      data[texel + 3] = 255
    }
  }

  return data
}

/** 全世界最高的那一片水面，著色器拿它當「這個片元不必查圖」的早退門檻 */
export function getMaxWaterLevel(waterMap: WaterMap): number {
  let maxLevel = NO_WATER

  for (const level of waterMap.levelList) {
    if (level > maxLevel) {
      maxLevel = level
    }
  }

  return maxLevel === NO_WATER ? 0 : maxLevel
}
