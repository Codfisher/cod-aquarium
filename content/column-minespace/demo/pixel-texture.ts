import type { DynamicTexture, Scene } from '@babylonjs/core'
import type { BabylonModule } from './use-babylon-demo'

/**
 * 範例用的像素貼圖
 *
 * 文章裡的範例不該去下載材質包，那是好幾 MB 的東西。
 * 這裡照 Minespace 本體的做法直接在 Canvas 上畫，
 * 十六格見方、最近鄰取樣，看起來就是那個味道
 */

/** 一格貼圖是幾像素，與本體同一個規格 */
export const TEXTURE_SIZE = 16

interface PixelTextureParam {
  babylon: BabylonModule;
  scene: Scene;
  name: string;
  /** 有沒有 mipmap，鏤空貼圖要關掉 */
  hasMipmap?: boolean;
}

function createCanvasTexture(
  { babylon, scene, name, hasMipmap = true }: PixelTextureParam,
  draw: (context: CanvasRenderingContext2D) => void,
): DynamicTexture {
  const texture = new babylon.DynamicTexture(
    name,
    { width: TEXTURE_SIZE, height: TEXTURE_SIZE },
    scene,
    hasMipmap,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )

  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  draw(context)
  texture.update()

  return texture
}

/**
 * 固定亂數
 *
 * 每次重畫都要長得一模一樣，不然切換開關時整片貼圖會跟著換一副樣子，
 * 讀者會以為是效果造成的差別
 */
function createSeededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** 石頭：帶顆粒的灰 */
export function createStoneTexture(param: PixelTextureParam): DynamicTexture {
  return createCanvasTexture(param, (context) => {
    const random = createSeededRandom(20260816)

    for (let x = 0; x < TEXTURE_SIZE; x++) {
      for (let y = 0; y < TEXTURE_SIZE; y++) {
        const shade = 118 + Math.floor(random() * 42)
        context.fillStyle = `rgb(${shade}, ${shade}, ${shade + 4})`
        context.fillRect(x, y, 1, 1)
      }
    }

    /** 幾道深色的石縫，視差與法線的差別要靠它才看得出來 */
    context.fillStyle = 'rgba(72, 72, 78, 0.85)'
    context.fillRect(0, 5, TEXTURE_SIZE, 1)
    context.fillRect(0, 11, TEXTURE_SIZE, 1)
    context.fillRect(4, 0, 1, 5)
    context.fillRect(10, 6, 1, 5)
    context.fillRect(2, 12, 1, 4)
  })
}

/** 沙：禪庭的白沙，明度很高 */
export function createSandTexture(param: PixelTextureParam): DynamicTexture {
  return createCanvasTexture(param, (context) => {
    const random = createSeededRandom(19911014)

    for (let x = 0; x < TEXTURE_SIZE; x++) {
      for (let y = 0; y < TEXTURE_SIZE; y++) {
        const shade = 228 + Math.floor(random() * 22)
        context.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade - 10})`
        context.fillRect(x, y, 1, 1)
      }
    }
  })
}

/** 木頭：直向的紋理 */
export function createWoodTexture(param: PixelTextureParam): DynamicTexture {
  return createCanvasTexture(param, (context) => {
    const random = createSeededRandom(880303)

    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const base = 128 + Math.floor(random() * 34)
      for (let y = 0; y < TEXTURE_SIZE; y++) {
        const shade = base + Math.floor(random() * 10) - 5
        context.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.72)}, ${Math.round(shade * 0.44)})`
        context.fillRect(x, y, 1, 1)
      }
    }
  })
}

/**
 * 一株草
 *
 * 鏤空貼圖，背景全透明。這是文章裡示範 alpha test、mipmap 與
 * 逐像素重新上色時的主角
 */
export function createPlantTexture(
  param: PixelTextureParam,
  color: [number, number, number] = [92, 158, 62],
): DynamicTexture {
  return createCanvasTexture({ ...param, hasMipmap: param.hasMipmap ?? false }, (context) => {
    const [red, green, blue] = color

    /** 每一根草各自的起點、高度與傾斜方向 */
    const bladeList: [number, number, number][] = [
      [3, 11, 0],
      [5, 14, 1],
      [8, 15, 0],
      [10, 12, -1],
      [12, 9, 1],
    ]

    for (const [startX, height, lean] of bladeList) {
      for (let step = 0; step < height; step++) {
        const x = startX + Math.round((step / height) * lean * 2)
        const y = TEXTURE_SIZE - 1 - step
        /** 越往上越亮，一根草才有明暗 */
        const ratio = 0.62 + (step / height) * 0.38
        context.fillStyle = `rgb(${Math.round(red * ratio)}, ${Math.round(green * ratio)}, ${Math.round(blue * ratio)})`
        context.fillRect(x, y, 1, 1)
      }
    }
  })
}

/**
 * 從一張貼圖算出法線圖
 *
 * 材質包附的法線圖是畫出來的，這裡沒有那種東西，
 * 所以直接把貼圖的亮度當成高度場，取相鄰像素的落差算斜率。
 *
 * RGB 存切線空間的法線、alpha 存高度，這正是 Babylon 的
 * bumpTexture 吃的排法，一個像素都不必改寫
 */
export function createNormalTexture(
  param: PixelTextureParam,
  source: DynamicTexture,
  strength = 2.4,
): DynamicTexture {
  const sourceContext = source.getContext() as CanvasRenderingContext2D
  const sourceData = sourceContext.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE).data

  const readHeight = (x: number, y: number) => {
    /** 繞回去，邊界才不會算出一圈假的斜面 */
    const wrappedX = ((x % TEXTURE_SIZE) + TEXTURE_SIZE) % TEXTURE_SIZE
    const wrappedY = ((y % TEXTURE_SIZE) + TEXTURE_SIZE) % TEXTURE_SIZE
    const index = (wrappedY * TEXTURE_SIZE + wrappedX) * 4

    return (
      sourceData[index]! * 0.2126
      + sourceData[index + 1]! * 0.7152
      + sourceData[index + 2]! * 0.0722
    ) / 255
  }

  return createCanvasTexture(param, (context) => {
    const imageData = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE)
    const { data } = imageData

    for (let y = 0; y < TEXTURE_SIZE; y++) {
      for (let x = 0; x < TEXTURE_SIZE; x++) {
        const slopeX = (readHeight(x - 1, y) - readHeight(x + 1, y)) * strength
        const slopeY = (readHeight(x, y - 1) - readHeight(x, y + 1)) * strength

        const length = Math.hypot(slopeX, slopeY, 1)
        const index = (y * TEXTURE_SIZE + x) * 4

        data[index] = Math.round(((slopeX / length) * 0.5 + 0.5) * 255)
        data[index + 1] = Math.round(((slopeY / length) * 0.5 + 0.5) * 255)
        data[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255)
        /** alpha 那一欄是高度，視差要靠它才開得起來 */
        data[index + 3] = Math.round(readHeight(x, y) * 255)
      }
    }

    context.putImageData(imageData, 0, 0)
  })
}

/**
 * 從一張貼圖算出高光圖
 *
 * 紅色通道是這個表面有多光滑。暗的地方是石縫，那裡最粗糙；
 * 亮的地方是打磨過的面，斜射的陽光會在上面亮起一條邊
 */
export function createSpecularTexture(
  param: PixelTextureParam,
  source: DynamicTexture,
): DynamicTexture {
  const sourceContext = source.getContext() as CanvasRenderingContext2D
  const sourceData = sourceContext.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE).data

  return createCanvasTexture(param, (context) => {
    const imageData = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE)
    const { data } = imageData

    for (let index = 0; index < data.length; index += 4) {
      const luminance = (
        sourceData[index]! * 0.2126
        + sourceData[index + 1]! * 0.7152
        + sourceData[index + 2]! * 0.0722
      ) / 255

      /** 拉開對比，石縫與平面才分得出來 */
      const smoothness = Math.round(Math.min(1, Math.max(0, (luminance - 0.35) * 2.2)) * 255)

      data[index] = smoothness
      data[index + 1] = smoothness
      data[index + 2] = smoothness
      data[index + 3] = 255
    }

    context.putImageData(imageData, 0, 0)
  })
}

/**
 * 把兩張圖合成一張
 *
 * 礦石就是這樣長出來的，石頭當底，
 * 礦點那張背景全透明的圖疊上去
 */
export function compositeTexture(
  param: PixelTextureParam,
  base: DynamicTexture,
  overlay: DynamicTexture,
): DynamicTexture {
  const baseData = (base.getContext() as CanvasRenderingContext2D)
    .getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  const overlayData = (overlay.getContext() as CanvasRenderingContext2D)
    .getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)

  return createCanvasTexture(param, (context) => {
    context.putImageData(baseData, 0, 0)

    /** 逐像素照 alpha 疊上去，等同 Canvas 的 drawImage */
    const merged = context.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
    const { data } = merged
    const overlayPixelList = overlayData.data

    for (let index = 0; index < data.length; index += 4) {
      const alpha = overlayPixelList[index + 3]! / 255
      if (alpha === 0)
        continue

      data[index] = Math.round(data[index]! * (1 - alpha) + overlayPixelList[index]! * alpha)
      data[index + 1] = Math.round(data[index + 1]! * (1 - alpha) + overlayPixelList[index + 1]! * alpha)
      data[index + 2] = Math.round(data[index + 2]! * (1 - alpha) + overlayPixelList[index + 2]! * alpha)
    }

    context.putImageData(merged, 0, 0)
  })
}

/**
 * 礦點
 *
 * 背景全透明，只有幾撮結晶。單獨看是一張破圖，
 * 疊在石頭上才成為一顆礦石
 */
export function createOreOverlayTexture(
  param: PixelTextureParam,
  color: [number, number, number],
): DynamicTexture {
  return createCanvasTexture({ ...param, hasMipmap: param.hasMipmap ?? false }, (context) => {
    const [red, green, blue] = color

    /** 幾撮不規則的結晶，排整齊就變成骰子了 */
    const clusterList: [number, number, number, number][] = [
      [2, 3, 3, 3],
      [7, 2, 2, 2],
      [9, 6, 4, 3],
      [3, 9, 3, 4],
      [11, 11, 3, 3],
      [6, 12, 2, 2],
    ]

    for (const [x, y, width, height] of clusterList) {
      context.fillStyle = `rgb(${red}, ${green}, ${blue})`
      context.fillRect(x, y, width, height)

      /** 左上角補一格亮面，結晶才有立體感 */
      context.fillStyle = `rgb(${Math.min(255, red + 60)}, ${Math.min(255, green + 60)}, ${Math.min(255, blue + 60)})`
      context.fillRect(x, y, 1, 1)
    }
  })
}

/**
 * 把貼圖染色
 *
 * 逐像素乘上倍率或重新上色，這正是 EP03 那一段在做的事。
 * 兩種模式的差別是文章的重點，所以這裡兩種都留著
 */
export function recolorTexture(
  param: PixelTextureParam,
  source: DynamicTexture,
  tint: [number, number, number],
  isRecolor: boolean,
): DynamicTexture {
  const sourceContext = source.getContext() as CanvasRenderingContext2D
  const sourceData = sourceContext.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)

  return createCanvasTexture({ ...param, hasMipmap: param.hasMipmap ?? false }, (context) => {
    const imageData = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE)
    const { data } = imageData
    data.set(sourceData.data)

    for (let index = 0; index < data.length; index += 4) {
      if (isRecolor) {
        /** 先取人眼加權的亮度，再乘上目標色 */
        const luminance = (
          data[index]! * 0.2126
          + data[index + 1]! * 0.7152
          + data[index + 2]! * 0.0722
        ) / 255

        data[index] = Math.min(255, luminance * 2 * tint[0] * 255)
        data[index + 1] = Math.min(255, luminance * 2 * tint[1] * 255)
        data[index + 2] = Math.min(255, luminance * 2 * tint[2] * 255)
        continue
      }

      data[index] = Math.min(255, data[index]! * tint[0])
      data[index + 1] = Math.min(255, data[index + 1]! * tint[1])
      data[index + 2] = Math.min(255, data[index + 2]! * tint[2])
    }

    context.putImageData(imageData, 0, 0)
  })
}
