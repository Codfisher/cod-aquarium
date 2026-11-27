import { fbm2D } from '../../utils/noise'
import { WORLD_SIZE } from '../world/world-constants'

/**
 * 水上場景的島形
 *
 * 湖中島與海中沙島都是「一座島浮在水中央、回程門立在島的邊上」，
 * 岸線怎麼吃噪音、門前那一段怎麼拉直是同一套，只是半徑、噪音與門在哪一側不同。
 * 純資料：地形 worker 生方塊、渲染端擺音源與門都讀同一份，不引用 Babylon
 */

/** 岸線上的一層噪音，offset 讓兩座島用同一支噪音也長得不一樣 */
export interface IslandNoiseLayer {
  frequency: number;
  octaveCount: number;
  amplitude: number;
  offset?: number;
}

export interface IslandShapeConfig {
  center: { x: number; z: number };
  /** 岸線半徑（格），小於它是島 */
  radius: number;
  /** 岸線往內幾格是與水面齊平的灘，再往內才是高起來的地面 */
  beachWidth: number;
  /**
   * 兩軸的伸縮，預設都是 1（圓島）
   *
   * 乘在離中心的距離上：大於 1 的那一軸比較短，島就拉成橢圓。
   * 沙洲多半是被潮流拉長的，正圓一看就是公式畫的
   */
  stretchX?: number;
  stretchZ?: number;
  noiseList: readonly IslandNoiseLayer[];
  /** 回程門立在島的哪一側：門那一排是地面的最外一排，再往外是灘與水 */
  portalSide: 'north' | 'south';
  /**
   * 門前拉直的範圍
   *
   * 門框、木牌與燈籠都要落在同一排地面上，往外是一樣寬的灘：
   * 噪音的岸線可能讓一根門柱在草上、一根在沙上。
   * 拉直的是門那一排往內 inlandDepth 排、往外到灘外緣再一排，左右各 halfWidth 格；
   * 再往外 blend 格與原本的岸線混著接起來，看不出一個直角
   */
  apron: {
    halfWidth: number;
    inlandDepth: number;
    blend: number;
  };
}

export interface IslandShape {
  /** 回程門的門洞中心 */
  portalPoint: { x: number; z: number };
  /**
   * 某一點的「岸線距離」
   *
   * 小於 radius 是島，再減掉 beachWidth 以內是高起來的地面。
   * 門前那一段改成以門那一排為界的直線
   */
  measureShoreDistance: (x: number, z: number) => number;
  /**
   * 從島心沿 Z 往某一側走，岸線距離第一次超過 edgeRadius 的前一排
   *
   * 不經過門前的拉直，給擺在島外的東西（例如淺灘裡的鳥居）找岸用
   */
  findEdgeZ: (edgeRadius: number, side: 'north' | 'south') => number;
}

/** 往北是 -Z、往南是 +Z */
const SIDE_STEP_MAP = { north: -1, south: 1 } as const

export function createIslandShape(config: IslandShapeConfig): IslandShape {
  const { center, radius, beachWidth, noiseList, apron } = config
  const stretchX = config.stretchX ?? 1
  const stretchZ = config.stretchZ ?? 1
  const portalStep = SIDE_STEP_MAP[config.portalSide]
  /** 高起來的地面的外緣 */
  const groundRadius = radius - beachWidth

  /**
   * 只吃噪音的岸線距離
   *
   * 低頻的那層讓岸線有灣與岬，高頻的那層讓灘的邊緣不平整。
   * 只用幾何距離的話，島是一個完美的圓，一看就是公式畫的
   */
  function measureNaturalShoreDistance(x: number, z: number): number {
    let distance = Math.hypot((x - center.x) * stretchX, (z - center.z) * stretchZ)
    for (const layer of noiseList) {
      const offset = layer.offset ?? 0
      distance += fbm2D(x * layer.frequency + offset, z * layer.frequency - offset, layer.octaveCount, 0.5) * layer.amplitude
    }
    return distance
  }

  function findEdgeZ(edgeRadius: number, side: 'north' | 'south'): number {
    const step = SIDE_STEP_MAP[side]
    let z = center.z
    while (z + step >= 0 && z + step < WORLD_SIZE && measureNaturalShoreDistance(center.x, z + step) < edgeRadius) {
      z += step
    }
    return z
  }

  /** 門就立在地面的最外一排上。岸線吃噪音，固定一個半徑的話門可能落在灘上或內陸 */
  const portalPoint = { x: center.x, z: findEdgeZ(groundRadius, config.portalSide) }

  /** 門那一排往外是正：灘有 beachWidth 排，再一排是水 */
  function measureOutward(z: number): number {
    return (z - portalPoint.z) * portalStep
  }

  /** 某一點在拉直範圍裡佔多少（零到一），邊上那幾格漸漸退回原本的岸線 */
  function measureApronWeight(x: number, z: number): number {
    const along = Math.abs(x - portalPoint.x) - apron.halfWidth
    const outward = measureOutward(z)
    const across = outward >= 0
      ? outward - (beachWidth + 1)
      : -outward - apron.inlandDepth
    const overshoot = Math.max(along, across, 0)
    return Math.max(0, 1 - overshoot / apron.blend)
  }

  function measureShoreDistance(x: number, z: number): number {
    const natural = measureNaturalShoreDistance(x, z)
    const weight = measureApronWeight(x, z)
    if (weight === 0)
      return natural

    /** 門那一排是 groundRadius - 0.5（地面），每往外一排加一 */
    const outward = measureOutward(z)
    const straight = outward <= 0
      ? Math.min(natural, groundRadius - 0.5)
      : groundRadius - 0.5 + outward
    return natural + (straight - natural) * weight
  }

  return { portalPoint, measureShoreDistance, findEdgeZ }
}

/** 門立在東西兩側的島形設定：拉伸只收一個倍率，轉過去之後分不清哪一軸是哪一軸 */
export type SideIslandShapeConfig = Omit<IslandShapeConfig, 'portalSide' | 'stretchX' | 'stretchZ'> & {
  portalSide: 'east' | 'west';
}

/**
 * 回程門立在東側或西側的島形
 *
 * createIslandShape 只認南北兩側（門前拉直、找邊都是沿 Z 走）。
 * 東西兩側不另寫一份，把座標轉九十度餵進去：在轉過的座標裡門照樣立在「北」側，
 * 量距離時把世界座標換成轉過的座標、門的位置再換回世界座標。
 * 噪音是在轉過的座標上取樣，形狀與同一組設定的南北版不同，但同樣自然。
 *
 * - 東：轉過的 (u, v) = (z, 2·cx − x)，轉過的北（−v）就是世界的東（+x）
 * - 西：轉過的 (u, v) = (z, x)，轉過的北（−v）就是世界的西（−x）
 *
 * 兩種都讓島心落在轉過的 (cz, cx)，拉直的左右（轉過的 u）就是世界的 Z
 */
export function createSideIslandShape(config: SideIslandShapeConfig): Pick<IslandShape, 'portalPoint' | 'measureShoreDistance'> {
  const { center, portalSide } = config
  const isEast = portalSide === 'east'
  const toRotatedV = (x: number) => isEast ? center.x * 2 - x : x

  const rotated = createIslandShape({
    ...config,
    center: { x: center.z, z: center.x },
    portalSide: 'north',
  })

  return {
    portalPoint: {
      x: toRotatedV(rotated.portalPoint.z),
      z: rotated.portalPoint.x,
    },
    measureShoreDistance: (x, z) => rotated.measureShoreDistance(z, toRotatedV(x)),
  }
}
