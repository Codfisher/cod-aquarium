import type { DriftSteps } from './drift-job'
import type { DriftPolyline } from './drift-path'
import { PATH_SAMPLE_SPACING, smoothHeightList } from './drift-path'
import { isSolidAt } from './drift-solid'
import { itemAt } from './drift-util'

/**
 * 神遊的低飛（glide）
 *
 * 無人機升到樹冠之上，在霧濃或樹冠密的場景（聽雨森林、濕地、吹雪野、林海）只看得到一片白或一片樹頂。
 * 低飛不升空：沿著一條走得通的路線，鏡頭比走路的視線高幾格、速度比散步快一些，
 * 從樹冠下、林間空隙與水面上滑過去，看的是樹幹、溪面與腳邊的東西。
 *
 * 做法是在散步路徑上「把腳底墊高」：路徑本身是尋路驗證過的（腳下站得住、頭上三格是空的），
 * 這裡沿路量每一點頭頂實際有多少空間，能墊多高就墊多高（不超過想要的高度），
 * 頭頂有樹枝、屋簷、洞頂的地方自動壓低；墊高的量沿路的變化有坡度上限，再平滑一次，頭尾各用一段緩坡接回地面，
 * 所以與散步無縫銜接，也不需要露天的起降點（密林裡一個露天的停留點都沒有也能低飛）
 */

/** 預設比走路的視線高多少格（範圍），沿路在兩者之間慢慢起伏 */
export const GLIDE_LIFT_RANGE: readonly [number, number] = [1.5, 3.5]
/** 低飛的速度是散步的幾倍（散步每秒一格，低飛一點七格；無人機是二點五格） */
export const GLIDE_SPEED_SCALE = 1.7
/** 整條路平均墊不到這麼高（格）就不值得低飛：頭頂一路都是矮枝，只是貼地快走 */
export const GLIDE_LIFT_MEAN_MIN = 0.8
/**
 * 頭頂離障礙留多少格
 *
 * 留得比看起來需要的多：墊高的量最後要平滑（不然高度有折角，鏡頭的垂直加速度會跳一下），
 * 平滑會在矮的地方把高度往上帶一點（坡度零點三、半徑兩格半，最多約半格），這一格的餘裕扣掉它還剩半格
 */
const HEAD_MARGIN = 1
/** 身體半寬：頭頂的空間除了正上方，四個角落碰到的格柱也要量 */
const BODY_HALF_WIDTH = 0.35
/** 墊高的量沿路每走一格最多變多少（坡度上限）、平滑的半徑（取樣點數） */
const LIFT_SLOPE = 0.3
const LIFT_SMOOTH_RADIUS = 5
/** 障礙往路的前後各多算幾個取樣點（水平方向的餘裕，一格半） */
const LIFT_SPREAD = 3
/** 頭尾接回地面的緩坡長度（格） */
const RAMP_LENGTH = 8
/** 墊高的起伏週期（格） */
const LIFT_WAVE_LENGTH = 70
/** 每量幾個取樣點讓出一次（一個點最多五柱、每柱往上掃幾格） */
const SCAN_YIELD_INTERVAL = 24
const CORNER_OFFSET_LIST: readonly (readonly [number, number])[] = [[0, 0], [-BODY_HALF_WIDTH, -BODY_HALF_WIDTH], [-BODY_HALF_WIDTH, BODY_HALF_WIDTH], [BODY_HALF_WIDTH, -BODY_HALF_WIDTH], [BODY_HALF_WIDTH, BODY_HALF_WIDTH]]

function smoothstep(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio))
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * 這一點的頭頂有多少空間：從視線高度往上掃到第一個擋路的方塊，回傳它的底面比腳底高多少格
 *
 * 「擋路」與構圖射線同一張表（drift-solid）：樹葉、樹幹、岩石都算，蘆葦、草、藤這些穿得過去的不算
 * （濕地的蘆葦長到視線高度，算進去的話整片濕地都墊不起來）；掃到 reach 格都沒有就回 reach
 */
function measureHeadroom(worldState: Uint8Array, x: number, z: number, footY: number, eyeHeight: number, reach: number): number {
  let headroom = reach
  for (const [offsetX, offsetZ] of CORNER_OFFSET_LIST) {
    const blockX = Math.round(x + offsetX)
    const blockZ = Math.round(z + offsetZ)
    /** 方塊的索引是它中心的高度：索引 n 占 n − 0.5 到 n + 0.5 */
    const startY = Math.floor(footY + eyeHeight + 0.5)
    for (let blockY = startY; blockY - 0.5 - footY < headroom; blockY++) {
      if (isSolidAt(worldState, blockX, blockY, blockZ)) {
        headroom = Math.min(headroom, blockY - 0.5 - footY)
        break
      }
    }
  }
  return headroom
}

/**
 * 把一條散步路徑墊高成低飛的路徑：回傳每個取樣點墊高之後的「腳底高度」（交給 createWalkTrack，鏡頭高度是它加眼睛高度）
 *
 * 平均墊不到 GLIDE_LIFT_MEAN_MIN 就回 null，呼叫端照平常散步
 */
export function* buildGlideFootListSteps(
  worldState: Uint8Array,
  polyline: DriftPolyline,
  eyeHeight: number,
  liftRange: readonly [number, number] = GLIDE_LIFT_RANGE,
): DriftSteps<number[] | null> {
  const count = polyline.xList.length
  if (count < 2)
    return null

  /** 每一點頭頂容許墊多高，夾在零與想要的高度之間；想要的高度沿路慢慢起伏 */
  const phase = Math.random() * Math.PI * 2
  const reach = eyeHeight + liftRange[1] + HEAD_MARGIN
  const roomList: number[] = []
  for (let index = 0; index < count; index++) {
    if (index % SCAN_YIELD_INTERVAL === SCAN_YIELD_INTERVAL - 1)
      yield

    const wave = 0.5 + 0.5 * Math.sin(((index * PATH_SAMPLE_SPACING) / LIFT_WAVE_LENGTH) * Math.PI * 2 + phase)
    const goal = liftRange[0] + (liftRange[1] - liftRange[0]) * wave
    const headroom = measureHeadroom(worldState, itemAt(polyline.xList, index), itemAt(polyline.zList, index), itemAt(polyline.footYList, index), eyeHeight, reach)
    roomList.push(Math.min(goal, Math.max(0, headroom - eyeHeight - HEAD_MARGIN)))
  }
  yield

  /** 障礙往前後各擴幾個取樣點（水平的餘裕），頭尾用緩坡收到零 */
  const limitList = roomList.map((_, index) => {
    let lowest = Number.POSITIVE_INFINITY
    for (let offset = -LIFT_SPREAD; offset <= LIFT_SPREAD; offset++)
      lowest = Math.min(lowest, roomList[index + offset] ?? Number.POSITIVE_INFINITY)
    const fromStart = index * PATH_SAMPLE_SPACING
    const toEnd = (count - 1 - index) * PATH_SAMPLE_SPACING
    return lowest * smoothstep(fromStart / RAMP_LENGTH) * smoothstep(toEnd / RAMP_LENGTH)
  })

  /** 坡度上限：來回各掃一遍，矮的地方往兩側放出斜坡，鏡頭在遠處就開始壓低，不是到了樹枝前才猛降 */
  const slopeStep = LIFT_SLOPE * PATH_SAMPLE_SPACING
  const coneList = limitList.slice()
  for (let index = 1; index < count; index++)
    coneList[index] = Math.min(itemAt(coneList, index), itemAt(coneList, index - 1) + slopeStep)
  for (let index = count - 2; index >= 0; index--)
    coneList[index] = Math.min(itemAt(coneList, index), itemAt(coneList, index + 1) + slopeStep)
  yield

  /**
   * 平滑兩次，折角全部磨圓（高度的變化率連續，鏡頭上下沒有頓點）
   *
   * 不再與容許的高度取較低的——那會把折角放回來（實測垂直加速度尖峰一點六格／秒平方，別處不到零點五）；
   * 平滑在矮處多出來的那一點高度由 HEAD_MARGIN 吸收
   */
  const liftList = smoothHeightList(coneList, LIFT_SMOOTH_RADIUS, 2)
  liftList[0] = 0
  liftList[count - 1] = 0

  const mean = liftList.reduce((sum, lift) => sum + lift, 0) / count
  if (mean < GLIDE_LIFT_MEAN_MIN)
    return null

  return polyline.footYList.map((footY, index) => footY + itemAt(liftList, index))
}
