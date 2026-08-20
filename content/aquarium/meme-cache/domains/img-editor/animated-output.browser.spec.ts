import type { FrameSprite } from './animated-output'
import { beforeAll, describe, expect, it } from 'vitest'
import { getSpriteColumnCount } from '../../../../../.vitepress/utils/meme-sprite-layout'
import { encodeGif, encodeMp4 } from './animated-output'

const FRAME_SIZE = 40
const FRAME_COLOR_LIST = ['#ff0000', '#00ff00', '#0000ff']

/** 造一張直向排列的影格長圖，模擬建置時產出的檔案 */
async function createSprite(): Promise<FrameSprite> {
  const frameCount = FRAME_COLOR_LIST.length
  // 與建置端同一條公式，測資才反映得出真實排版
  const columnCount = getSpriteColumnCount(frameCount)
  const rowCount = Math.ceil(frameCount / columnCount)

  const canvas = document.createElement('canvas')
  canvas.width = FRAME_SIZE * columnCount
  canvas.height = FRAME_SIZE * rowCount

  const context = canvas.getContext('2d')!
  FRAME_COLOR_LIST.forEach((color, index) => {
    context.fillStyle = color
    context.fillRect(
      (index % columnCount) * FRAME_SIZE,
      Math.floor(index / columnCount) * FRAME_SIZE,
      FRAME_SIZE,
      FRAME_SIZE,
    )
  })

  const image = new Image()
  image.src = canvas.toDataURL('image/png')
  await image.decode()

  return {
    image,
    frameCount,
    columnCount,
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

/** 影片測試用的尺寸。編碼器有最小邊長限制，不能沿用 GIF 測試的 40px */
const VIDEO_SIZE = 256

let videoSprite: FrameSprite
let videoOverlayList: ImageBitmap[]

function buildOptions() {
  return {
    sprite: videoSprite,
    overlayList: videoOverlayList,
    outputWidth: VIDEO_SIZE,
    outputHeight: VIDEO_SIZE,
    baseRect: { x: 0, y: 0, width: VIDEO_SIZE, height: VIDEO_SIZE },
    overlayRect: { x: 0, y: 0, width: VIDEO_SIZE, height: VIDEO_SIZE },
    backgroundColor: '#FFF',
  }
}

/**
 * 走訪 mp4 的 box 結構。
 *
 * 測試環境的 Chromium 編得了 H.264 卻解不了（開源建置沒有專利授權），
 * 故不能用 video 元素驗證，改為直接檢查檔案結構
 */
interface Mp4Box {
  type: string;
  payloadStart: number;
  payloadEnd: number;
}

function toBoxList(view: DataView, start: number, end: number): Mp4Box[] {
  const boxList: Mp4Box[] = []
  let offset = start

  while (offset + 8 <= end) {
    const size = view.getUint32(offset)
    if (size < 8)
      break

    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    )
    boxList.push({ type, payloadStart: offset + 8, payloadEnd: Math.min(offset + size, end) })
    offset += size
  }

  return boxList
}

function findBox(view: DataView, pathList: string[], start = 0, end = view.byteLength): Mp4Box | undefined {
  const [head, ...restList] = pathList

  for (const box of toBoxList(view, start, end)) {
    if (box.type !== head)
      continue

    return restList.length
      ? findBox(view, restList, box.payloadStart, box.payloadEnd)
      : box
  }

  return undefined
}

async function toView(blob: Blob) {
  return new DataView(await blob.arrayBuffer())
}

describe('encodeMp4', () => {
  beforeAll(async () => {
    videoSprite = await createSprite()
    videoOverlayList = await createOverlayList()
  })

  it('產出結構完整的 H.264 mp4，影格數與時長都對得上', async () => {
    const blob = await encodeMp4(buildOptions())
    expect(blob.type).toBe('video/mp4')

    const view = await toView(blob)

    // mp4 開頭第 5~8 個位元組固定是 ftyp
    expect(findBox(view, ['ftyp'])).toBeDefined()
    expect(findBox(view, ['moov'])).toBeDefined()

    const mdat = findBox(view, ['mdat'])
    expect(mdat!.payloadEnd - mdat!.payloadStart).toBeGreaterThan(0)

    // 影像編碼確實是 H.264
    const stsd = findBox(view, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'])!
    const [entry] = toBoxList(view, stsd.payloadStart + 8, stsd.payloadEnd)
    expect(entry!.type).toBe('avc1')

    // avc1 entry 內 width、height 分別在第 24、26 個位元組
    expect(view.getUint16(entry!.payloadStart + 24)).toBe(VIDEO_SIZE)
    expect(view.getUint16(entry!.payloadStart + 26)).toBe(VIDEO_SIZE)

    // 樣本數要等於影格數
    const stsz = findBox(view, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz'])!
    expect(view.getUint32(stsz.payloadStart + 8)).toBe(videoSprite.frameCount)

    // mvhd 的 timescale 與 duration 換算後要等於各影格間隔總和
    const mvhd = findBox(view, ['moov', 'mvhd'])!
    const timescale = view.getUint32(mvhd.payloadStart + 12)
    const duration = view.getUint32(mvhd.payloadStart + 16)
    const expectedSecond = videoSprite.delayList.reduce((total, delay) => total + delay, 0) / 1000
    expect(duration / timescale).toBeCloseTo(expectedSecond, 1)
  })

  it('輸出尺寸為奇數時會收成偶數，H.264 才吃得下', async () => {
    const blob = await encodeMp4({
      ...buildOptions(),
      outputWidth: VIDEO_SIZE + 1,
      outputHeight: VIDEO_SIZE + 1,
    })

    const view = await toView(blob)
    const stsd = findBox(view, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'])!
    const [entry] = toBoxList(view, stsd.payloadStart + 8, stsd.payloadEnd)

    expect(view.getUint16(entry!.payloadStart + 24) % 2).toBe(0)
    expect(view.getUint16(entry!.payloadStart + 26) % 2).toBe(0)
  })

  it('尺寸低於編碼器下限時補邊，而不是編不出來', async () => {
    // 極寬的梗圖縮到長邊上限後，短邊會低於編碼器可接受的最小值
    const blob = await encodeMp4({
      ...buildOptions(),
      outputWidth: 420,
      outputHeight: 60,
    })

    const view = await toView(blob)
    const stsd = findBox(view, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'])!
    const [entry] = toBoxList(view, stsd.payloadStart + 8, stsd.payloadEnd)

    expect(view.getUint16(entry!.payloadStart + 24)).toBe(420)
    expect(view.getUint16(entry!.payloadStart + 26)).toBeGreaterThanOrEqual(128)
  })
})
