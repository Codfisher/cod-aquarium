import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from './atmosphere'
import { DynamicTexture, Texture } from '@babylonjs/core'

/**
 * 貼圖尺寸
 *
 * 寬度沒有意義——等距柱狀投影的顏色只跟垂直角度有關，
 * 水平朝哪看都一樣，給到最小的四格只是不想留一張全空的寬條。
 * 高度給六十四，漸層夠細看不出色階
 */
const TEXTURE_WIDTH = 4
const TEXTURE_HEIGHT = 64

/** 多久重畫一次，天色變化很慢，不必逐幀重繪整張貼圖 */
export const SKY_REFLECTION_UPDATE_INTERVAL = 0.5

/**
 * 濕地反光用的天色貼圖
 *
 * 不做即時的螢幕空間反射：那要把場景多畫一次，成本跟這片禪庭
 * 濕地能佔的畫面比例完全不成比例。改用 Babylon 內建的等距柱狀投影
 * 反射（FIXED_EQUIRECTANGULAR_MODE）——貼圖只依視線的垂直角度變化，
 * 水平朝哪看色調都一樣。這張圖不負責「反光的到底是不是眼前那棵樹」，
 * 它只負責「濕地在斜視角會泛起一層天光」，而這正是雨後濕地
 * 最容易辨認的樣子
 */
export function createSkyReflectionTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture(
    'wet-sky-reflection',
    { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
    scene,
    false,
  )
  /**
   * 固定在世界座標上
   *
   * 反光的是天空本身的顏色，不是鏡頭朝哪看——用 FIXED 那個變體，
   * 不隨鏡頭旋轉重新取樣
   */
  texture.coordinatesMode = Texture.FIXED_EQUIRECTANGULAR_MODE
  /** 反射一開始是關的，濕度從零開始淡入，見 wetness.ts */
  texture.level = 0

  return texture
}

/**
 * 依日夜的天色重畫這張貼圖
 *
 * 上半段是抬頭方向：天頂到地平線的漸層，中間再插一階中空色，
 * 丁香紫與洋紅那種晨昏色調才有地方待。下半段是低頭方向——
 * 沒有真的地面資料，填地平線色至少不會顯得突兀，
 * 也不會讓濕地在低頭時反出一片不相干的顏色
 */
export function updateSkyReflectionTexture(
  texture: DynamicTexture,
  atmosphere: AtmosphereState,
): void {
  const context = texture.getContext() as CanvasRenderingContext2D
  const half = TEXTURE_HEIGHT / 2

  const gradient = context.createLinearGradient(0, 0, 0, half)
  gradient.addColorStop(0, colorToCss(atmosphere.skyZenithColor))
  gradient.addColorStop(0.6, colorToCss(atmosphere.skyMidColor))
  gradient.addColorStop(1, colorToCss(atmosphere.baseFogColor))
  context.fillStyle = gradient
  context.fillRect(0, 0, TEXTURE_WIDTH, half)

  context.fillStyle = colorToCss(atmosphere.baseFogColor)
  context.fillRect(0, half, TEXTURE_WIDTH, half)

  texture.update()
}

function colorToCss(color: { r: number; g: number; b: number }): string {
  const r = Math.round(Math.min(1, Math.max(0, color.r)) * 255)
  const g = Math.round(Math.min(1, Math.max(0, color.g)) * 255)
  const b = Math.round(Math.min(1, Math.max(0, color.b)) * 255)

  return `rgb(${r}, ${g}, ${b})`
}
