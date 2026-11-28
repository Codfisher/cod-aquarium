import type { DriftFeature } from './realm-definition'

/**
 * 各大場景「招牌景象」掛在天上的哪個方位（純資料，不引用 Babylon）
 *
 * 招牌景象（見 realm-signature-kit）有一部分是固定掛在天球某個方向的：石殿遺址的環月、
 * 拓荒原的彗星、千頃麥浪的銀河…… 渲染端要知道往哪裡畫，神遊的運鏡也要知道往哪裡看，
 * 兩邊讀同一份數字才不會一個畫在北邊、一個往南看。
 *
 * 場景定義（含神遊的特色主體）會被主執行緒與地形 worker 一起引用，
 * 所以這一份不能碰 Babylon：只放角度與一個換算函式
 */

/** 天球上的一個方向：方位自北（−Z）往東（+X）量，仰角自地平線往上，都是弧度 */
export interface SkyAnchor {
  azimuth: number;
  elevation: number;
}

/** 石殿遺址的環月：掛在正北的坐像與東北的門闕之間，兩座巨像一左一右夾著它 */
export const RUINS_RINGED_MOON_ANCHOR: SkyAnchor = { azimuth: 0.33, elevation: 0.56 }

/** 拓荒原的彗星：西南方低空，彗尾往上甩 */
export const CAMPFIRE_COMET_ANCHOR: SkyAnchor = { azimuth: -2.2, elevation: 0.5 }

/** 千頃麥浪的銀河：從東南的地平線升起，銀心（最亮的那一段）在這個方向 */
export const WHEATFIELD_GALAXY_CORE_ANCHOR: SkyAnchor = { azimuth: 2.25, elevation: 0.62 }

/** 風露原流星雨的輻射點：流星都像是從這裡散出來的 */
export const MEADOW_METEOR_RADIANT_ANCHOR: SkyAnchor = { azimuth: 0.6, elevation: 0.95 }

/** 蟬雨深林的積雨雲：東邊的林稜後面長起來的一座雲塔 */
export const CICADA_CLOUD_TOWER_ANCHOR: SkyAnchor = { azimuth: 1.35, elevation: 0.36 }

/** 金葉林的雁行：雁群在西邊的低空橫越，這是牠們航線的中點 */
export const AUTUMN_GEESE_ANCHOR: SkyAnchor = { azimuth: -1.45, elevation: 0.46 }

/** 百囀林苑的椋鳥群：在北邊的樹冠上空盤旋變形 */
export const SONGBIRD_MURMURATION_ANCHOR: SkyAnchor = { azimuth: -0.35, elevation: 0.42 }

/** 神遊的靶最高立到這裡：世界只有四十格高 */
const SKY_TARGET_Y_MAX = 36

/**
 * 把天上的方向換成神遊看得懂的一個遠景主體
 *
 * 神遊的主體是世界座標上的一個點；天上的東西沒有位置，
 * 就在那個方位、離中心 distance 格遠的地方立一個看不見的靶，高度照仰角算。
 * 世界只有四十格高，靶再高神遊也對不到，所以壓在 SKY_TARGET_Y_MAX：
 * 鏡頭朝那個方位平平地望出去，仰角高的景象靠畫面上半部帶到
 */
export function createSkyDriftFeature(param: {
  name: string;
  anchor: SkyAnchor;
  center: { x: number; z: number };
  /** 場景地面的高度，仰角從這裡起算 */
  groundY: number;
  weight: number;
  /** 靶立在多遠，不給就一百一十格（遠景布景那一圈的距離） */
  distance?: number;
}): DriftFeature {
  const distance = param.distance ?? 110
  return {
    kind: 'vista',
    name: param.name,
    x: Math.round(param.center.x + Math.sin(param.anchor.azimuth) * distance),
    y: Math.min(SKY_TARGET_Y_MAX, Math.round(param.groundY + Math.tan(param.anchor.elevation) * distance)),
    z: Math.round(param.center.z - Math.cos(param.anchor.azimuth) * distance),
    size: 60,
    weight: param.weight,
    viewDistance: [60, 130],
  }
}
