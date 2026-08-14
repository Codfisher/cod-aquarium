import { Color3, Vector3 } from '@babylonjs/core'

/**
 * 日夜循環
 *
 * 這個檔案只負責「幾點鐘的世界長什麼樣子」，不碰任何場景物件：
 * 給它一個 0 ～ 1 的時刻，回傳那一刻的太陽方位、光色、霧色與色調。
 * 場景的接線在 use-day-night，聲音的日夜切換在音景那一側，
 * 三者共用這裡算出來的同一份結果，才不會各調各的而對不起來
 */

/**
 * 一整天走完要多久
 *
 * 這是一個用來待著的場景，不是要人守著看日出的，
 * 但每個人待的方式不一樣：有人想讓天色慢慢變，有人想快轉看完一輪日夜。
 * 標準的十分鐘是站著發呆一陣子天色就明顯變了，
 * 走完一圈箱庭也不至於天黑了三次
 */
const DAY_LENGTH_RANGE_SECOND: [number, number] = [1800, 60]

/**
 * 預設的速度位置
 *
 * 落在十分鐘那一檔：站著發呆一陣子天色就明顯變了，
 * 走完一圈箱庭也不至於天黑了三次
 */
export const INITIAL_DAY_SPEED_RATIO = 0.32

/**
 * 把滑桿位置換算成一整天的長度（秒）
 *
 * 走的是指數而不是線性。線性的話，滑桿前半段全落在十幾二十分鐘那一帶，
 * 差別根本感覺不出來，想要的快轉又全擠在最後一小截。
 * 指數讓每移動同樣的距離就是同樣的倍率，兩端都好調
 */
export function getDayLengthSecond(ratio: number): number {
  const [slowest, fastest] = DAY_LENGTH_RANGE_SECOND
  const clamped = Math.min(1, Math.max(0, ratio))

  return slowest * (fastest / slowest) ** clamped
}

/**
 * 進場時的時刻
 *
 * 上午十點左右。光線斜得夠開，影子拉得出來，
 * 又還沒到正午那種把立體感壓平的頂光
 */
export const INITIAL_TIME_OF_DAY = 0.42

/**
 * 太陽從哪個方位升起（度，0 ～ 360）
 *
 * 零度是 +Z 方向，順著 +X 遞增。預設一百一十九度是挑過的：
 * 出生點面向北方的枯山水，日出與日落都落在視野的側邊，
 * 不會一開場就對著太陽。
 *
 * 這個數字現在是設定裡的一項，玩家想讓太陽從哪裡出來都行
 */
export const DEFAULT_SUNRISE_AZIMUTH = 119.4

/**
 * 正午的仰角，拆成水平與垂直兩段
 *
 * 約五十八度，不是正頂上。一整片白沙被垂直的頂光照著會平得像一張紙，
 * 留一點斜度，方塊的三個面才拉得開亮度。
 *
 * 拆成兩個分量是為了轉方位時不必每次重算三角函數：
 * 轉的只有水平那一段，垂直的高度從頭到尾不變
 */
const NOON_HORIZONTAL = 0.528
const NOON_HEIGHT = 0.849

/**
 * 太陽升起的方位（水平單位向量）
 *
 * 與 NOON_AXIS 必須互相垂直，太陽才是沿著一個正圓在天球上走；
 * 不垂直的話軌跡會歪成橢圓，日出與日落的高度也對不起來。
 * 兩者都由 setSunriseAzimuth 一起算出來，垂直這件事因此是結構保證的
 */
const SUNRISE_AXIS = new Vector3()
/** 正午時太陽所在的方向 */
const NOON_AXIS = new Vector3()

/**
 * 一天過去，日出的方位往前挪多少度
 *
 * 九度，四十天繞回原處。真實的太陽一年之內在地平線上來回擺盪，
 * 這裡讓它一路繞下去——箱庭本來就不必照著地球轉。
 *
 * 數字挑得很小是刻意的：一天之內只挪九度，站著看不出來，
 * 但隔幾天回來，日出已經換到另一叢樹的後面了。
 * 這種「說不上來哪裡不同」正是想要的
 */
const AZIMUTH_DRIFT_PER_DAY = 9

/** 設定裡選的方位，玩家給什麼就是什麼 */
let baseAzimuth = DEFAULT_SUNRISE_AZIMUTH
/** 日子累積下來漂了多少度，與設定分開記 */
let driftAzimuth = 0

function applySunAxes(): void {
  const radian = (((baseAzimuth + driftAzimuth) % 360) * Math.PI) / 180

  SUNRISE_AXIS.set(Math.sin(radian), 0, Math.cos(radian))

  /** 正午在日出方位轉九十度的地方，這是兩軸垂直的來源 */
  const noonRadian = radian + Math.PI / 2
  NOON_AXIS.set(
    Math.sin(noonRadian) * NOON_HORIZONTAL,
    NOON_HEIGHT,
    Math.cos(noonRadian) * NOON_HORIZONTAL,
  )
}

/**
 * 換一個日出的方位
 *
 * 只轉水平的那一圈，正午的高度不動——所以不論太陽從哪裡出來，
 * 它中午都爬到同樣的高度，一天的光影節奏維持不變
 */
export function setSunriseAzimuth(degree: number): void {
  baseAzimuth = degree
  applySunAxes()
}

/**
 * 日子往前走，方位跟著漂
 *
 * dayStep 是「過了幾天」，與時刻前進用的是同一個步長，
 * 所以暫停、快轉、改變流速都自動跟著，不必各自處理。
 *
 * 拖時間軸不算數：那是翻頁去看某個時刻，不是真的過了一天。
 * 只有讓時間自己走過去，日出的方位才會挪
 */
export function advanceSunriseDrift(dayStep: number): void {
  driftAzimuth = (driftAzimuth + dayStep * AZIMUTH_DRIFT_PER_DAY) % 360
  applySunAxes()
}

applySunAxes()

/**
 * 太陽貼著地平線時把平行光關掉的高度範圍
 *
 * 平行光在日夜交替時要換邊：白天從太陽來，夜裡從月亮來，
 * 而兩者正好是相反的方向。切換的瞬間所有影子會整個翻過去。
 *
 * 這裡讓平行光在太陽貼近地平線的那一小段淡到全暗，
 * 換邊就發生在沒有光的時候，翻面自然看不出來。
 * 那幾秒的亮度由環境光撐著，本來就是日出前後天亮著卻沒有直射光的樣子
 */
const HORIZON_GATE_HEIGHT = 0.1

/**
 * 夜裡的補光
 *
 * 這道光不照方向，是均勻加在所有表面上的一層底。它有兩個作用：
 *
 * 一、夜色不至於黑到什麼都看不見。
 * 二、讓燈火照得出範圍——這才是重點。
 *
 * 方塊光是烘進實例顏色的，而實例顏色在著色器裡是乘在貼圖上：
 * 最終亮度等於「場景光照 × 貼圖 × 實例顏色」。
 * 燈火只是把照到的那幾面放大到兩倍多的反照率，
 * 白天光照是一、看得出來；夜裡光照只剩四分之一，
 * 兩倍多乘完還是暗的，烘進去的燈光就跟著夜色一起被壓掉了。
 *
 * 補光是加在光照上、再乘上反照率的，所以它一進來，
 * 燈火照到的地方會照比例亮起來——那圈光才真的照得出去
 */
const NIGHT_FILL_COLOR: [number, number, number] = [0.15, 0.18, 0.27]

/** 一天當中的時段，HUD 顯示與音景切換都讀這個 */
export type DayPhase =
  | 'midnight'
  | 'dawn'
  | 'sunrise'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'sunset'
  | 'dusk'
  | 'night'

interface DayNightKeyframe {
  time: number;
  /** 晴空下的霧色，整個場景的底色其實是它 */
  fogColor: [number, number, number];
  /** 平行光的顏色，白天是太陽、夜裡是月亮 */
  lightColor: [number, number, number];
  /** 環境光由上往下的天空色 */
  ambientSkyColor: [number, number, number];
  /** 環境光由下往上的地面反射色 */
  ambientGroundColor: [number, number, number];
  lightIntensity: number;
  ambientIntensity: number;
  /** 雲的基準亮度 */
  cloudBrightness: number;
  /** 天頂的顏色，天邊的顏色直接沿用 fogColor */
  skyZenithColor: [number, number, number];
  /** 中空的顏色，日出的丁香紫與日落的洋紅都住在這裡 */
  skyMidColor: [number, number, number];
  /** 太陽周圍那團暖光的顏色 */
  skyGlowColor: [number, number, number];
  /** 背對太陽那道反霞的顏色 */
  skyCounterColor: [number, number, number];
  /** 暖光的強度，正午幾乎為零、日落最濃 */
  skyGlowStrength: number;
  exposure: number;
  /** 色調：色相、濃度與飽和度，density 為 0 時完全不上色 */
  gradeHue: number;
  gradeDensity: number;
  gradeSaturation: number;
}

/**
 * 一天的顏色表
 *
 * 用關鍵時刻鋪一條曲線，中間線性補間。
 * 全部交給公式算的話，天色會是一條無聊的漸層；
 * 真正決定氣氛的是「破曉的藍」與「日落的橘」這種挑出來的顏色，
 * 那是調色的事，不是計算的事
 */
const KEYFRAME_LIST: DayNightKeyframe[] = [
  {
    /** 深夜：月光是唯一的光源，白沙變成一片幽藍 */
    time: 0,
    fogColor: [0.055, 0.07, 0.115],
    lightColor: [0.56, 0.66, 0.95],
    ambientSkyColor: [0.3, 0.4, 0.62],
    ambientGroundColor: [0.16, 0.18, 0.26],
    lightIntensity: 0.3,
    ambientIntensity: 0.32,
    cloudBrightness: 0.2,
    skyZenithColor: [0.01, 0.016, 0.048],
    skyMidColor: [0.03, 0.042, 0.098],
    skyGlowColor: [0.12, 0.14, 0.26],
    skyCounterColor: [0.06, 0.07, 0.14],
    skyGlowStrength: 0,
    exposure: 0.95,
    gradeHue: 220,
    gradeDensity: 42,
    gradeSaturation: -26,
  },
  {
    /** 破曉：天邊開始泛白，太陽還沒上來 */
    time: 0.2,
    fogColor: [0.24, 0.26, 0.36],
    lightColor: [0.72, 0.68, 0.88],
    ambientSkyColor: [0.46, 0.52, 0.72],
    ambientGroundColor: [0.3, 0.3, 0.34],
    lightIntensity: 0.38,
    ambientIntensity: 0.44,
    cloudBrightness: 0.34,
    skyZenithColor: [0.05, 0.085, 0.23],
    skyMidColor: [0.17, 0.19, 0.38],
    skyGlowColor: [0.66, 0.44, 0.56],
    skyCounterColor: [0.3, 0.26, 0.45],
    skyGlowStrength: 0.5,
    exposure: 0.98,
    gradeHue: 250,
    gradeDensity: 26,
    gradeSaturation: -14,
  },
  {
    /** 日出：整片白沙被染成朝霞的顏色，一天只有這幾十秒 */
    time: 0.26,
    fogColor: [0.88, 0.63, 0.52],
    lightColor: [1, 0.62, 0.38],
    ambientSkyColor: [0.88, 0.68, 0.64],
    ambientGroundColor: [0.46, 0.36, 0.32],
    lightIntensity: 0.85,
    ambientIntensity: 0.62,
    cloudBrightness: 0.74,
    skyZenithColor: [0.2, 0.4, 0.76],
    skyMidColor: [0.63, 0.55, 0.74],
    skyGlowColor: [1, 0.62, 0.34],
    skyCounterColor: [0.76, 0.54, 0.64],
    skyGlowStrength: 0.95,
    exposure: 1.02,
    gradeHue: 22,
    gradeDensity: 30,
    gradeSaturation: 8,
  },
  {
    /** 早晨：暖色退掉，回到禪庭該有的白 */
    time: 0.34,
    fogColor: [0.94, 0.91, 0.87],
    lightColor: [1, 0.9, 0.74],
    ambientSkyColor: [0.76, 0.86, 1],
    ambientGroundColor: [0.82, 0.77, 0.72],
    lightIntensity: 1.16,
    ambientIntensity: 0.76,
    cloudBrightness: 0.92,
    skyZenithColor: [0.3, 0.55, 0.95],
    skyMidColor: [0.62, 0.78, 0.96],
    skyGlowColor: [1, 0.88, 0.68],
    skyCounterColor: [0.78, 0.84, 0.95],
    skyGlowStrength: 0.3,
    exposure: 1.05,
    gradeHue: 30,
    gradeDensity: 10,
    gradeSaturation: 4,
  },
  {
    /** 正午：這一組就是原本沒有日夜循環時的樣子 */
    time: 0.5,
    fogColor: [0.955, 0.95, 0.935],
    lightColor: [1, 0.93, 0.78],
    ambientSkyColor: [0.78, 0.88, 1],
    ambientGroundColor: [0.82, 0.77, 0.72],
    lightIntensity: 1.3,
    ambientIntensity: 0.82,
    cloudBrightness: 1,
    skyZenithColor: [0.26, 0.52, 0.98],
    skyMidColor: [0.6, 0.78, 0.99],
    skyGlowColor: [1, 0.98, 0.9],
    skyCounterColor: [0.8, 0.88, 0.98],
    skyGlowStrength: 0.12,
    exposure: 1.06,
    gradeHue: 30,
    gradeDensity: 0,
    gradeSaturation: 0,
  },
  {
    /** 午後：光開始偏黃，影子重新拉長 */
    time: 0.66,
    fogColor: [0.96, 0.93, 0.89],
    lightColor: [1, 0.89, 0.7],
    ambientSkyColor: [0.8, 0.86, 0.98],
    ambientGroundColor: [0.84, 0.78, 0.7],
    lightIntensity: 1.2,
    ambientIntensity: 0.78,
    cloudBrightness: 0.96,
    skyZenithColor: [0.28, 0.52, 0.93],
    skyMidColor: [0.64, 0.78, 0.95],
    skyGlowColor: [1, 0.9, 0.72],
    skyCounterColor: [0.82, 0.86, 0.94],
    skyGlowStrength: 0.24,
    exposure: 1.05,
    gradeHue: 34,
    gradeDensity: 12,
    gradeSaturation: 6,
  },
  {
    /** 日落：比日出更濃更紅，太陽整天累積的塵埃都在這一刻 */
    time: 0.74,
    fogColor: [0.94, 0.63, 0.44],
    lightColor: [1, 0.52, 0.26],
    ambientSkyColor: [0.92, 0.66, 0.56],
    ambientGroundColor: [0.52, 0.35, 0.28],
    lightIntensity: 0.8,
    ambientIntensity: 0.62,
    cloudBrightness: 0.68,
    skyZenithColor: [0.15, 0.27, 0.62],
    skyMidColor: [0.73, 0.46, 0.62],
    skyGlowColor: [1, 0.38, 0.16],
    skyCounterColor: [0.64, 0.44, 0.68],
    skyGlowStrength: 1.05,
    exposure: 1.02,
    gradeHue: 18,
    gradeDensity: 36,
    gradeSaturation: 12,
  },
  {
    /** 暮色：橘退成紫，這是一天裡最短的一段 */
    time: 0.8,
    fogColor: [0.46, 0.37, 0.44],
    lightColor: [0.7, 0.5, 0.62],
    ambientSkyColor: [0.56, 0.5, 0.68],
    ambientGroundColor: [0.32, 0.27, 0.31],
    lightIntensity: 0.36,
    ambientIntensity: 0.46,
    cloudBrightness: 0.36,
    skyZenithColor: [0.055, 0.085, 0.24],
    skyMidColor: [0.29, 0.22, 0.44],
    skyGlowColor: [0.74, 0.32, 0.42],
    skyCounterColor: [0.34, 0.25, 0.46],
    skyGlowStrength: 0.62,
    exposure: 0.99,
    gradeHue: 275,
    gradeDensity: 30,
    gradeSaturation: -8,
  },
  {
    /** 入夜：與深夜同一組，中間那段就整片維持不變 */
    time: 0.88,
    fogColor: [0.055, 0.07, 0.115],
    lightColor: [0.56, 0.66, 0.95],
    ambientSkyColor: [0.3, 0.4, 0.62],
    ambientGroundColor: [0.16, 0.18, 0.26],
    lightIntensity: 0.3,
    ambientIntensity: 0.32,
    cloudBrightness: 0.2,
    skyZenithColor: [0.01, 0.016, 0.048],
    skyMidColor: [0.03, 0.042, 0.098],
    skyGlowColor: [0.12, 0.14, 0.26],
    skyCounterColor: [0.06, 0.07, 0.14],
    skyGlowStrength: 0,
    exposure: 0.95,
    gradeHue: 220,
    gradeDensity: 42,
    gradeSaturation: -26,
  },
]

/**
 * 某個時刻的世界
 *
 * 顏色都是可變的物件，每一幀就地覆寫，不重新配置——
 * 這在每幀都會跑的路徑上是必要的
 */
export interface DayNightSample {
  /** 太陽在天球上的方向（由世界中心指向太陽） */
  sunPosition: Vector3;
  /** 月亮的方向，永遠與太陽相對 */
  moonPosition: Vector3;
  /** 平行光前進的方向，白天由太陽射下、夜裡由月亮射下 */
  lightDirection: Vector3;
  /** 太陽的高度，1 為天頂、負值為地平線以下 */
  sunHeight: number;
  /** 白晝的程度，0 為全暗、1 為大白天。音景的日夜切換讀這個 */
  dayRatio: number;
  /** 太陽本體該露出多少 */
  sunVisibility: number;
  /** 月亮該露出多少 */
  moonVisibility: number;
  /** 星空該亮多少 */
  starVisibility: number;
  /** 晨昏光束的強度，太陽貼近地平線時最強 */
  godRayRatio: number;
  fogColor: Color3;
  lightColor: Color3;
  ambientSkyColor: Color3;
  ambientGroundColor: Color3;
  /** 夜裡均勻加在所有表面上的補光，白天為全黑 */
  fillColor: Color3;
  lightIntensity: number;
  ambientIntensity: number;
  cloudBrightness: number;
  skyZenithColor: Color3;
  skyMidColor: Color3;
  skyGlowColor: Color3;
  skyCounterColor: Color3;
  skyGlowStrength: number;
  exposure: number;
  gradeHue: number;
  gradeDensity: number;
  gradeSaturation: number;
}

export function createDayNightSample(): DayNightSample {
  return {
    sunPosition: new Vector3(0, 1, 0),
    moonPosition: new Vector3(0, -1, 0),
    lightDirection: new Vector3(0, -1, 0),
    sunHeight: 1,
    dayRatio: 1,
    sunVisibility: 1,
    moonVisibility: 0,
    starVisibility: 0,
    godRayRatio: 0,
    fogColor: new Color3(),
    lightColor: new Color3(),
    ambientSkyColor: new Color3(),
    ambientGroundColor: new Color3(),
    fillColor: new Color3(),
    lightIntensity: 1,
    ambientIntensity: 1,
    cloudBrightness: 1,
    skyZenithColor: new Color3(),
    skyMidColor: new Color3(),
    skyGlowColor: new Color3(),
    skyCounterColor: new Color3(),
    skyGlowStrength: 0.12,
    exposure: 1.06,
    gradeHue: 30,
    gradeDensity: 0,
    gradeSaturation: 0,
  }
}

/** 把時刻繞回 0 ～ 1 */
export function wrapTimeOfDay(value: number): number {
  return ((value % 1) + 1) % 1
}

/**
 * 算出某個時刻的世界，就地寫進 sample
 *
 * timeOfDay 為 0 ～ 1：0 是子夜、0.25 日出、0.5 正午、0.75 日落
 */
export function sampleDayNight(timeOfDay: number, sample: DayNightSample): DayNightSample {
  const time = wrapTimeOfDay(timeOfDay)

  /** 太陽沿著傾斜的圓在天球上繞一圈，0.25 時剛好在地平線上 */
  const angle = (time - 0.25) * Math.PI * 2
  const alongRise = Math.cos(angle)
  const alongNoon = Math.sin(angle)

  sample.sunPosition.set(
    SUNRISE_AXIS.x * alongRise + NOON_AXIS.x * alongNoon,
    SUNRISE_AXIS.y * alongRise + NOON_AXIS.y * alongNoon,
    SUNRISE_AXIS.z * alongRise + NOON_AXIS.z * alongNoon,
  )
  sample.moonPosition.copyFrom(sample.sunPosition).scaleInPlace(-1)
  sample.sunHeight = sample.sunPosition.y

  /**
   * 平行光從高的那一顆天體射下來
   *
   * 太陽在地平線以上就照太陽，以下就換月亮。
   * 換邊的瞬間光線是暗的（見 HORIZON_GATE_HEIGHT），所以看不出翻面
   */
  const isSunUp = sample.sunHeight >= 0
  sample.lightDirection
    .copyFrom(isSunUp ? sample.sunPosition : sample.moonPosition)
    .scaleInPlace(-1)
    .normalize()

  sample.dayRatio = smoothRange(sample.sunHeight, -0.12, 0.15)
  sample.sunVisibility = smoothRange(sample.sunHeight, -0.05, 0.06)
  sample.moonVisibility = smoothRange(-sample.sunHeight, -0.02, 0.14)
  sample.starVisibility = smoothRange(-sample.sunHeight, 0.02, 0.24)
  /**
   * 光束只在太陽貼著地平線時出現
   *
   * 那是光線斜著穿過整片林子的角度，樹幹與鳥居會在畫面上切出一道道縫。
   * 太陽一升高，光線幾乎垂直落下，光束就沒有東西可以穿了——
   * 而它每一幀要把世界多畫一次，沒有畫面效果的時候就不該存在
   */
  sample.godRayRatio = sample.sunVisibility * (1 - smoothRange(sample.sunHeight, 0.06, 0.42))

  applyKeyframe(time, sample)

  /** 貼著地平線的那一小段把平行光關掉，換邊才不會讓影子整個翻過去 */
  sample.lightIntensity *= smoothRange(Math.abs(sample.sunHeight), 0, HORIZON_GATE_HEIGHT)

  /** 補光跟著夜色進場，天一亮就退乾淨 */
  const fillRatio = 1 - sample.dayRatio
  sample.fillColor.set(
    NIGHT_FILL_COLOR[0] * fillRatio,
    NIGHT_FILL_COLOR[1] * fillRatio,
    NIGHT_FILL_COLOR[2] * fillRatio,
  )

  return sample
}

/** 依關鍵時刻補間出這一刻的顏色與參數 */
function applyKeyframe(time: number, sample: DayNightSample): void {
  const lastIndex = KEYFRAME_LIST.length - 1
  let fromIndex = lastIndex

  for (let index = 0; index < KEYFRAME_LIST.length; index++) {
    if (KEYFRAME_LIST[index]!.time <= time) {
      fromIndex = index
    }
  }

  const from = KEYFRAME_LIST[fromIndex]!
  const to = KEYFRAME_LIST[(fromIndex + 1) % KEYFRAME_LIST.length]!
  /** 最後一段要繞回第一個關鍵時刻，跨過子夜那條線 */
  const span = fromIndex === lastIndex ? 1 - from.time + KEYFRAME_LIST[0]!.time : to.time - from.time
  const ratio = span <= 0 ? 0 : Math.min(1, Math.max(0, (time - from.time) / span))

  setColor(sample.fogColor, from.fogColor, to.fogColor, ratio)
  setColor(sample.lightColor, from.lightColor, to.lightColor, ratio)
  setColor(sample.ambientSkyColor, from.ambientSkyColor, to.ambientSkyColor, ratio)
  setColor(sample.ambientGroundColor, from.ambientGroundColor, to.ambientGroundColor, ratio)

  sample.lightIntensity = lerp(from.lightIntensity, to.lightIntensity, ratio)
  sample.ambientIntensity = lerp(from.ambientIntensity, to.ambientIntensity, ratio)
  sample.cloudBrightness = lerp(from.cloudBrightness, to.cloudBrightness, ratio)
  setColor(sample.skyZenithColor, from.skyZenithColor, to.skyZenithColor, ratio)
  setColor(sample.skyMidColor, from.skyMidColor, to.skyMidColor, ratio)
  setColor(sample.skyGlowColor, from.skyGlowColor, to.skyGlowColor, ratio)
  setColor(sample.skyCounterColor, from.skyCounterColor, to.skyCounterColor, ratio)
  sample.skyGlowStrength = lerp(from.skyGlowStrength, to.skyGlowStrength, ratio)
  sample.exposure = lerp(from.exposure, to.exposure, ratio)
  sample.gradeDensity = lerp(from.gradeDensity, to.gradeDensity, ratio)
  sample.gradeSaturation = lerp(from.gradeSaturation, to.gradeSaturation, ratio)
  /** 色相是繞一圈的角度，走短邊才不會從橘繞過整個色環到藍 */
  sample.gradeHue = lerpHue(from.gradeHue, to.gradeHue, ratio)
}

/** 目前是一天當中的哪一段 */
export function getDayPhase(timeOfDay: number): DayPhase {
  const time = wrapTimeOfDay(timeOfDay)

  if (time < 0.18)
    return 'midnight'
  if (time < 0.24)
    return 'dawn'
  if (time < 0.3)
    return 'sunrise'
  if (time < 0.44)
    return 'morning'
  if (time < 0.58)
    return 'noon'
  if (time < 0.71)
    return 'afternoon'
  if (time < 0.78)
    return 'sunset'
  if (time < 0.85)
    return 'dusk'

  return 'night'
}

/** 把時刻換成 24 小時制的時鐘讀數 */
export function formatClock(timeOfDay: number): string {
  const totalMinute = Math.floor(wrapTimeOfDay(timeOfDay) * 24 * 60)
  const hour = Math.floor(totalMinute / 60)
  const minute = totalMinute % 60

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

/** 色相走短邊 */
function lerpHue(from: number, to: number, ratio: number): number {
  const delta = ((to - from) % 360 + 540) % 360 - 180

  return (from + delta * ratio + 360) % 360
}

function setColor(
  target: Color3,
  from: [number, number, number],
  to: [number, number, number],
  ratio: number,
): void {
  target.set(
    lerp(from[0], to[0], ratio),
    lerp(from[1], to[1], ratio),
    lerp(from[2], to[2], ratio),
  )
}

/** 把 value 落在 from ～ to 之間的位置換成 0 ～ 1 的平滑曲線 */
function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}
