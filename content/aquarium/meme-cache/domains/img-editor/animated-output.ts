import { getSpriteColumnCount, SPRITE_LAYOUT_VERSION } from '../../../../../.vitepress/utils/meme-sprite-layout'

/*
 * 兩個編碼器都改成動態載入。
 *
 * gifenc 的 main 指向 CJS 檔，SSR 在 Node 端走 CJS 入口時抓不到具名匯出，
 * 靜態 import 會讓建置在算繪頁面時就爆掉。
 * 反正只有使用者按下輸出時才需要，順便讓初始 bundle 少背這兩包
 */
type GifencModule = typeof import('gifenc')

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
  /** 長圖的欄數，影格是排成格狀而非單欄 */
  columnCount: number;
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
  image.src = `/meme-sprites/${file}?v=${SPRITE_LAYOUT_VERSION}`
  await image.decode()

  // 欄數與建置端用同一條公式，差一格整段就會錯位
  const columnCount = getSpriteColumnCount(frameCount)
  const rowCount = Math.ceil(frameCount / columnCount)
  const frameWidth = image.naturalWidth / columnCount
  const frameHeight = image.naturalHeight / rowCount

  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) {
    throw new TypeError(
      `影格長圖與影格資料對不上：${image.naturalWidth}x${image.naturalHeight} / ${frameCount} 格`,
    )
  }

  return {
    image,
    frameCount,
    columnCount,
    frameWidth,
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

/** 每處理幾格才讓出一次主執行緒。每格都讓的話，長動圖光是等 rAF 就多花好幾秒 */
const YIELD_FRAME_INTERVAL = 4

/** 讓出主執行緒，量化與編碼很吃 CPU，全程佔著會讓載入提示卡住不動 */
function releaseMainThread(index = 0) {
  if (index % YIELD_FRAME_INTERVAL !== 0) {
    return Promise.resolve()
  }

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

/**
 * 把單一影格的底圖與上層內容畫到畫布上。
 *
 * offset 供影片編碼補邊時把內容置中，GIF 不需要就留 0
 */
function drawFrame(
  context: CanvasRenderingContext2D,
  options: EncodeGifOptions,
  index: number,
  offsetX = 0,
  offsetY = 0,
) {
  const { sprite, overlayList, baseRect, overlayRect, backgroundColor } = options
  const { canvas } = context

  context.fillStyle = backgroundColor
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.drawImage(
    sprite.image,
    (index % sprite.columnCount) * sprite.frameWidth,
    Math.floor(index / sprite.columnCount) * sprite.frameHeight,
    sprite.frameWidth,
    sprite.frameHeight,
    baseRect.x + offsetX,
    baseRect.y + offsetY,
    baseRect.width,
    baseRect.height,
  )

  const overlay = overlayList[index]
  if (overlay) {
    context.drawImage(
      overlay,
      overlayRect.x + offsetX,
      overlayRect.y + offsetY,
      overlayRect.width,
      overlayRect.height,
    )
  }
}

/** 逐格把底圖與上層內容合成到輸出畫布 */
async function composeFrameList(options: EncodeGifOptions): Promise<ComposedFrame[]> {
  const canvas = document.createElement('canvas')
  canvas.width = options.outputWidth
  canvas.height = options.outputHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('無法取得 canvas context')
  }

  const frameList: ComposedFrame[] = []
  for (let index = 0; index < options.sprite.frameCount; index++) {
    drawFrame(context, options, index)

    frameList.push({
      data: context.getImageData(0, 0, canvas.width, canvas.height),
      delay: options.sprite.delayList[index] ?? DEFAULT_FRAME_DELAY,
    })

    await releaseMainThread(index)
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
function encodeFrameList(gifenc: GifencModule, frameList: ComposedFrame[], colorCount: number) {
  const { applyPalette, GIFEncoder, quantize } = gifenc
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
  const gifenc = await import('gifenc')
  const frameList = await composeFrameList(options)

  let bytes = encodeFrameList(gifenc, frameList, QUALITY_STEP_LIST[0]!.colorCount)
  for (const step of QUALITY_STEP_LIST.slice(1)) {
    if (bytes.length <= TARGET_BYTE_SIZE)
      break

    // 降階只有寥寥幾次，每次都讓出以免整段編碼把畫面凍住
    await releaseMainThread()
    bytes = encodeFrameList(gifenc, reduceFrameList(frameList, step.maxFrameCount), step.colorCount)
  }

  return new Blob([bytes], { type: 'image/gif' })
}

/**
 * H.264 的色度取樣要求邊長為偶數，奇數會被編碼器拒絕。
 *
 * 少掉的那 1px 落在邊緣的補邊區，看不出來
 */
function toEvenSize(value: number) {
  return Math.max(2, value - (value % 2))
}

/** 每隔幾格插入一個關鍵影格，播放器拖曳進度時才不會花屏 */
const KEY_FRAME_INTERVAL = 15

/**
 * H.264 編碼器可接受的最小邊長。
 *
 * 實測 Chromium 在 96px 以下一律拒絕，不足的一邊補背景色置中，
 * 極寬或極高的梗圖才不會編不出來
 */
const MIN_VIDEO_DIMENSION = 128

/** 位元率取像素量的比例，讓小圖不會被灌水、大圖不會糊掉 */
const BITRATE_PER_PIXEL = 6

/**
 * 瀏覽器能不能編碼 mp4。
 *
 * WebCodecs 的 VideoEncoder 在 Safari 16.4 以後才有，
 * 沒有的話只能退回 GIF
 */
export function isMp4Supported() {
  return typeof VideoEncoder !== 'undefined'
}

/**
 * 逐格編碼成 H.264 的 mp4。
 *
 * GIF 有些平台不接受上傳，且同樣畫面下體積是 mp4 的數倍。
 * 這裡不必像 GIF 那樣先把整段存成點陣圖再量化，逐格編碼即可，記憶體也省得多
 */
export async function encodeMp4(options: EncodeGifOptions): Promise<Blob> {
  if (!isMp4Supported()) {
    throw new Error('此瀏覽器不支援影片編碼')
  }

  const { sprite } = options
  const width = toEvenSize(Math.max(MIN_VIDEO_DIMENSION, options.outputWidth))
  const height = toEvenSize(Math.max(MIN_VIDEO_DIMENSION, options.outputHeight))
  const offsetX = Math.round((width - options.outputWidth) / 2)
  const offsetY = Math.round((height - options.outputHeight) / 2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('無法取得 canvas context')
  }

  const { ArrayBufferTarget, Muxer } = await import('mp4-muxer')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    // 讓 moov 落在檔案開頭，行動裝置與網頁播放器才能邊載邊播
    fastStart: 'in-memory',
  })

  let encodeError: Error | undefined
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      encodeError = error
    },
  })

  const config = {
    codec: 'avc1.42001f',
    width,
    height,
    bitrate: width * height * BITRATE_PER_PIXEL,
  }

  // 先問過再設定，不支援時才有機會退回 GIF，而不是丟一個難懂的例外
  const { supported } = await VideoEncoder.isConfigSupported(config)
  if (!supported) {
    encoder.close()
    throw new Error(`編碼器不支援此設定：${width}x${height}`)
  }
  encoder.configure(config)

  let timestamp = 0
  for (let index = 0; index < sprite.frameCount; index++) {
    if (encodeError) {
      throw encodeError
    }

    drawFrame(context, options, index, offsetX, offsetY)

    // WebCodecs 的時間單位是微秒
    const duration = (sprite.delayList[index] ?? DEFAULT_FRAME_DELAY) * 1000
    const frame = new VideoFrame(canvas, { timestamp, duration })

    encoder.encode(frame, { keyFrame: index % KEY_FRAME_INTERVAL === 0 })
    frame.close()
    timestamp += duration

    await releaseMainThread(index)
  }

  await encoder.flush()
  encoder.close()
  if (encodeError) {
    throw encodeError
  }

  muxer.finalize()
  return new Blob([target.buffer], { type: 'video/mp4' })
}
