import { BlockId } from '../block/block-constants'
import { getBlock, setBlock } from '../world/world-access'
import { WORLD_SIZE } from '../world/world-constants'

/**
 * 陸地大場景共用的地形小工具
 *
 * 只有地形 worker 用。風露苑、鳴禽庭、蟬時雨這幾座小箱庭的大場景都是一片陸地：
 * 中間走得到的那一塊、外圍一圈越來越高的地形擋住視線，再往外換成不畫的 LAKE_BED。
 * 每一格柱怎麼填、小徑怎麼彎、樹冠裡看不到的葉子怎麼拿掉，幾座都一樣，寫在這裡
 */

export interface PlanePoint {
  x: number;
  z: number;
}

/** 兩點的水平距離 */
export function measureDistance(x: number, z: number, point: PlanePoint): number {
  return Math.hypot(x - point.x, z - point.z)
}

/**
 * 沿著骨架取點（Catmull-Rom）
 *
 * 兩端各複製一次端點，曲線才會真的穿過第一個與最後一個骨架點。
 * 每段十來格取二十點，相鄰兩點不到一格，量距離時不會漏格
 */
export function samplePathCurve(controlPointList: readonly PlanePoint[], samplePerSegment = 20): PlanePoint[] {
  const first = controlPointList[0]!
  const last = controlPointList.at(-1)!
  const extendedList = [first, ...controlPointList, last]
  const sampleList: PlanePoint[] = []

  for (let index = 1; index < extendedList.length - 2; index++) {
    const previous = extendedList[index - 1]!
    const from = extendedList[index]!
    const to = extendedList[index + 1]!
    const next = extendedList[index + 2]!

    for (let step = 0; step < samplePerSegment; step++) {
      const ratio = step / samplePerSegment
      const ratio2 = ratio * ratio
      const ratio3 = ratio2 * ratio
      const blend = (a: number, b: number, c: number, d: number) => 0.5 * (
        2 * b
        + (-a + c) * ratio
        + (2 * a - 5 * b + 4 * c - d) * ratio2
        + (-a + 3 * b - 3 * c + d) * ratio3
      )
      sampleList.push({
        x: blend(previous.x, from.x, to.x, next.x),
        z: blend(previous.z, from.z, to.z, next.z),
      })
    }
  }
  sampleList.push({ ...last })
  return sampleList
}

/**
 * 每一格離小徑中心線多遠
 *
 * 整片先算一次存起來，種樹、撒花草、隆起地面都要問。
 * 只算小徑附近 reach 格內，其餘當成很遠
 */
export function createPathDistanceMap(pointListList: readonly (readonly PlanePoint[])[], reach = 7): Float32Array {
  const distanceMap = new Float32Array(WORLD_SIZE * WORLD_SIZE).fill(Number.POSITIVE_INFINITY)
  for (const pointList of pointListList) {
    for (const point of pointList) {
      for (let x = Math.max(0, Math.floor(point.x - reach)); x <= Math.min(WORLD_SIZE - 1, Math.ceil(point.x + reach)); x++) {
        for (let z = Math.max(0, Math.floor(point.z - reach)); z <= Math.min(WORLD_SIZE - 1, Math.ceil(point.z + reach)); z++) {
          const index = x * WORLD_SIZE + z
          distanceMap[index] = Math.min(distanceMap[index]!, Math.hypot(x - point.x, z - point.z))
        }
      }
    }
  }
  return distanceMap
}

/**
 * 填一格柱的地面：底下是石，最上面兩格土，頂面是 topBlock
 *
 * 第零層的基岩由呼叫端整片鋪
 */
export function fillGroundColumn(state: Uint8Array, x: number, z: number, topY: number, topBlock: BlockId): void {
  for (let y = 1; y < topY - 2; y++) {
    setBlock(state, x, y, z, BlockId.STONE)
  }
  for (let y = Math.max(1, topY - 2); y < topY; y++) {
    setBlock(state, x, y, z, BlockId.DIRT)
  }
  setBlock(state, x, topY, z, topBlock)
}

/**
 * 走不到、也看不到的外圍：碰撞照算、不畫，由布景的地面平面代替
 *
 * 頂面那一格是 LAKE_BED（見 RealmBackdrop 的 floor），底下照樣填石，
 * 萬一有人卡出去也不會掉進虛空
 */
export function fillHiddenColumn(state: Uint8Array, x: number, z: number, topY: number): void {
  for (let y = 1; y < topY; y++) {
    setBlock(state, x, y, z, BlockId.STONE)
  }
  setBlock(state, x, topY, z, BlockId.LAKE_BED)
}

/**
 * 拿掉樹冠裡看不到的葉子
 *
 * 樹葉是鏤空的方塊，每一格都整顆畫，不被相鄰的樹葉剔除，還要進兩層陰影與深度圖。
 * 上下前後左右六面都貼著樹冠方塊（葉子或樹幹）的那些格子從外面幾乎看不到，
 * 拿掉之後樹冠外觀不變。先整片判斷完再一起拿，免得拿掉一格之後旁邊那格的判斷跟著變。
 * 回傳拿掉幾格，量測用
 */
export function hollowEnclosedLeafList(
  state: Uint8Array,
  leafSet: ReadonlySet<BlockId>,
  crownSet: ReadonlySet<BlockId>,
  minY: number,
  maxY: number,
): number {
  const enclosedList: (PlanePoint & { y: number })[] = []
  const isCrown = (x: number, y: number, z: number) => crownSet.has(getBlock(state, x, y, z))

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      for (let y = minY; y <= maxY; y++) {
        if (!leafSet.has(getBlock(state, x, y, z)))
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
  return enclosedList.length
}

/**
 * 只在空氣的格子上種一株，回傳有沒有種下去
 *
 * 地面那一格要是 groundSet 裡的方塊：沙上不長花、石板上不長草
 */
export function plantOnGround(
  state: Uint8Array,
  x: number,
  groundY: number,
  z: number,
  blockId: BlockId,
  groundSet: ReadonlySet<BlockId>,
): boolean {
  if (!groundSet.has(getBlock(state, x, groundY - 1, z)) || getBlock(state, x, groundY, z) !== BlockId.AIR)
    return false
  setBlock(state, x, groundY, z, blockId)
  return true
}
