import { getSpriteColumnCount, SPRITE_LAYOUT_VERSION } from '../../../../../.vitepress/utils/meme-sprite-layout'

/*
 * 兩個編碼器都改成動態載入。
 *
 * gifenc 的 main 指向 CJS 檔，SSR 在 Node 端走 CJS 入口時抓不到具名匯出，
 * 靜態 import 會讓建置在算繪頁面時就爆掉。
 * 反正只有使用者按下輸出時才需要，順便讓初始 bundle 少背這兩包
 */

/**
 * GIF 輸出的最長邊。
 *
 * GIF 逐格存索引，同畫面下壓縮率仍不如動態 webp，尺寸得收斂。
 * 但它有跨影格機制：像素標成透明並配上 dispose=1，播放器就沿用上一格，
 * 故靜止區域幾乎不佔空間，見 encodeGif
 */
export const GIF_MAX_SIZE = 480

/**
 * 輸出後的文字高度下限，單位為輸出像素。
 *
 * 底圖與文字共用同一張輸出畫布，只能有一個縮放比，兩者的需求正好相反：
 * 底圖放大只會存到放大出來的假細節，文字縮小則會糊到看不清楚。
 *
 * 原本的做法是直接規定輸出長邊至少 420px，但全站 67 張動圖有 65 張原生長邊小於
 * 420，等於幾乎每張都在放大底圖、白白讓體積翻倍。
 * 改成只約束真正怕縮的那一項：最小的那段文字算繪出來不得低於這個高度。
 * 沒有文字時就完全不設下限，直接照原生解析度輸出
 */
export const MIN_TEXT_OUTPUT_SIZE = 14

/**
 * 全域色盤的色數，含一格透明索引。
 *
 * 梗圖畫面平坦，128 色已看不出斷階；再往上色表本身就開始佔空間
 */
const GIF_COLOR_COUNT = 128

/**
 * 判定「這格與畫面上現有像素相同」的容許色差，單位為 RGB 歐氏距離。
 *
 * 來源是 lossy webp，靜止的背景每格都帶一點雜訊，逐位元比對只抓得到三成，
 * 零星的透明點還會打斷 LZW 的連續段，反而讓檔案變大。
 * 實測 24 對三張代表性梗圖省下 14~59%，RMSE 只從 3.1~4.5 升到 4.3~5.7
 */
const FRAME_DIFF_TOLERANCE = 24

/** 透明索引在色盤裡的佔位色，永遠不會被畫出來 */
const TRANSPARENT_COLOR = [0, 0, 0]

/**
 * 建色盤那趟佔整體進度的比重。
 *
 * 它只負責抽樣，比逐格量化編碼那趟輕，故給的權重較小
 */
const PALETTE_PASS_PROGRESS = 0.3

/** 建色盤時的取樣間隔，把所有像素都拿去量化太慢 */
const PALETTE_SAMPLE_STEP = 7

/** 影格間隔缺漏時的預設值，比照瀏覽器對 gif 的處理 */
const DEFAULT_FRAME_DELAY = 100

/** 主執行緒與 worker 都畫得了的畫布與繪圖環境 */
type OutputContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** worker 裡沒有 document，優先用 OffscreenCanvas；Safari 16.4 以前才會回落 */
function createOutputCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** 這段程式碼能不能在 worker 裡跑。缺 OffscreenCanvas 就只能退回主執行緒 */
export function isOffscreenSupported() {
  return typeof OffscreenCanvas !== 'undefined'
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameSprite {
  /**
   * 影格來源。
   *
   * 主執行緒用 HTMLImageElement，worker 裡沒有 DOM，只能用 ImageBitmap，
   * 故放寬成 canvas 畫得了的任一種
   */
  image: CanvasImageSource;
  /** 影格長圖的檔名。worker 拿不到 HTMLImageElement，得靠它自己取一份 */
  file: string;
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
    file,
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
  /** 進度回報，0~1。長動圖要跑上幾秒，沒有回報使用者不知道還要等多久 */
  onProgress?: (ratio: number) => void;
}

/** 每處理幾格才讓出一次主執行緒。每格都讓的話，長動圖光是等 rAF 就多花好幾秒 */
const YIELD_FRAME_INTERVAL = 4

/**
 * 讓出主執行緒，量化與編碼很吃 CPU，全程佔著會讓載入提示卡住不動。
 *
 * 不用 requestAnimationFrame：它跟著合成器的影格節奏走，分頁一切到背景就停擺。
 * 使用者按下輸出後跑去別的分頁，回來會發現進度卡在原地，
 * CPU 吃緊時單次 rAF 也可能拖到數百毫秒，整段編碼跟著慢上一個數量級。
 *
 * 在 worker 裡沒有畫面要顧，讓出只是白白多花時間，故直接跳過
 */
function releaseMainThread(index = 0) {
  if (typeof document === 'undefined' || index % YIELD_FRAME_INTERVAL !== 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * 把單一影格的底圖與上層內容畫到畫布上。
 *
 * offset 供影片編碼補邊時把內容置中，GIF 不需要就留 0
 */
function drawFrame(
  context: OutputContext,
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

/**
 * 逐格合成到同一張畫布上，每合成一格就交給 handler 取用。
 *
 * 不一次收集成陣列，是因為 ImageData 佔的是未壓縮的 RGBA：
 * 420x420 的 120 格動圖就要 85MB，行動裝置會直接被系統收掉
 */
async function forEachComposedFrame(
  options: EncodeGifOptions,
  handler: (data: Uint8ClampedArray, index: number) => void,
  progressFrom = 0,
  progressTo = 1,
) {
  const canvas = createOutputCanvas(options.outputWidth, options.outputHeight)
  const context = canvas.getContext('2d', { willReadFrequently: true }) as OutputContext | null
  if (!context) {
    throw new Error('無法取得 canvas context')
  }

  const { frameCount } = options.sprite
  for (let index = 0; index < frameCount; index++) {
    drawFrame(context, options, index)
    handler(context.getImageData(0, 0, canvas.width, canvas.height).data, index)

    options.onProgress?.(progressFrom + ((index + 1) / frameCount) * (progressTo - progressFrom))
    await releaseMainThread(index)
  }
}

/**
 * 從所有影格抽樣，全域色盤才涵蓋得了整段動畫。
 *
 * 每格各自量化的話，每格都要多存一份色表，相同畫面還會被量化成不同索引，
 * 跨影格差分就整片失效
 */
async function collectPaletteSample(options: EncodeGifOptions): Promise<Uint8ClampedArray> {
  const pixelCount = options.outputWidth * options.outputHeight
  const perFrameCount = Math.floor(pixelCount / PALETTE_SAMPLE_STEP)
  const sample = new Uint8ClampedArray(perFrameCount * options.sprite.frameCount * 4)

  let cursor = 0
  await forEachComposedFrame(options, (data) => {
    for (let pixel = 0; pixel < perFrameCount; pixel++) {
      const offset = pixel * 4 * PALETTE_SAMPLE_STEP
      sample[cursor++] = data[offset]!
      sample[cursor++] = data[offset + 1]!
      sample[cursor++] = data[offset + 2]!
      sample[cursor++] = 255
    }
  }, 0, PALETTE_PASS_PROGRESS)

  return sample
}

/**
 * 編碼成 GIF，全影格、不抽格。
 *
 * 體積靠跨影格差分收斂：與畫面上現有像素夠接近的點改寫成透明索引，
 * 配上 dispose=1（不清除前一格），播放器就會沿用舊像素。
 * 梗圖多半是靜止背景配一小塊動作，實測九成以上的像素都能省掉。
 *
 * 影格是最後才該犧牲的東西 —— 抽格會毀掉 GIF 唯一的價值（到處都動得了），
 * 而且真要小檔案，旁邊就有 encodeMp4
 */
export async function encodeGif(options: EncodeGifOptions): Promise<Blob> {
  const { applyPalette, GIFEncoder, quantize } = await import('gifenc')
  const { outputWidth, outputHeight, sprite } = options

  // 留一格給透明索引，色盤總數才不會超出 colorDepth 撐得住的範圍
  const palette = quantize(await collectPaletteSample(options), GIF_COLOR_COUNT - 1)
  const transparentIndex = palette.length
  const colorDepth = Math.max(2, Math.ceil(Math.log2(transparentIndex + 1)))

  /**
   * 播放器當下實際顯示的畫面，逐格累積。
   *
   * 比對對象是它而非前一格原圖，容差造成的誤差才不會一格一格疊上去
   */
  const pixelCount = outputWidth * outputHeight
  const renderedColorList = new Uint8ClampedArray(pixelCount * 3)

  const encoder = GIFEncoder()
  await forEachComposedFrame(options, (data, index) => {
    const indexList = applyPalette(data, palette)

    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const color = palette[indexList[pixel]!]!
      const offset = pixel * 3

      if (index > 0) {
        const deltaRed = color[0]! - renderedColorList[offset]!
        const deltaGreen = color[1]! - renderedColorList[offset + 1]!
        const deltaBlue = color[2]! - renderedColorList[offset + 2]!
        const distance = deltaRed ** 2 + deltaGreen ** 2 + deltaBlue ** 2

        if (distance <= FRAME_DIFF_TOLERANCE ** 2) {
          indexList[pixel] = transparentIndex
          continue
        }
      }

      renderedColorList[offset] = color[0]!
      renderedColorList[offset + 1] = color[1]!
      renderedColorList[offset + 2] = color[2]!
    }

    encoder.writeFrame(indexList, outputWidth, outputHeight, {
      // 色盤只在第一格寫入，其後共用
      palette: index === 0 ? [...palette, TRANSPARENT_COLOR] : undefined,
      colorDepth,
      delay: sprite.delayList[index] ?? DEFAULT_FRAME_DELAY,
      // 首格全不透明，動畫繞回開頭時畫面才是乾淨的
      transparent: index > 0,
      transparentIndex,
      // 1 = 不清除前一格，透明處才看得到沿用的舊像素
      dispose: 1,
    })
  }, PALETTE_PASS_PROGRESS, 1)
  encoder.finish()

  return new Blob([encoder.bytes()], { type: 'image/gif' })
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

  const canvas = createOutputCanvas(width, height)
  const context = canvas.getContext('2d') as OutputContext | null
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

    options.onProgress?.((index + 1) / sprite.frameCount)
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
