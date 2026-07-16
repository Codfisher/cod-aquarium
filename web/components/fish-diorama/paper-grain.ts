/** 紙紋產生器 — 共用 Blob URL 快取。
 *
 * 移植自 project-mcdonald 的 surface-grain 並改為 3D 材質用途：
 * - 紙紋由多層 turbulence 噪點加權混合（大尺度紙漿斑駁 + 細顆粒 tooth + 方向性纖維），
 *   單層純噪點每像素獨立隨機、看起來像電視雜訊，多尺度疊加才像紙。
 * - 每層各自是一張只含單一 feTurbulence 的 SVG；不合併成複合 filter chain，
 *   iOS Safari 對複合 filter 會在 Image 解析時同步阻塞主執行緒。
 * - 輸出為「灰階」tile（中灰 0.5 為中性），供材質外掛以三平面投影取樣後
 *   乘進表面顏色；不做 CSS 疊加用的 soft-light 預解算。
 */

/** tile 邊長（px）。粗紋層的雲狀斑駁尺度大，tile 太小會看出重複週期 */
export const GRAIN_TILE_SIZE = 512

interface NoiseLayer {
  /** feTurbulence baseFrequency；給 'x y' 兩個值可做方向性紋理（纖維層用） */
  frequency: string;
  octaves: number;
  seed: number;
  /** 混合權重，會自動正規化 */
  weight: number;
}

const noiseLayerList: readonly NoiseLayer[] = [
  // 粗紋：紙漿密度的雲狀斑駁（紙質感的主體）
  { frequency: '0.04', octaves: 5, seed: 13, weight: 0.5 },
  // 細紋：紙面顆粒（tooth）
  { frequency: '0.35', octaves: 2, seed: 7, weight: 0.3 },
  // 纖維：橫向細長纖維（x 頻率低 → 水平拉長）
  { frequency: '0.012 0.22', octaves: 2, seed: 3, weight: 0.2 },
]

// filter region 強制等於 rect：feTurbulence 的 stitchTiles 依 filter region 對齊邊界，
// 預設外擴 10% 會讓 rect 切到非邊界位置造成接縫
function buildNoiseSvg(layer: NoiseLayer): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_TILE_SIZE}' height='${GRAIN_TILE_SIZE}'>
  <filter id='wc' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='${layer.frequency}' numOctaves='${layer.octaves}' seed='${layer.seed}' stitchTiles='stitch'/>
    <feColorMatrix type='matrix' values='0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1'/>
  </filter>
  <rect width='${GRAIN_TILE_SIZE}' height='${GRAIN_TILE_SIZE}' filter='url(#wc)'/>
</svg>`
}

/** CSS 疊加紋理的紙底色變體：明暗模式的背景色差異大，
 * soft-light 必須對各自的底色解算，拿淺色版貼深背景會像髒污灰斑
 */
export type GrainPaperVariant = 'dark' | 'light'

/** 解算 soft-light 用的紙底色（貼近箱庭兩種模式的漸層背景） */
const paperRgbMap: Record<GrainPaperVariant, readonly [number, number, number]> = {
  light: [242, 248, 245],
  dark: [35, 52, 61],
}

/** CSS 疊加版的紋理濃度（以中灰為軸縮放起伏）。
 * 淺色底解算出的 alpha 天生偏低，對比拉高地板紋理才讀得到，
 * 上方背景層再用 --grain-background-opacity 壓回清爽濃度；
 * 深色底解算出的 alpha 天生偏高，對比要壓低很多才不會像迷彩斑
 */
const cssGrainContrastMap: Record<GrainPaperVariant, number> = {
  light: 1.8,
  dark: 0.5,
}

function scheduleIdle(callback: () => void): void {
  // iOS Safari 沒有 requestIdleCallback，退而求其次用 setTimeout
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback)
  }
  else {
    setTimeout(callback, 50)
  }
}

function loadNoiseImage(layer: NoiseLayer): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = (event) => {
      reject(new Error(`grain noise image load failed: ${String(event)}`))
    }
    image.onload = () => resolve(image)
    image.src = `data:image/svg+xml;utf8,${encodeURIComponent(buildNoiseSvg(layer))}`
  })
}

/** 多層噪點混合成灰階 canvas（共用單例，兩種輸出都由此而來） */
let pendingGrayscaleCanvas: Promise<HTMLCanvasElement> | null = null

function getGrayscaleCanvas(): Promise<HTMLCanvasElement> {
  if (pendingGrayscaleCanvas) {
    return pendingGrayscaleCanvas
  }
  pendingGrayscaleCanvas = new Promise<HTMLCanvasElement>((resolve, reject) => {
    scheduleIdle(() => {
      Promise.all(noiseLayerList.map((layer) => loadNoiseImage(layer)))
        .then((imageList) => {
          const canvas = document.createElement('canvas')
          canvas.width = GRAIN_TILE_SIZE
          canvas.height = GRAIN_TILE_SIZE
          const context = canvas.getContext('2d')
          if (!context) {
            reject(new Error('grain canvas 2d context unavailable'))
            return
          }
          // 依權重把各層噪點混成加權平均：第 i 層以
          // weight_i / (weight_0 + … + weight_i) 的 globalAlpha 疊上去
          let accumulatedWeight = 0
          imageList.forEach((image, index) => {
            const weight = noiseLayerList[index]!.weight
            accumulatedWeight += weight
            context.globalAlpha = weight / accumulatedWeight
            context.drawImage(image, 0, 0, GRAIN_TILE_SIZE, GRAIN_TILE_SIZE)
          })
          context.globalAlpha = 1
          resolve(canvas)
        })
        .catch(reject)
    })
  })
  return pendingGrayscaleCanvas
}

function convertCanvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('grain canvas toBlob returned null'))
        return
      }
      resolve(URL.createObjectURL(blob))
    })
  })
}

/** W3C compositing spec 的 soft-light 公式（單一 channel，輸入輸出皆 0 ~ 1） */
function applySoftLight(backdrop: number, source: number): number {
  if (source <= 0.5) {
    return backdrop - (1 - 2 * source) * backdrop * (1 - backdrop)
  }
  const darkness = backdrop <= 0.25
    ? ((16 * backdrop - 12) * backdrop + 4) * backdrop
    : Math.sqrt(backdrop)
  return backdrop + (2 * source - 1) * (darkness - backdrop)
}

/** 建 256 階灰 → RGBA 查表：對每個灰階值解算
 * 「normal 合成 (color, alpha) over 紙底色 ＝ soft-light(紙底色, 灰階)」，
 * 讓 CSS 疊加只需普通 alpha 合成、不需 mix-blend-mode
 */
function buildBakedLookupTable(variant: GrainPaperVariant): Uint8ClampedArray {
  const paperList = paperRgbMap[variant].map((channel) => channel / 255)
  const contrast = cssGrainContrastMap[variant]
  const table = new Uint8ClampedArray(256 * 4)
  for (let gray = 0; gray < 256; gray++) {
    const source = Math.min(1, Math.max(0, 0.5 + (gray / 255 - 0.5) * contrast))
    const deltaList = paperList.map((paper) => applySoftLight(paper, source) - paper)
    let alpha = 0
    for (let channel = 0; channel < 3; channel++) {
      const paper = paperList[channel]!
      const delta = deltaList[channel]!
      // 把該 channel 推到目標值所需的最小 alpha（往白或往黑）
      const required = delta >= 0
        ? (paper >= 1 ? 0 : delta / (1 - paper))
        : -delta / paper
      alpha = Math.max(alpha, required)
    }
    const offset = gray * 4
    if (alpha <= 0) {
      table[offset + 3] = 0
      continue
    }
    for (let channel = 0; channel < 3; channel++) {
      table[offset + channel] = Math.round((paperList[channel]! + deltaList[channel]! / alpha) * 255)
    }
    table[offset + 3] = Math.round(alpha * 255)
  }
  return table
}

let pendingTileUrl: Promise<string> | null = null
const pendingCssUrlMap = new Map<GrainPaperVariant, Promise<string>>()

/** 灰階紙紋 tile 的 Blob URL（3D 材質三平面投影取樣用，中灰 0.5 為中性）。
 * rasterize 延後到 idle 才做；失敗時 reject — 呼叫端自行 catch 並降級。
 */
export function getGrainTileBlobUrl(): Promise<string> {
  if (pendingTileUrl) {
    return pendingTileUrl
  }
  pendingTileUrl = getGrayscaleCanvas().then((canvas) => convertCanvasToBlobUrl(canvas))
  return pendingTileUrl
}

/** CSS 疊加用紙紋 tile 的 Blob URL：soft-light 對指定變體的紙底色預解算成
 * 半透明 RGBA，鋪在漸層背景上時只需普通 alpha 合成。
 */
export function getGrainCssBlobUrl(variant: GrainPaperVariant = 'light'): Promise<string> {
  const pendingUrl = pendingCssUrlMap.get(variant)
  if (pendingUrl) {
    return pendingUrl
  }
  const nextUrl = getGrayscaleCanvas().then((sourceCanvas) => {
    const canvas = document.createElement('canvas')
    canvas.width = GRAIN_TILE_SIZE
    canvas.height = GRAIN_TILE_SIZE
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('grain canvas 2d context unavailable')
    }
    context.drawImage(sourceCanvas, 0, 0)
    const imageData = context.getImageData(0, 0, GRAIN_TILE_SIZE, GRAIN_TILE_SIZE)
    const table = buildBakedLookupTable(variant)
    const data = imageData.data
    for (let index = 0; index < data.length; index += 4) {
      const offset = data[index]! * 4
      data[index] = table[offset]!
      data[index + 1] = table[offset + 1]!
      data[index + 2] = table[offset + 2]!
      data[index + 3] = table[offset + 3]!
    }
    context.putImageData(imageData, 0, 0)
    return convertCanvasToBlobUrl(canvas)
  })
  pendingCssUrlMap.set(variant, nextUrl)
  return nextUrl
}
