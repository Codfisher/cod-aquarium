import type { Scene } from '@babylonjs/core'
import { DynamicTexture, Texture } from '@babylonjs/core'

/**
 * 建立一個唯美的漸層紋理
 * @param scene Babylon 場景
 * @param colors 漸層顏色陣列 (CSS 顏色字串)，例如 ['#ff9a9e', '#fad0c4']
 * @param isVertical 是否為垂直漸層 (預設 true: 上到下, false: 左到右)
 */
export function createAestheticGradientTexture(scene: Scene, colors: string[], isVertical: boolean = true): DynamicTexture {
  // 1. 建立一個動態紋理 (寬度不需要太大，256px 足夠平滑)
  const width = isVertical ? 32 : 256
  const height = isVertical ? 256 : 32
  const texture = new DynamicTexture('aestheticGradient', { width, height }, scene, false)

  // 2. 取得畫布上下文
  const ctx = texture.getContext()

  // 3. 建立線性漸層物件
  // 如果是垂直：從 (0,0) 到 (0, height)
  // 如果是水平：從 (0,0) 到 (width, 0)
  const gradient = isVertical
    ? ctx.createLinearGradient(0, 0, 0, height)
    : ctx.createLinearGradient(0, 0, width, 0)

  // 4. 加入顏色停損點 (Color Stops)
  colors.forEach((color, index) => {
    // 計算位置 (0.0 ~ 1.0)
    const offset = index / (colors.length - 1)
    gradient.addColorStop(offset, color)
  })

  // 5. 填滿畫布
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // 6. 更新紋理 (重要！否則會是黑的)
  texture.update()

  // 7. 設定紋理環繞方式 (避免邊緣出現怪線)
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE

  return texture
}

// 建立一個讓所有顏色都能用的「陰影遮罩」漸層
export function createShadowGradient(scene: Scene): DynamicTexture {
  // 寬度小，高度長 (適合垂直漸層)
  const texture = new DynamicTexture('shadowGradient', { width: 32, height: 256 }, scene, false)
  const ctx = texture.getContext()

  // 建立垂直漸層 (上 -> 下)
  const gradient = ctx.createLinearGradient(0, 0, 0, 256)

  // --- 調色關鍵 ---
  // 上方 (0.0): 純白色 (保持原本顏色的亮度)
  gradient.addColorStop(0, '#FFFFFF')

  // 中間 (0.5): 稍微變柔和
  gradient.addColorStop(0.4, '#F0F0F0')

  // 下方 (1.0): 淺灰色 (讓底部稍微變暗，製造漸層感)
  // 不要用黑色，不然會看起來髒髒的。建議用 #CCCCCC 或 #AAAAAA
  gradient.addColorStop(1, '#BBBBBB')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 256)
  texture.update()

  return texture
}
