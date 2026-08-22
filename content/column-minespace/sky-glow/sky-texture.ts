import type { DynamicTexture, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 天體貼圖
 *
 * 太陽、月亮與星空都是在 Canvas 上畫好再交給 Babylon。
 * 邊長十六格，與方塊世界的其他貼圖同一個規格
 */

/** 日月貼圖的邊長 */
export const SKY_BODY_TEXTURE_SIZE = 16

/** 月面要畫到哪幾階 */
export interface MoonFaceOption {
  /** 暗一階的月海 */
  seaVisible?: boolean;
  /** 再暗一階的坑 */
  craterVisible?: boolean;
  /** 右下角壓暗的那一塊 */
  shadeVisible?: boolean;
  /** 最近鄰取樣，關掉就換成雙線性 */
  isNearest?: boolean;
}

/** 月海的位置與大小，刻意不規則也不對稱 */
const MOON_SEA_LIST: [number, number, number, number][] = [
  [2, 3, 5, 4],
  [8, 2, 3, 3],
  [10, 7, 4, 5],
  [1, 9, 3, 3],
  [5, 11, 4, 3],
  [12, 1, 2, 2],
]

/** 落在月海裡面的坑 */
const MOON_CRATER_LIST: [number, number, number, number][] = [
  [3, 4, 2, 2],
  [11, 9, 2, 2],
  [6, 12, 2, 1],
  [2, 10, 1, 1],
]

/**
 * 固定亂數
 *
 * 星點每次都要落在同一批位置，不然切換開關時整片星空換一副樣子，
 * 讀者會以為是效果造成的差別
 */
function createSeededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296

    return state / 4294967296
  }
}

/**
 * 方形的太陽
 *
 * 整片填滿的白，沒有任何細節。方塊世界的天上不該有圓的東西，
 * 太陽本體就是一塊亮到發白的方塊
 */
export function createSunTexture(
  babylon: BabylonModule,
  scene: Scene,
  name: string,
): DynamicTexture {
  const size = SKY_BODY_TEXTURE_SIZE
  const texture = new babylon.DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )

  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.fillStyle = 'rgb(255, 250, 230)'
  context.fillRect(0, 0, size, size)
  texture.update()

  return texture
}

/**
 * 方形的月亮
 *
 * 與太陽一樣是填滿的方形，差別在表面。月亮有月海、坑與暗角三階明暗，
 * 冷色調也與太陽的暖白分得開，同樣是方塊卻一眼認得出誰是誰
 */
export function createMoonTexture(
  babylon: BabylonModule,
  scene: Scene,
  name: string,
  option: MoonFaceOption = {},
): DynamicTexture {
  const {
    seaVisible = true,
    craterVisible = true,
    shadeVisible = true,
    isNearest = true,
  } = option

  const size = SKY_BODY_TEXTURE_SIZE
  const texture = new babylon.DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    false,
    isNearest ? babylon.Texture.NEAREST_SAMPLINGMODE : babylon.Texture.BILINEAR_SAMPLINGMODE,
  )

  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false

  /** 底色，偏冷的月白 */
  context.fillStyle = 'rgb(226, 233, 250)'
  context.fillRect(0, 0, size, size)

  if (seaVisible) {
    context.fillStyle = 'rgb(196, 206, 231)'
    for (const [x, y, width, height] of MOON_SEA_LIST) {
      context.fillRect(x, y, width, height)
    }
  }

  if (craterVisible) {
    context.fillStyle = 'rgb(170, 181, 209)'
    for (const [x, y, width, height] of MOON_CRATER_LIST) {
      context.fillRect(x, y, width, height)
    }
  }

  /** 一整片同亮度的方塊看起來是平的，一角暗下去才有球的錯覺 */
  if (shadeVisible) {
    context.fillStyle = 'rgba(120, 132, 164, 0.32)'
    context.fillRect(9, 12, 7, 4)
    context.fillRect(13, 8, 3, 4)
  }

  texture.update()

  return texture
}

/** 星空要畫幾顆星、其中幾成是又大又亮的那種 */
export interface StarFieldOption {
  /** 貼圖邊長 */
  size?: number;
  /** 星點總數 */
  starCount?: number;
  /** 兩格寬、幾乎滿格亮的那批星，占全部的比例 */
  brightRatio?: number;
}

/**
 * 星空
 *
 * 底是全黑，只有星點是亮的。這張圖走相加混合疊在天空前面，
 * 黑色加上去等於沒加，於是只有星點會浮出來
 */
export function createStarTexture(
  babylon: BabylonModule,
  scene: Scene,
  name: string,
  option: StarFieldOption = {},
): DynamicTexture {
  const {
    size = 512,
    starCount = 460,
    brightRatio = 0.1,
  } = option

  const texture = new babylon.DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    true,
  )

  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = '#000000'
  context.fillRect(0, 0, size, size)

  const random = createSeededRandom(20260818)
  for (let index = 0; index < starCount; index++) {
    const x = Math.floor(random() * size)
    const y = Math.floor(random() * size)
    /** 大部分是暗的小星，偶爾幾顆亮而大的，疏密才有層次 */
    const isBright = random() < brightRatio
    const brightness = isBright ? 0.85 + random() * 0.15 : 0.25 + random() * 0.45
    const pixelSize = isBright ? 2 : 1

    context.fillStyle = `rgba(255, 252, 242, ${brightness})`
    context.fillRect(x, y, pixelSize, pixelSize)
  }
  texture.update()

  return texture
}

/**
 * 天體共用的材質
 *
 * 貼圖決定形狀與顏色，自發光的顏色決定它此刻該露出多少、該染成什麼色。
 * 貼圖掛在 diffuseTexture，關掉光照之後畫面上就只剩「自發光乘上貼圖」
 */
export function createSkyBodyMaterial(
  babylon: BabylonModule,
  scene: Scene,
  name: string,
  texture: DynamicTexture,
): StandardMaterial {
  const material = new babylon.StandardMaterial(name, scene)

  material.diffuseTexture = texture
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(1, 1, 1)
  material.disableLighting = true
  material.fogEnabled = false
  material.backFaceCulling = false
  material.alphaMode = babylon.Constants.ALPHA_ADD
  /** 相加混合要走半透明那條路才生效，alpha 得比 1 小一點點 */
  material.alpha = 0.999
  /** 天體是天空的一部分，不留下深度，雲才蓋得住它 */
  material.disableDepthWrite = true

  return material
}
