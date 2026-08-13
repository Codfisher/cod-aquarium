import { Color3 } from '@babylonjs/core'
import { WORLD_SIZE } from '../world/world-constants'

/**
 * 地表大氣狀態
 *
 * 三個系統疊在同一份狀態上：日夜循環寫入「這個時刻的基準」，
 * 天氣在基準之上疊雨與霧，漫遊控制器最後再疊上洞穴與水面，
 * 然後才套進場景。三邊各自直接改 scene 的話會互相蓋掉——
 * 走進洞裡的變暗會被下一幀的陰天覆寫，日夜的光色又會被兩者一起洗掉。
 */
export interface AtmosphereState {
  /** 地表霧氣顏色 */
  fogColor: Color3;
  /** 霧氣起點距離 */
  fogStart: number;
  /** 霧氣終點距離 */
  fogEnd: number;
  /** 光線強度倍率，陰天會壓低 */
  lightRatio: number;
  /** 閃電補光，0 ~ 1 */
  flashRatio: number;

  /**
   * 以下由日夜循環寫入，天氣與漫遊控制器只讀不寫
   */

  /** 這個時刻的晴空霧色，天氣以它為基準疊上雨霧，邊界的白幕也染成這個顏色 */
  baseFogColor: Color3;
  /** 平行光的顏色，白天是暖陽、夜裡是冷月 */
  lightColor: Color3;
  /** 環境光由上往下的天空色 */
  ambientSkyColor: Color3;
  /** 環境光由下往上的地面反射色 */
  ambientGroundColor: Color3;
  /**
   * 夜裡均勻加在所有表面上的補光，白天為全黑
   *
   * 走的是場景的 ambientColor，也就是著色器裡加在光照上、
   * 再乘上反照率的那一項。方塊光是烘進反照率的，
   * 所以這道補光一進來，燈火照到的地方會照比例亮起來
   */
  fillColor: Color3;
  /** 平行光強度 */
  lightIntensity: number;
  /** 環境光強度 */
  ambientIntensity: number;
  /** 雲的基準亮度 */
  cloudBrightness: number;
  /** 天色的基準：三段漸層、太陽的暖光與背後的反霞，天邊色直接用 baseFogColor */
  skyZenithColor: Color3;
  skyMidColor: Color3;
  skyGlowColor: Color3;
  skyCounterColor: Color3;
  skyGlowStrength: number;

  /**
   * 被地形包住的程度，0 為露天、1 為深入山腹
   *
   * 由漫遊控制器量測後寫入。天空那一層要靠它決定要不要收起來：
   * 洞裡抬頭看到的該是岩壁，不是藍天
   */
  caveRatio: number;

  /**
   * 天體露出多少，0 為完全遮住、1 為完全露出
   *
   * 由天氣寫入、日夜循環讀取：下雨與貼近世界邊界時整片天會被白幕蓋掉，
   * 太陽、月亮與星空都得跟著淡出，否則會浮在白幕前面
   */
  skyBodyFade: number;
}

/**
 * 禪庭的霧色
 *
 * 幾乎是純白，只帶一點點沙的暖。
 * 這片霧同時做兩件事：把遠方的空白藏起來，
 * 以及讓玩家走過世界邊界時看不出景物被換過——
 * 兩邊在霧裡都是一樣的白，跨過去也就無從察覺
 */
export const GARDEN_FOG_COLOR = new Color3(0.955, 0.95, 0.935)

/**
 * 平常的能見度
 *
 * 站在庭園裡時霧只是淡淡一層：內圈的箱庭看得清楚，
 * 外圈那幾座在霧裡若隱若現。整片禪庭的構圖要看得到才成立，
 * 一開始就罩死反而只剩下一團白
 */
export const GARDEN_FOG_END = 220
export const GARDEN_FOG_START = 100

/**
 * 靠近世界邊界時的能見度
 *
 * 濃到伸手不見五指：六格以外什麼都沒有，只剩一片白。
 * 這是整個「無限場景」的關鍵——跨越邊界的那一刻，
 * 兩側都是同一片什麼都看不見的白，玩家無從察覺自己被送到了對面。
 *
 * 走進去會像走進一場大霧，實際上那是一道遮蔽用的簾子
 */
export const EDGE_FOG_END = 6
export const EDGE_FOG_START = 0.5

/**
 * 濃霧的作用範圍
 *
 * 離邊界這麼遠以外是平常的能見度，這麼近以內濃到什麼都看不見，
 * 中間平滑過渡。過渡帶要落在「邊界到最外圈木座」那段空白沙地裡，
 * 走出最後一座箱庭之後霧才開始收攏，沒有任何景物被吃掉
 */
export const EDGE_FOG_FULL_DISTANCE = 10
export const EDGE_FOG_CLEAR_DISTANCE = 42

/**
 * 洞穴的霧色
 *
 * 幾近全黑的霧一罩下去，兩步之外就什麼都看不見，
 * 進洞會像瞬間關燈。留一點岩石的灰藍，才是深處的空氣感。
 *
 * 天空那一層在洞裡也要收成這個顏色，才不會從洞口望出去
 * 看到一片與洞內完全兜不起來的藍
 */
export const CAVE_FOG_COLOR = new Color3(0.13, 0.13, 0.17)

/** 晴天的大氣參數 */
export const CLEAR_ATMOSPHERE = {
  fogColor: GARDEN_FOG_COLOR,
  fogStart: GARDEN_FOG_START,
  fogEnd: GARDEN_FOG_END,
  lightRatio: 1,
} as const

/**
 * 沼澤箱庭的大氣參數
 *
 * 不是陰天，光線照樣亮，只是空氣裡浮著一層帶綠的濕氣。
 * 能見度收到只剩十幾格，走上木棧道只看得到眼前那幾棵枯木
 */
export const SWAMP_ATMOSPHERE = {
  fogColor: new Color3(0.72, 0.78, 0.7),
  fogStart: 2,
  fogEnd: 20,
  lightRatio: 0.82,
} as const

/**
 * 聽雨箱庭的大氣參數
 *
 * 雨只下在那一座箱庭上，所以霧也只在那裡壓下來。
 * 顏色偏冷的灰藍，與周圍的暖白拉開差距，
 * 從外面看過去就知道那一小塊的天氣跟別處不一樣
 */
export const RAIN_ATMOSPHERE = {
  fogColor: new Color3(0.62, 0.66, 0.72),
  fogStart: 4,
  fogEnd: 26,
  lightRatio: 0.55,
} as const

export function createAtmosphereState(): AtmosphereState {
  return {
    fogColor: CLEAR_ATMOSPHERE.fogColor.clone(),
    fogStart: CLEAR_ATMOSPHERE.fogStart,
    fogEnd: CLEAR_ATMOSPHERE.fogEnd,
    lightRatio: CLEAR_ATMOSPHERE.lightRatio,
    flashRatio: 0,

    /** 日夜循環還沒接上前的第一幀，照著正午的樣子 */
    baseFogColor: CLEAR_ATMOSPHERE.fogColor.clone(),
    lightColor: new Color3(1, 0.93, 0.78),
    ambientSkyColor: new Color3(0.78, 0.88, 1),
    ambientGroundColor: new Color3(0.82, 0.77, 0.72),
    fillColor: new Color3(0, 0, 0),
    lightIntensity: 1.3,
    ambientIntensity: 0.82,
    cloudBrightness: 1,
    skyZenithColor: new Color3(0.26, 0.52, 0.98),
    skyMidColor: new Color3(0.6, 0.78, 0.99),
    skyGlowColor: new Color3(1, 0.98, 0.9),
    skyCounterColor: new Color3(0.8, 0.88, 0.98),
    skyGlowStrength: 0.12,
    caveRatio: 0,
    skyBodyFade: 1,
  }
}

/**
 * 離世界邊界有多近，0 為平常、1 為貼著邊界
 *
 * 四個方向取最近的那一邊。地面的霧氣與天空的白幕都吃這個數字，
 * 兩者才會一起收攏——只糊掉地面而天空還在的話，
 * 玩家依然看得到地平線與雲的位置，跨過邊界時那一下就露餡了
 */
export function getEdgeFogRatio(x: number, z: number): number {
  const distance = Math.min(x, z, WORLD_SIZE - x, WORLD_SIZE - z)
  const ratio = (distance - EDGE_FOG_FULL_DISTANCE)
    / (EDGE_FOG_CLEAR_DISTANCE - EDGE_FOG_FULL_DISTANCE)

  const clamped = Math.min(1, Math.max(0, ratio))
  /** 平滑一下，走近邊界的過程才不會像跨過一條線 */
  return 1 - clamped * clamped * (3 - 2 * clamped)
}
