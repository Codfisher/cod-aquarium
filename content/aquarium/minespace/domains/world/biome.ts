import { fbm2D, smoothStep } from '../../utils/noise'
import { WORLD_SIZE } from './world-constants'

/** 生態區代號 */
export type BiomeId = 'meadow' | 'forest' | 'alpine' | 'swamp' | 'coast' | 'village' | 'rainvale'

export interface BiomeDefinition {
  id: Exclude<BiomeId, 'coast'>;
  /** 生態區中心座標 */
  center: { x: number; z: number };
  /** 影響半徑，超過此距離就完全不影響地形 */
  radius: number;
  /** 地表基準高度 */
  baseHeight: number;
  /** 地形起伏振幅 */
  amplitude: number;
  /** 噪音頻率，越大地形越破碎 */
  frequency: number;
}

/** 島嶼中心 */
export const ISLAND_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }
/**
 * 海岸剖面
 *
 * 由內往外分成四段：內陸、下坡、沙灘、淺灘。
 * 只給一個下沉半徑的話，地形會從內陸高度一路斜插進海裡，
 * 貼著海平面的乾沙灘只剩兩三格寬，走到海邊等於直接落水。
 * 中間多留一段幾乎是平的沙灘，海岸才走得起來。
 *
 * 海岸線本身還會被噪音推移正負七格，所以外圍要留一點餘裕
 */
/** 內陸地形開始往海岸下降 */
export const ISLAND_SHORE_RADIUS = 78
/** 降到沙灘高度，這裡開始是走得到的沙灘 */
export const ISLAND_BEACH_RADIUS = 86
/** 海岸線，沙灘在此沒入水中 */
export const ISLAND_WATER_RADIUS = 94
/** 地形完全沉入海床的半徑 */
export const ISLAND_SEA_RADIUS = 104
/** 空氣牆半徑，游到這裡就會被擋下來 */
export const ISLAND_WALL_RADIUS = 104

/**
 * 生態區佈局
 *
 * 全部塞在島嶼半徑內，走一趟就能聽完所有音景。
 * 海岸不在此列，它是環繞全島的環狀地帶，另外用島嶼衰減判斷。
 */
export const BIOME_LIST: BiomeDefinition[] = [
  /** 中央草原，出生點所在，當作整座島的底色 */
  {
    id: 'meadow',
    center: { x: 96, z: 100 },
    radius: 70,
    baseHeight: 16,
    amplitude: 2.5,
    frequency: 0.03,
  },
  /** 西北針闊葉混生林 */
  {
    id: 'forest',
    center: { x: 58, z: 62 },
    radius: 40,
    baseHeight: 19,
    amplitude: 3.5,
    frequency: 0.04,
  },
  /** 東北雪山 */
  {
    id: 'alpine',
    center: { x: 138, z: 62 },
    radius: 44,
    baseHeight: 31,
    amplitude: 7,
    frequency: 0.035,
  },
  /**
   * 西南雨谷，全島唯一常年下雨的地方
   *
   * 刻意做成被高地圍起來的窪地，走進去會有「進到另一個氣候」的感覺
   */
  {
    id: 'rainvale',
    center: { x: 44, z: 116 },
    radius: 30,
    baseHeight: 15,
    amplitude: 2,
    frequency: 0.05,
  },
  /** 南方沼澤 */
  {
    id: 'swamp',
    center: { x: 78, z: 148 },
    radius: 28,
    baseHeight: 12,
    amplitude: 1.2,
    frequency: 0.06,
  },
  /** 東南村莊 */
  {
    id: 'village',
    center: { x: 140, z: 124 },
    radius: 30,
    baseHeight: 16,
    amplitude: 0.8,
    frequency: 0.05,
  },
]

/** 雪線高度，超過此高度的地表會積雪 */
export const SNOW_LINE = 27

/**
 * 草原的底噪權重
 *
 * 權重最後會正規化，若某座標只被一個生態區沾到一點邊，
 * 正規化後就會變成 100% 那個生態區，交界處於是出現高度斷崖。
 * 讓草原永遠保有一份底噪，任何生態區的影響都能從 0 平順長上來。
 */
const MEADOW_BACKGROUND_WEIGHT = 0.12

/**
 * 取得座標到島嶼中心的距離
 *
 * 加上噪音讓海岸線彎彎曲曲，不然會是一個完美的圓，一看就是電腦畫的
 */
export function getIslandDistance(x: number, z: number): number {
  return Math.hypot(x - ISLAND_CENTER.x, z - ISLAND_CENTER.z)
    + fbm2D(x * 0.018, z * 0.018, 3, 0.5) * 7
}

/**
 * 島嶼衰減係數：1 為內陸，0 為海岸線
 *
 * 判斷「有多內陸」用的，植被與生態區判定都靠它。
 * 地形高度另外由海岸剖面決定，不再直接吃這個係數
 */
export function getIslandFalloff(x: number, z: number): number {
  const distance = getIslandDistance(x, z)

  return 1 - smoothStep(
    (distance - ISLAND_SHORE_RADIUS) / (ISLAND_WATER_RADIUS - ISLAND_SHORE_RADIUS),
  )
}

/**
 * 計算某個座標受到各生態區的影響權重
 *
 * 權重採「距離越近越重」的線性衰減再平方，
 * 讓交界處自然過渡、中心處保有各自個性。
 */
export function getBiomeWeightList(x: number, z: number): { biome: BiomeDefinition; weight: number }[] {
  const weightList = BIOME_LIST.map((biome) => {
    const deltaX = x - biome.center.x
    const deltaZ = z - biome.center.z
    const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ)
    const ratio = Math.max(0, 1 - distance / biome.radius)
    const weight = ratio * ratio

    return {
      biome,
      weight: biome.id === 'meadow'
        ? Math.max(weight, MEADOW_BACKGROUND_WEIGHT)
        : weight,
    }
  })

  const total = weightList.reduce((sum, item) => sum + item.weight, 0)

  return weightList.map((item) => ({ ...item, weight: item.weight / total }))
}

/** 取得影響力最大的生態區 */
export function getDominantBiomeId(x: number, z: number): BiomeId {
  /** 沙灘以外都算陸地，海岸地帶就從沙灘起算 */
  if (getIslandDistance(x, z) >= ISLAND_BEACH_RADIUS) {
    return 'coast'
  }

  return getBiomeWeightList(x, z)
    .reduce((best, item) => (item.weight > best.weight ? item : best))
    .biome
    .id
}
