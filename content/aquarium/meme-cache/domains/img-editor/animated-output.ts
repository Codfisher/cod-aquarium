import { applyPalette, GIFEncoder, quantize } from 'gifenc'

/**
 * GIF 輸出的最長邊。
 *
 * GIF 逐格存索引又沒有跨影格預測，壓縮率遠不如動態 webp，
 * 尺寸不收斂檔案會大到分享不出去
 */
export const GIF_MAX_SIZE = 480

/**
 * GIF 輸出的最小長邊。
 *
 * 底圖放大換不到細節，但文字是即時算繪的，跟著縮下去會糊到看不清楚
 */
export const GIF_MIN_SIZE = 420

/** 目標檔案大小，超過就降一階畫質重編 */
const TARGET_BYTE_SIZE = 400 * 1024

/**
 * 由高到低的畫質階梯。最後一階不論多大都會採用。
 *
 * 先砍色數再砍影格：色數在梗圖這種平坦畫面上砍到 64 幾乎看不出來，
 * 影格一少動作就開始頓
 */
const QUALITY_STEP_LIST = [
  { colorCount: 128, maxFrameCount: Number.POSITIVE_INFINITY },
  { colorCount: 96, maxFrameCount: Number.POSITIVE_INFINITY },
  { colorCount: 64, maxFrameCount: Number.POSITIVE_INFINITY },
  { colorCount: 64, maxFrameCount: 18 },
  { colorCount: 48, maxFrameCount: 14 },
]

/** 建色盤時的取樣間隔，把所有像素都拿去量化太慢 */
const PALETTE_SAMPLE_STEP = 7

/** 影格間隔缺漏時的預設值，比照瀏覽器對 gif 的處理 */
const DEFAULT_FRAME_DELAY = 100

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameSprite {
  image: HTMLImageElement;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  delayList: number[];
}

/**
 * 載入影格長圖。
 *
 * 瀏覽器沒有通用的動圖逐格解碼 API（ImageDecoder 只有 Chromium 系有），
 * 故改讀建置時另存的縱向長圖，用 canvas 自己裁格
 */
export async function loadFrameSprite(file: string, delayList: number[]): Promise<FrameSprite> {
  const frameCount = delayList.length
  if (frameCount < 1) {
    throw new Error('缺少影格資料')
  }

  const image = new Image()
  image.src = `/meme-sprites/${file}`
  await image.decode()

  const frameHeight = image.naturalHeight / frameCount
  if (!Number.isInteger(frameHeight)) {
    throw new TypeError(`影格長圖與影格資料對不上：${image.naturalHeight} / ${frameCount}`)
  }

  return {
    image,
    frameCount,
    frameWidth: image.naturalWidth,
    frameHeight,
    delayList,
  }
}

export interface EncodeGifOptions {
  sprite: FrameSprite;
  /**
   * 每個影格的上層內容，透明背景，長度需與影格數相同。
   *
   * 文字可設顯示區間，各影格的上層內容未必一樣；
   * 內容相同的影格會共用同一張，故元素可重複參照
   */
  overlayList: ImageBitmap[];
  outputWidth: number;
  outputHeight: number;
  /** 底圖在輸出畫布上的位置 */
  baseRect: Rect;
  /** 上層內容在輸出畫布上的位置 */
  overlayRect: Rect;
  backgroundColor: string;
}

interface ComposedFrame {
  data: ImageData;
  delay: number;
}

/** 讓出主執行緒，量化與合成很吃 CPU，全程佔著會讓載入提示卡住不動 */
function releaseMainThread() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

/** 等距取樣影格索引，首尾必取 */
function pickFrameIndexList(frameCount: number, maxCount: number): number[] {
  if (frameCount <= maxCount) {
    return Array.from({ length: frameCount }, (_, index) => index)
  }

  const step = (frameCount - 1) / (maxCount - 1)
  return [...new Set(Array.from({ length: maxCount }, (_, index) => Math.round(index * step)))]
}

/** 抽格後把跳過的影格時間併進前一格，總時長才不會走鐘 */
function reduceFrameList(frameList: ComposedFrame[], maxCount: number): ComposedFrame[] {
  if (frameList.length <= maxCount) {
    return frameList
  }

  const indexList = pickFrameIndexList(frameList.length, maxCount)
  return indexList.map((frameIndex, order) => {
    const nextIndex = indexList[order + 1] ?? frameList.length
    const delay = frameList
      .slice(frameIndex, nextIndex)
      .reduce((total, frame) => total + frame.delay, 0)

    return { data: frameList[frameIndex]!.data, delay }
  })
}

/** 逐格把底圖與上層內容合成到輸出畫布 */
async function composeFrameList(options: EncodeGifOptions): Promise<ComposedFrame[]> {
  const { sprite, overlayList, outputWidth, outputHeight, baseRect, overlayRect, backgroundColor } = options

  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('無法取得 canvas context')
  }

  const frameList: ComposedFrame[] = []
  for (let index = 0; index < sprite.frameCount; index++) {
    context.fillStyle = backgroundColor
    context.fillRect(0, 0, outputWidth, outputHeight)

    context.drawImage(
      sprite.image,
      0,
      index * sprite.frameHeight,
      sprite.frameWidth,
      sprite.frameHeight,
      baseRect.x,
      baseRect.y,
      baseRect.width,
      baseRect.height,
    )
    const overlay = overlayList[index]
    if (overlay) {
      context.drawImage(overlay, overlayRect.x, overlayRect.y, overlayRect.width, overlayRect.height)
    }

    frameList.push({
      data: context.getImageData(0, 0, outputWidth, outputHeight),
      delay: sprite.delayList[index] ?? DEFAULT_FRAME_DELAY,
    })

    await releaseMainThread()
  }

  return frameList
}

/** 從所有影格抽樣，全域色盤才涵蓋得了整段動畫 */
function collectPaletteSample(frameList: ComposedFrame[]): Uint8ClampedArray {
  const perFrameCount = Math.floor(frameList[0]!.data.data.length / 4 / PALETTE_SAMPLE_STEP)
  const sample = new Uint8ClampedArray(perFrameCount * frameList.length * 4)

  let cursor = 0
  for (const frame of frameList) {
    const { data } = frame.data
    for (let pixel = 0; pixel < perFrameCount; pixel++) {
      const offset = pixel * 4 * PALETTE_SAMPLE_STEP
      sample[cursor++] = data[offset]!
      sample[cursor++] = data[offset + 1]!
      sample[cursor++] = data[offset + 2]!
      sample[cursor++] = 255
    }
  }

  return sample
}

/**
 * 用一份全域色盤編碼整段動畫。
 *
 * 每格各自量化的話，每格都要多存一份色表，且相同畫面會被量化成不同索引，
 * 反而更難壓
 */
function encodeFrameList(frameList: ComposedFrame[], colorCount: number) {
  const { width, height } = frameList[0]!.data
  const palette = quantize(collectPaletteSample(frameList), colorCount)
  const colorDepth = Math.max(2, Math.ceil(Math.log2(colorCount)))

  const encoder = GIFEncoder()
  frameList.forEach((frame, index) => {
    encoder.writeFrame(applyPalette(frame.data.data, palette), width, height, {
      // 色盤只在第一格寫入，其後共用
      palette: index === 0 ? palette : undefined,
      colorDepth,
      delay: frame.delay,
    })
  })
  encoder.finish()

  return encoder.bytes()
}

/** 逐格重新合成並編碼成 GIF，超過目標大小就自動降階 */
export async function encodeGif(options: EncodeGifOptions): Promise<Blob> {
  const frameList = await composeFrameList(options)

  let bytes = encodeFrameList(frameList, QUALITY_STEP_LIST[0]!.colorCount)
  for (const step of QUALITY_STEP_LIST.slice(1)) {
    if (bytes.length <= TARGET_BYTE_SIZE)
      break

    await releaseMainThread()
    bytes = encodeFrameList(reduceFrameList(frameList, step.maxFrameCount), step.colorCount)
  }

  return new Blob([bytes], { type: 'image/gif' })
}
