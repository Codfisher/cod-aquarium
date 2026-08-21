import type { BabylonModule } from './use-babylon-demo'

/** 貼圖邊長。光暈是糊的，一二八已經看不出取樣的階梯 */
const TEXTURE_SIZE = 128

/** 漸層要切成幾段。段數太少，每個停點上都會留下一個折角 */
const STOP_COUNT = 32

export type FalloffKind = 'linear' | 'smooth'

/**
 * 兩種衰減曲線
 *
 * linear 是最直覺的寫法，從中心的一路直線降到邊緣的零。
 * smooth 走的是 (1 - t²)^n，它在邊緣的值與斜率同時是零。
 *
 * 文章裡的範例二就是拿這兩條並排，看邊界差在哪裡
 */
export function measureFalloff(ratio: number, kind: FalloffKind): number {
  if (kind === 'linear') {
    return Math.max(0, 1 - ratio)
  }

  const base = Math.max(0, 1 - ratio * ratio)

  return 0.55 * base ** 8 + 0.45 * base ** 3
}

/**
 * 畫一張光暈貼圖
 *
 * 衰減畫在顏色上而不是透明度上：光暈走的是相加混合，
 * 透明度在那條路上不起作用，只有顏色會被加上去。
 * 把該有的透明度先乘進顏色裡、一路收到全黑，
 * 黑色加上去等於沒加，暈開的效果自然就出來了
 */
export function createGlowTexture(
  babylon: BabylonModule,
  scene: import('@babylonjs/core').Scene,
  name: string,
  peakColor: readonly [number, number, number],
  kind: FalloffKind = 'smooth',
) {
  const texture = new babylon.DynamicTexture(
    name,
    { width: TEXTURE_SIZE, height: TEXTURE_SIZE },
    scene,
    false,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  const center = TEXTURE_SIZE / 2
  const gradient = context.createRadialGradient(center, center, 0, center, center, center)

  const [peakRed, peakGreen, peakBlue] = peakColor
  for (let index = 0; index <= STOP_COUNT; index++) {
    const ratio = index / STOP_COUNT
    const intensity = measureFalloff(ratio, kind)
    gradient.addColorStop(
      ratio,
      `rgb(${Math.round(peakRed * intensity)}, ${Math.round(peakGreen * intensity)}, ${Math.round(peakBlue * intensity)})`,
    )
  }

  context.fillStyle = gradient
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  texture.update()

  return texture
}

/**
 * 一份設定好相加混合的光暈材質
 *
 * 這幾行是光暈之所以是光暈的關鍵，文章裡逐項解釋
 */
export function createGlowMaterial(
  babylon: BabylonModule,
  scene: import('@babylonjs/core').Scene,
  name: string,
  texture: import('@babylonjs/core').DynamicTexture,
) {
  const material = new babylon.StandardMaterial(name, scene)

  material.diffuseTexture = texture
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(1, 1, 1)
  /** 不吃光照，畫面上的顏色就只剩自發光乘上貼圖 */
  material.disableLighting = true
  material.backFaceCulling = false
  material.alphaMode = babylon.Constants.ALPHA_ADD
  /** 相加混合要走半透明那條路才生效，alpha 得比 1 小一點點 */
  material.alpha = 0.999
  /** 暈是空氣裡的一團光，不該擋住它後面的東西 */
  material.disableDepthWrite = true

  return material
}
