import type { Scene } from '@babylonjs/core'
import { DynamicTexture } from '@babylonjs/core'

/** 貼圖邊長，光暈是糊的，一二八已經看不出取樣的階梯 */
const TEXTURE_SIZE = 128

/**
 * 漸層要切成幾段
 *
 * 這條曲線是彎的，而畫布的漸層停點之間走的是直線。
 * 段數太少會在每個停點上留下一個折角——那正是這整件事要避免的東西。
 * 三十二段之後每一段的轉折都小於一個色階
 */
const STOP_COUNT = 32

/**
 * 光暈的衰減曲線
 *
 * 這個函數的形狀不是隨便挑的，關鍵在於它在邊緣的**斜率也是零**。
 *
 * 一團加法混合的光暈疊在平滑的天空上時，最容易露餡的不是亮度本身，
 * 而是亮度變化的轉折。人眼會強化一階導數的不連續（馬赫帶效應）：
 * 一條線性的斜坡走到底突然變成零，即使兩側只差 1/255，
 * 那道界線照樣看得一清二楚——太陽外圍那個「淡淡的方形」、
 * 換成圓盤之後的「半透明的圓」，都是這同一條界線。
 *
 * (1 - t²)^n 這一族曲線在 t = 1 時值與斜率同時為零，
 * 於是光暈是「化開」的而不是「切斷」的，邊界無從察覺。
 *
 * 兩項相加：次方高的那項是緊的核心，次方低的那項鋪出長長的尾巴
 */
function measureFalloff(ratio: number): number {
  const base = Math.max(0, 1 - ratio * ratio)

  return 0.55 * base ** 8 + 0.45 * base ** 3
}

/**
 * 一團光暈的貼圖
 *
 * 衰減畫在顏色上而不是透明度上：這些光暈走的是相加混合，
 * 透明度在那條路上不起作用，只有顏色會被加上去。
 * 把該有的透明度先乘進顏色裡，一路收到全黑，
 * 黑色加上去等於沒加，暈開的效果自然就出來了
 */
export function createGlowTexture(
  name: string,
  scene: Scene,
  peakColor: readonly [number, number, number],
): DynamicTexture {
  const texture = new DynamicTexture(
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
    const intensity = measureFalloff(ratio)
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
