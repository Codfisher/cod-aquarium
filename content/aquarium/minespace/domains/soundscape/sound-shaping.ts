import type { SoundActivePeriod, SoundPlayMode, SoundVariation, SoundWeatherGain } from './type'

/**
 * 音景裡不碰音訊引擎的那些算式
 *
 * 什麼時段出聲、每一次播放差多少、雨勢換成多大聲、神遊時耳朵放多高。
 * 全是純函式，不引用 Babylon，測試與量測腳本可以直接拿去算
 */

/**
 * 正午太陽的高度
 *
 * 與日夜循環同一個值（domains/weather/day-night 的 NOON_HEIGHT）。
 * 那個檔案引用了 Babylon 的向量，音景這邊只要一個數字，就不整包拉進來
 */
const NOON_SUN_HEIGHT = 0.849

/** 平滑的區間映射：value 從 from 走到 to，回傳 0 到 1 */
function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 某個時刻太陽多高，1 為天頂、負值在地平線下
 *
 * timeOfDay 為 0 ～ 1：0 是子夜、0.25 日出、0.5 正午、0.75 日落
 */
export function measureSunHeight(timeOfDay: number): number {
  return Math.sin((timeOfDay - 0.25) * Math.PI * 2) * NOON_SUN_HEIGHT
}

/**
 * 拂曉與薄暮各自多滿，0 ～ 1
 *
 * 聲音上的晨昏比畫面上的長：鳥在天還沒亮就開始叫，太陽爬到半空才散；
 * 蟲與蛙在太陽還掛著的時候起頭，天黑透之後好一陣子才退回夜裡平常的量。
 * 所以門檻寫在太陽的高度上，前後各留一段斜坡，不是對著日出日落那一刻開關
 */
function measureDawnGate(timeOfDay: number): number {
  if (timeOfDay >= 0.5)
    return 0

  const sunHeight = measureSunHeight(timeOfDay)
  return smoothRange(sunHeight, -0.32, -0.1) * (1 - smoothRange(sunHeight, 0.3, 0.55))
}

function measureDuskGate(timeOfDay: number): number {
  if (timeOfDay < 0.5)
    return 0

  const sunHeight = measureSunHeight(timeOfDay)
  return smoothRange(-sunHeight, -0.3, -0.05) * (1 - smoothRange(-sunHeight, 0.3, 0.55))
}

/**
 * 太陽貼著地平線那一段多滿，0 ～ 1，早晚各一次
 *
 * 門檻照抄天上那些晨昏才出現的東西（realm-signature-kit 的 twilightRatio：雁行、椋鳥群舞），
 * 牠們的聲音要與畫面同進同退
 */
function measureTwilightGate(timeOfDay: number): number {
  const sunHeight = measureSunHeight(timeOfDay)
  return smoothRange(sunHeight, -0.1, -0.01) * (1 - smoothRange(sunHeight, 0.2, 0.36))
}

/**
 * 依時段取得音源該有的音量比例
 *
 * 沒有指定時段的音源整天都是滿的。
 * 白天與夜裡直接跟著白晝程度走：天亮到一半，蟬與蟋蟀就各出一半的力，
 * 那正是黎明時兩種聲音疊在一起的樣子，不是到點換班。
 * 拂曉、薄暮與晨昏則看時刻（地底的場景沒有天，白晝程度不會動，時刻照走）
 */
export function measureTimeGate(
  activeAt: SoundActivePeriod | undefined,
  dayRatio: number,
  timeOfDay: number,
): number {
  switch (activeAt) {
    case undefined:
      return 1
    case 'day':
      return dayRatio
    case 'night':
      return 1 - dayRatio
    case 'dawn':
      return measureDawnGate(timeOfDay)
    case 'dusk':
      return measureDuskGate(timeOfDay)
    case 'twilight':
      return measureTwilightGate(timeOfDay)
  }
}

/** 沒寫 variation 的間歇音，每次播放音高上下各差多少音分 */
export const DEFAULT_INTERVAL_PITCH_RANGE_CENT = 60
/** 沒寫 variation 的間歇音，每次播放音量最多掉幾成 */
export const DEFAULT_INTERVAL_VOLUME_DROP_RATIO = 0.25
/** 沒寫 variation 的循環音，每一顆固定差多少音分（照 id 定，不是亂數） */
export const DEFAULT_LOOP_PITCH_RANGE_CENT = 35

/**
 * 由 id 算一個 −1 ～ 1 的定值
 *
 * 循環音的音高偏移要「每一顆不一樣、但同一顆永遠一樣」：
 * 音源會反覆載入卸載，每次回來換一個音高的話，走開再走回來那片蟲就變了調
 */
export function measureIdUnit(id: string): number {
  /**
   * FNV-1a 再攪一輪
   *
   * 音源的 id 多半只差結尾的編號（chorus-0、chorus-1…）。乘加再取餘數那種湊法，
   * 結尾差一號算出來只差一點點，一整排音源的偏移幾乎一樣，等於沒有錯開
   */
  let hash = 2166136261
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  hash ^= hash >>> 15
  hash = Math.imul(hash, 2246822519)
  hash ^= hash >>> 13

  return ((hash >>> 0) / 4294967295) * 2 - 1
}

/** 這一次播放要用的音高與音量 */
export interface PlayVariation {
  /** 音高偏移（音分） */
  pitchCent: number;
  /** 這一次的音量是平常的幾成 */
  volumeRatio: number;
}

/**
 * 決定這一次播放的音高與音量
 *
 * 同一段錄音原樣重播，十幾秒就聽得出是同一隻鳥、同一聲蛙；
 * 幾十顆音源共用一段循環時，每一顆都同音高，疊起來只是變大聲，不會變厚。
 * - 間歇音與觸發音：每次播放在固定偏移上下隨機一點，音量也掉一點，像換了一隻、換了一個距離
 * - 循環音：每一顆有自己固定的偏移，播放速度跟著差一點點，彼此就不會齊步走
 *
 * random 傳函式進來：測試要給定值，引擎給 Math.random
 */
export function pickPlayVariation(
  variation: SoundVariation | undefined,
  modeType: SoundPlayMode['type'],
  id: string,
  random: () => number,
): PlayVariation {
  const pitchOffsetCent = variation?.pitchOffsetCent ?? 0

  if (modeType === 'loop') {
    const pitchRangeCent = variation?.pitchRangeCent ?? DEFAULT_LOOP_PITCH_RANGE_CENT
    return {
      pitchCent: pitchOffsetCent + measureIdUnit(id) * pitchRangeCent,
      volumeRatio: 1,
    }
  }

  const pitchRangeCent = variation?.pitchRangeCent ?? DEFAULT_INTERVAL_PITCH_RANGE_CENT
  const volumeDropRatio = Math.min(1, Math.max(0, variation?.volumeDropRatio ?? DEFAULT_INTERVAL_VOLUME_DROP_RATIO))

  return {
    pitchCent: pitchOffsetCent + (random() * 2 - 1) * pitchRangeCent,
    volumeRatio: 1 - random() * volumeDropRatio,
  }
}

/**
 * 雨（雪）勢換成音量比例
 *
 * 大場景的雨勢只在一小段裡起落（聽雨林零點七八到一），原樣拿來乘音量只差兩分貝，聽不出來。
 * 所以音源自己說「這場天氣最小到多少、最大到多少」，把那一段攤開成 floor 到一：
 * 雨最小的時候留 floor 那麼多，滿檔時才是定義裡的音量。
 *
 * 低於那一段不再往下掉，停在 floor：這裡只管強弱，不管有沒有在下。
 * 會用到它的場景整片一直在那場天氣裡，雨勢讀數掉到零只會是資料還沒送到（剛進場景的頭一拍），
 * 那時整片雨聲跟著歸零反而是錯的
 */
export function measureWeatherGain(
  weatherGain: SoundWeatherGain | undefined,
  rainRatio: number,
  snowRatio: number,
): number {
  if (!weatherGain)
    return 1

  const level = weatherGain.source === 'rain' ? rainRatio : snowRatio
  const [low, high] = weatherGain.levelRange
  const ratio = Math.min(1, Math.max(0, (level - low) / Math.max(0.0001, high - low)))
  return weatherGain.floor + (1 - weatherGain.floor) * ratio
}

/** 神遊升空時，耳朵離「人站在地上的耳朵高度」的那一段只留幾成 */
export const DRIFT_LISTENER_HEIGHT_KEEP_RATIO = 0.3
/** 耳朵最多比地上的人高幾格，飛得再高也不再往上 */
export const DRIFT_LISTENER_HEIGHT_MAX = 6

/**
 * 神遊時耳朵該放在多高
 *
 * 神遊的鏡頭飛在樹梢上方，耳朵照實跟著它的話，貼地的聲音（落葉、草蟲、岸邊的水）全部出了範圍，
 * 飛一趟有三成到七成的時間是無聲的。這裡把耳朵想成吊在無人機下面的一支收音麥克風：
 * 鏡頭比「人站在正下方地面上的耳朵」高出多少，耳朵只跟上其中三成，而且最多高六格。
 * 鏡頭貼地（散步、停留）時兩者本來就一樣高，什麼都不會變。
 *
 * 選這條路是因為距離衰減在 Web Audio 的 PannerNode 裡算，音量只能往下乘、救不回已經歸零的聲音；
 * 要讓升空時還聽得到，只能動聽者的位置。左右前後的方位不動，仍是鏡頭那一點
 *
 * @param cameraY 鏡頭高度
 * @param groundEarY 人站在鏡頭正下方地面時耳朵的高度
 * @param pullRatio 拉下來的程度，0 為照鏡頭、1 為全套用（進出神遊時用它淡入淡出）
 */
export function measureDriftListenerY(cameraY: number, groundEarY: number, pullRatio: number): number {
  const excess = cameraY - groundEarY
  if (excess <= 0)
    return cameraY

  const loweredY = groundEarY + Math.min(DRIFT_LISTENER_HEIGHT_MAX, excess * DRIFT_LISTENER_HEIGHT_KEEP_RATIO)
  const ratio = Math.min(1, Math.max(0, pullRatio))

  return cameraY + (loweredY - cameraY) * ratio
}

/** 一道雷從哪裡來 */
export interface ThunderPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * 這一道雷擺在聽者的哪一邊
 *
 * 雷原本釘在林子正中的天上，每一道都從同一個方向來。閃電是整片天亮一下、沒有方位，
 * 所以雷從哪一邊來都說得通：每次隨機挑一個方位，遠的雷擺遠一點、低一點（貼著天邊），
 * 近的幾乎在頭頂。水平距離壓在雷的滿音量半徑裡，遠近的音量仍由天氣那邊給的 volume 決定。
 * distanceRatio 是這一道雷多遠：0 為就在頭頂、1 為遠方天邊
 */
export function pickThunderPosition(
  listener: ThunderPosition,
  distanceRatio: number,
  random: () => number,
): ThunderPosition {
  const ratio = Math.min(1, Math.max(0, distanceRatio))
  const angle = random() * Math.PI * 2
  const reach = 6 + ratio * 20

  return {
    x: listener.x + Math.cos(angle) * reach,
    y: listener.y + 22 - ratio * 10,
    z: listener.z + Math.sin(angle) * reach,
  }
}
