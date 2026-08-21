import type { DynamicTexture, Scene } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 濕地反光用的天色貼圖
 *
 * 不做即時的螢幕空間反射，那要把場景多畫一次，成本跟濕地能佔的
 * 畫面比例完全不成比例。改用等距柱狀投影反射，貼圖只依視線的
 * 垂直角度變化，水平朝哪看色調都一樣
 */

/** 寬度沒有意義，等距柱狀投影的顏色只跟垂直角度有關 */
const TEXTURE_WIDTH = 4

/** 高度給六十四，漸層夠細看不出色階 */
const TEXTURE_HEIGHT = 64

export type SkyColor = [number, number, number]

export interface SkyPalette {
  zenith: SkyColor;
  mid: SkyColor;
  horizon: SkyColor;
}

/** 一天裡的幾個關鍵時刻，中間的顏色內插出來 */
const SKY_STOP_LIST: { at: number; palette: SkyPalette }[] = [
  {
    at: 0,
    palette: {
      zenith: [0.03, 0.05, 0.12],
      mid: [0.06, 0.08, 0.16],
      horizon: [0.1, 0.11, 0.18],
    },
  },
  {
    at: 0.25,
    palette: {
      zenith: [0.25, 0.35, 0.62],
      mid: [0.62, 0.45, 0.52],
      horizon: [0.95, 0.66, 0.48],
    },
  },
  {
    at: 0.5,
    palette: {
      zenith: [0.24, 0.48, 0.92],
      mid: [0.6, 0.78, 0.99],
      horizon: [0.95, 0.95, 0.93],
    },
  },
  {
    at: 0.75,
    palette: {
      zenith: [0.18, 0.22, 0.5],
      mid: [0.72, 0.4, 0.45],
      horizon: [0.99, 0.6, 0.35],
    },
  },
  {
    at: 1,
    palette: {
      zenith: [0.03, 0.05, 0.12],
      mid: [0.06, 0.08, 0.16],
      horizon: [0.1, 0.11, 0.18],
    },
  },
]

function lerpColor(from: SkyColor, to: SkyColor, ratio: number): SkyColor {
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
    from[2] + (to[2] - from[2]) * ratio,
  ]
}

/** 這個時刻的天色 */
export function measureSkyPalette(dayProgress: number): SkyPalette {
  const progress = Math.min(1, Math.max(0, dayProgress))

  for (let index = 0; index < SKY_STOP_LIST.length - 1; index++) {
    const current = SKY_STOP_LIST[index]!
    const next = SKY_STOP_LIST[index + 1]!
    if (progress > next.at)
      continue

    const ratio = (progress - current.at) / (next.at - current.at)

    return {
      zenith: lerpColor(current.palette.zenith, next.palette.zenith, ratio),
      mid: lerpColor(current.palette.mid, next.palette.mid, ratio),
      horizon: lerpColor(current.palette.horizon, next.palette.horizon, ratio),
    }
  }

  return SKY_STOP_LIST[SKY_STOP_LIST.length - 1]!.palette
}

export function createSkyReflectionTexture(babylon: BabylonModule, scene: Scene): DynamicTexture {
  const texture = new babylon.DynamicTexture(
    'wet-sky-reflection',
    { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
    scene,
    false,
  )
  /**
   * 固定在世界座標上
   *
   * 反光的是天空本身的顏色，鏡頭朝哪看都一樣。
   * 用 FIXED 那個變體，不隨鏡頭旋轉重新取樣
   */
  texture.coordinatesMode = babylon.Texture.FIXED_EQUIRECTANGULAR_MODE
  /** 反射一開始是關的，濕度從零開始淡入 */
  texture.level = 0

  return texture
}

function colorToCss(color: SkyColor): string {
  const [red, green, blue] = color

  return `rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)})`
}

/**
 * 依天色重畫這張貼圖
 *
 * 上半段是抬頭方向，天頂到地平線的漸層，中間再插一階中空色，
 * 晨昏那種丁香紫與洋紅才有地方待。下半段是低頭方向，
 * 沒有真的地面資料，填地平線色至少不會顯得突兀
 */
export function updateSkyReflectionTexture(texture: DynamicTexture, palette: SkyPalette): void {
  const context = texture.getContext() as CanvasRenderingContext2D
  const half = TEXTURE_HEIGHT / 2

  const gradient = context.createLinearGradient(0, 0, 0, half)
  gradient.addColorStop(0, colorToCss(palette.zenith))
  gradient.addColorStop(0.6, colorToCss(palette.mid))
  gradient.addColorStop(1, colorToCss(palette.horizon))
  context.fillStyle = gradient
  context.fillRect(0, 0, TEXTURE_WIDTH, half)

  context.fillStyle = colorToCss(palette.horizon)
  context.fillRect(0, half, TEXTURE_WIDTH, half)

  texture.update()
}
