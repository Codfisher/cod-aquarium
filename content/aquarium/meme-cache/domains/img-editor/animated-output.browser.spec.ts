import type { FrameSprite } from './animated-output'
import { describe, expect, it } from 'vitest'
import { encodeGif } from './animated-output'

const FRAME_SIZE = 40
const FRAME_COLOR_LIST = ['#ff0000', '#00ff00', '#0000ff']

/** 造一張直向排列的影格長圖，模擬建置時產出的檔案 */
async function createSprite(): Promise<FrameSprite> {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_SIZE
  canvas.height = FRAME_SIZE * FRAME_COLOR_LIST.length

  const context = canvas.getContext('2d')!
  FRAME_COLOR_LIST.forEach((color, index) => {
    context.fillStyle = color
    context.fillRect(0, index * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE)
  })

  const image = new Image()
  image.src = canvas.toDataURL('image/png')
  await image.decode()

  return {
    image,
    frameCount: FRAME_COLOR_LIST.length,
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    delayList: [100, 120, 140],
  }
}

/** 造一張左上角有指定顏色方塊、其餘透明的上層內容 */
async function createOverlay(color = '#ffff00'): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_SIZE
  canvas.height = FRAME_SIZE

  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 10, 10)

  return createImageBitmap(canvas)
}

/** 每格共用同一張上層內容，模擬文字全程顯示 */
async function createOverlayList(): Promise<ImageBitmap[]> {
  const overlay = await createOverlay()
  return FRAME_COLOR_LIST.map(() => overlay)
}

/** 走訪 GIF 區塊結構數出影格數，比對位元組容易被壓縮資料誤判 */
function countGifFrame(bytes: Uint8Array): number {
  /** 跳過長度前綴的子區塊串 */
  function skipSubBlockList(start: number): number {
    let cursor = start
    for (;;) {
      const size = bytes[cursor]!
      cursor += 1
      if (size === 0)
        return cursor

      cursor += size
    }
  }

  const screenPacked = bytes[10]!
  // 有全域色盤就跳過
  let cursor = 13 + (screenPacked & 0x80 ? 3 * 2 ** ((screenPacked & 0x07) + 1) : 0)

  let count = 0
  while (cursor < bytes.length) {
    const marker = bytes[cursor]!

    // 檔案結尾
    if (marker === 0x3B)
      break

    // 擴充區塊：標籤 1 byte，其後為子區塊串
    if (marker === 0x21) {
      cursor = skipSubBlockList(cursor + 2)
      continue
    }

    // 影像描述區塊
    if (marker === 0x2C) {
      count++
      const imagePacked = bytes[cursor + 9]!
      cursor += 10 + (imagePacked & 0x80 ? 3 * 2 ** ((imagePacked & 0x07) + 1) : 0)
      // 跳過 LZW 最小碼長度與影像資料
      cursor = skipSubBlockList(cursor + 1)
      continue
    }

    throw new Error(`未知的 GIF 區塊：0x${marker.toString(16)}`)
  }

  return count
}

async function readPixel(blob: Blob, x: number, y: number) {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const [r, g, b] = context.getImageData(x, y, 1, 1).data
  return { r: r!, g: g!, b: b! }
}

describe('encodeGif', () => {
  it('影格長圖的每一格都會輸出成一格 GIF', async () => {
    const blob = await encodeGif({
      sprite: await createSprite(),
      overlayList: await createOverlayList(),
      outputWidth: FRAME_SIZE,
      outputHeight: FRAME_SIZE,
      baseRect: { x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      overlayRect: { x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      backgroundColor: '#FFF',
    })

    expect(blob.type).toBe('image/gif')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
    expect(countGifFrame(bytes)).toBe(FRAME_COLOR_LIST.length)
  })

  it('底圖與上層內容會依指定位置合成', async () => {
    const blob = await encodeGif({
      sprite: await createSprite(),
      overlayList: await createOverlayList(),
      outputWidth: FRAME_SIZE,
      outputHeight: FRAME_SIZE,
      baseRect: { x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      overlayRect: { x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      backgroundColor: '#FFF',
    })

    // 解出來的是第一格，底圖為紅色，左上角疊著黃色方塊
    expect(await readPixel(blob, 20, 20)).toMatchObject({ r: 255, g: 0, b: 0 })
    expect(await readPixel(blob, 5, 5)).toMatchObject({ r: 255, g: 255, b: 0 })
  })

  it('底圖只畫在指定區域，其餘留給背景色', async () => {
    const blob = await encodeGif({
      sprite: await createSprite(),
      overlayList: await createOverlayList(),
      outputWidth: FRAME_SIZE * 2,
      outputHeight: FRAME_SIZE,
      baseRect: { x: FRAME_SIZE, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      overlayRect: { x: FRAME_SIZE, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      backgroundColor: '#FFFFFF',
    })

    expect(await readPixel(blob, 10, 20)).toMatchObject({ r: 255, g: 255, b: 255 })
    expect(await readPixel(blob, FRAME_SIZE + 20, 20)).toMatchObject({ r: 255, g: 0, b: 0 })
  })
})

/**
 * GIF 的後續影格沒有通用解碼方式，這裡借用 Chromium 才有的 ImageDecoder。
 * 只用在測試，正式流程不依賴它
 */
interface DecodedImage {
  displayWidth: number;
  displayHeight: number;
  close: () => void;
}
declare class ImageDecoder {
  constructor(init: { data: ArrayBuffer; type: string })
  readonly completed: Promise<void>
  decode: (options?: { frameIndex?: number }) => Promise<{ image: DecodedImage }>
}

async function readPixelAtFrame(blob: Blob, frameIndex: number, x: number, y: number) {
  const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' })
  await decoder.completed

  const { image } = await decoder.decode({ frameIndex })
  const canvas = document.createElement('canvas')
  canvas.width = image.displayWidth
  canvas.height = image.displayHeight

  const context = canvas.getContext('2d')!
  context.drawImage(image as unknown as CanvasImageSource, 0, 0)
  image.close()

  const [r, g, b] = context.getImageData(x, y, 1, 1).data
  return { r: r!, g: g!, b: b! }
}

describe('文字顯示區間', () => {
  it('上層內容逐格套用，只在指定影格出現', async () => {
    const blank = await createOverlay('#00000000')
    const yellow = await createOverlay('#ffff00')

    const blob = await encodeGif({
      sprite: await createSprite(),
      // 只有第三格疊上黃色方塊，模擬文字設了顯示區間
      overlayList: [blank, blank, yellow],
      outputWidth: FRAME_SIZE,
      outputHeight: FRAME_SIZE,
      baseRect: { x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      overlayRect: { x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE },
      backgroundColor: '#FFF',
    })

    // 第一格底圖為紅色，左上角不該有黃色方塊
    expect(await readPixelAtFrame(blob, 0, 5, 5)).toMatchObject({ r: 255, g: 0, b: 0 })
    // 第三格底圖為藍色，左上角要有黃色方塊
    expect(await readPixelAtFrame(blob, 2, 20, 20)).toMatchObject({ r: 0, g: 0, b: 255 })
    expect(await readPixelAtFrame(blob, 2, 5, 5)).toMatchObject({ r: 255, g: 255, b: 0 })
  })
})
