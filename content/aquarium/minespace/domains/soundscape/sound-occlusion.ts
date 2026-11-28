import { BlockId, isPassableBlock } from '../block/block-constants'
import { readBlock } from '../player/collision'

/**
 * 聲音被地形擋掉多少
 *
 * 從音景管理器抽出來的純函式：只讀方塊陣列，不碰音訊引擎，
 * 量測腳本與測試可以拿同一條算式去算「站在這裡聽不聽得到」
 */

/** 遮蔽取樣的間隔（格），太密只是白算 */
const OCCLUSION_SAMPLE_STEP = 0.8
/** 一段路最多取幾個樣本，再長就拉大間隔 */
const OCCLUSION_SAMPLE_MAX = 64
/** 中間隔了幾格實心方塊就算完全被擋住 */
const OCCLUSION_FULL_THICKNESS = 7
/** 完全被擋住時還聽得到多少，留一點才不會像突然拔掉耳機 */
export const OCCLUSION_FLOOR = 0.06
/**
 * 繞過崖緣傳上來的聲音剩幾成
 *
 * 繞射過來的聲音比直達的弱，高頻掉得尤其多；這裡只能調音量，就整體打個對折多一點
 */
const EDGE_CARRY_RATIO = 0.55
/** 高低差不到這麼多格就不必試繞過崖緣那條路：平地上直線就是最通的 */
const EDGE_CARRY_HEIGHT_MIN = 2

/**
 * 擋不住聲音的方塊
 *
 * 樹葉、玻璃、柵欄雖然是實心方塊，卻不該讓森林的鳥叫整個消音；
 * 真正會把聲音悶掉的是岩層與土層
 */
const SOUND_TRANSPARENT_SET = new Set<BlockId>([
  /** 樹葉全都擋不住聲音；原本只列了橡樹與松，金葉、相思樹、闊葉林的樹冠會把聲音悶掉 */
  BlockId.OAK_LEAVES,
  BlockId.AMBER_LEAVES,
  BlockId.GOLD_LEAVES,
  BlockId.ACACIA_LEAVES,
  BlockId.JUNGLE_LEAVES,
  BlockId.PINE_LEAVES,
  BlockId.GLASS,
  BlockId.GLASS_PANE,
  BlockId.FENCE,
  BlockId.ICE,
])

/** 空間中的一個點 */
export interface SoundPoint {
  x: number;
  y: number;
  z: number;
}

/** 兩點之間的直線上卡了幾格擋得住聲音的方塊（換算回格數，不受取樣密度影響） */
function measureBlockedThickness(worldState: Uint8Array, from: SoundPoint, to: SoundPoint): number {
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const deltaZ = to.z - from.z
  const distance = Math.hypot(deltaX, deltaY, deltaZ)
  if (distance < 1)
    return 0

  const sampleCount = Math.min(OCCLUSION_SAMPLE_MAX, Math.ceil(distance / OCCLUSION_SAMPLE_STEP))
  let blockedCount = 0

  for (let index = 1; index < sampleCount; index++) {
    const blend = index / sampleCount
    const blockId = readBlock(
      worldState,
      Math.floor(from.x + deltaX * blend + 0.5),
      Math.floor(from.y + deltaY * blend + 0.5),
      Math.floor(from.z + deltaZ * blend + 0.5),
    )

    if (!SOUND_TRANSPARENT_SET.has(blockId) && !isPassableBlock(blockId)) {
      blockedCount++
    }
  }

  return blockedCount * (distance / sampleCount)
}

/** 隔了這麼厚的實心方塊，聲音還剩幾成 */
function convertThicknessToClarity(thickness: number): number {
  const occlusion = Math.min(1, thickness / OCCLUSION_FULL_THICKNESS)
  return 1 - occlusion * (1 - OCCLUSION_FLOOR)
}

/**
 * 量測聽者與音源之間隔了多少實心地形，回傳 0 ～ 1 的清晰度
 *
 * 只用距離判斷的話，站在山腹裡照樣聽得到頭頂那片森林的鳥叫，
 * 因為聲音直接穿過了整座山。
 * 這裡沿著兩點連線一路取樣，數中間卡了幾格岩石，
 * 隔得越厚聲音越悶，走進洞口的過程也就自然而然安靜下來。
 *
 * canCarryOverEdge 的音源多試一條路
 *
 * 直線有個盲點：站在崖頂往下聽，連線一離開腳邊就鑽進崖身，崖下的熔岩、潭水全被擋到只剩底噪，
 * 可是真實的聲音會從崖下升上來、越過崖緣。所以高低差夠大時再量一條折線——
 * 從低的那一頭垂直升到高的那一頭的高度，再水平過去——取比較通的那一條，折線那條打個折。
 * 只在音源自己標了才試：洞窟、石室這類頭頂有蓋的地方，折線會從薄的洞頂漏出去
 */
export function measureSoundClarity(
  worldState: Uint8Array,
  listener: SoundPoint,
  position: SoundPoint,
  canCarryOverEdge = false,
): number {
  const directClarity = convertThicknessToClarity(measureBlockedThickness(worldState, listener, position))
  if (!canCarryOverEdge || directClarity >= EDGE_CARRY_RATIO)
    return directClarity
  if (Math.abs(listener.y - position.y) < EDGE_CARRY_HEIGHT_MIN)
    return directClarity

  /** 轉角在低的那一頭的正上方、高的那一頭的高度 */
  const isListenerHigher = listener.y > position.y
  const low = isListenerHigher ? position : listener
  const high = isListenerHigher ? listener : position
  const corner = { x: low.x, y: high.y, z: low.z }
  const bentThickness = measureBlockedThickness(worldState, low, corner)
    + measureBlockedThickness(worldState, corner, high)

  return Math.max(directClarity, convertThicknessToClarity(bentThickness) * EDGE_CARRY_RATIO)
}
