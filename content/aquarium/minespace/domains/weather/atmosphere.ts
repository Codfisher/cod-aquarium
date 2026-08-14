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
  /** 平行光的強度倍率，陰天會壓低 */
  lightRatio: number;
  /**
   * 天光的強度倍率
   *
   * 與平行光分開。陰天不是「變暗」，是「光的來源換了」——
   * 太陽被雲蓋住，整片天空自己變成一盞巨大的柔光燈。
   * 兩者若共用同一個倍率，把平行光壓到陰影消失時，
   * 天光會跟著一起掉，整個世界暗成傍晚
   */
  ambientRatio: number;
  /**
   * 直射陽光還剩幾成，高光專用
   *
   * 高光與漫射該分開算。雲層把太陽打散之後，天空整片還是亮的——
   * 漫射光只是變柔、沒有消失；但高光需要一個「又小又亮的點」才照得出來，
   * 那正是雲最先抹掉的東西。
   *
   * 少了這一項，暴雨裡的濕地面照樣會被太陽打出一道刺眼的反光，
   * 水面也還在閃——明明頭頂連太陽的位置都看不出來
   */
  specularRatio: number;
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
  ambientRatio: 1,
  specularRatio: 1,
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
  /** 濕氣散開的光又落回地面，天光反而比晴天更均勻 */
  ambientRatio: 1.02,
  /** 濕氣把陽光散開一半，水面的反光跟著鈍掉 */
  specularRatio: 0.45,
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
  /**
   * 雨天太陽整個藏在雲後
   *
   * 只留一成二。厚雲之後已經沒有一個「方向」可言，
   * 地面上那些邊緣分明的影子在陰天本來就不該存在——
   * 平行光壓到這裡，影子淡到幾乎看不出來，剩下的一點
   * 只是讓物體還分得出上下面，不至於平成一張貼紙
   */
  lightRatio: 0.12,
  /**
   * 天光補回來
   *
   * 平行光壓到只剩一成二之後，地面幾乎沒有影子了——
   * 但整個世界不該跟著暗掉。厚雲把陽光散成一整片天空的柔光，
   * 落到地面的總光量其實掉得不多，只是「沒有方向」了。
   * 天光開到與晴天相當，畫面才會是「陰而亮」而不是「傍晚」
   */
  ambientRatio: 1.05,
  specularRatio: 0.05,
} as const

/**
 * 暴風雪的大氣參數
 *
 * 與雨天不同的不是「更暗」，是「更白」。
 * 雨天是一層冷灰壓在頭上，看得遠但看得暗；
 * 暴風雪相反——空氣裡飛滿了反光的雪，畫面是亮的，
 * 但十來格外什麼都沒有，那叫白矇。
 *
 * 所以霧色比晴天還白、能見度收得比沼澤更緊，
 * 而天光開到全庭最高：雪地會把光往上反射回來，
 * 站在雪裡的人是被上下夾著照的
 */
export const SNOW_ATMOSPHERE = {
  /** 比晴天的霧更白，接近純白但留一點冷 */
  fogColor: new Color3(0.88, 0.91, 0.95),
  /**
   * 與世界邊界那道白幕同一組數字
   *
   * 這裡試過 17 格、也試過 11 格，兩個都還「看得見這是一座庭園」——
   * 而暴風雪的定義正是看不見。整個專案裡唯一真正做到
   * 「什麼都看不到」的是邊界那道簾子（EDGE_FOG_START / EDGE_FOG_END），
   * 它存在的理由是要藏住循環世界的接縫，所以濃到極致。
   *
   * 吹雪野直接照抄那組數字：半格外開始褪色、六格外一片空白。
   * 三盞石燈籠因此一次只看得到一盞，而且是先看到暈、再看到燈。
   *
   * 兩者的用途完全不同（一個藏破綻、一個是主題），
   * 但「白到什麼都沒有」這件事只有一種寫法
   */
  fogStart: EDGE_FOG_START,
  fogEnd: EDGE_FOG_END,
  /** 太陽比雨天再藏得深一點，暴風雪裡沒有方向感 */
  lightRatio: 0.1,
  /** 雪把光從地面反回來，天光比任何一種天氣都高 */
  ambientRatio: 1.15,
  /** 雪面是漫射的，沒有一個能反出太陽的點 */
  specularRatio: 0.04,
} as const

export function createAtmosphereState(): AtmosphereState {
  return {
    fogColor: CLEAR_ATMOSPHERE.fogColor.clone(),
    fogStart: CLEAR_ATMOSPHERE.fogStart,
    fogEnd: CLEAR_ATMOSPHERE.fogEnd,
    lightRatio: CLEAR_ATMOSPHERE.lightRatio,
    ambientRatio: CLEAR_ATMOSPHERE.ambientRatio,
    specularRatio: CLEAR_ATMOSPHERE.specularRatio,
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
