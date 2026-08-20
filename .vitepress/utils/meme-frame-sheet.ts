import type { Buffer } from 'node:buffer'
import sharp from 'sharp'

/** 送進模型的影格數上限。格子太多會讓每格細節糊掉，反而看不出動作 */
const SHEET_MAX_FRAME_COUNT = 9
/** 單格縮圖的最長邊 */
const CELL_MAX_SIZE = 320
/** 格線寬度，讓模型看得出影格邊界 */
const GRID_LINE_WIDTH = 4
const GRID_LINE_COLOR = { r: 120, g: 120, b: 120 }
const CELL_BACKGROUND = { r: 255, g: 255, b: 255 }

export interface FrameSheet {
  buffer: Buffer;
  /** 實際拼進圖中的影格數 */
  frameCount: number;
  columnCount: number;
}

/** 取得影格數，1 代表靜態圖 */
export async function getFrameCount(input: string | Buffer): Promise<number> {
  const { pages } = await sharp(input).metadata()
  return pages ?? 1
}

/** 等距取樣影格索引，首尾必取 */
export function pickFrameIndexList(frameCount: number, maxCount: number): number[] {
  if (frameCount <= maxCount) {
    return Array.from({ length: frameCount }, (_, index) => index)
  }

  const step = (frameCount - 1) / (maxCount - 1)
  const indexList = Array.from(
    { length: maxCount },
    (_, index) => Math.round(index * step),
  )
  return [...new Set(indexList)]
}

/**
 * 把動圖抽格拼成一張九宮格。
 *
 * Gemini 的圖片輸入不收 gif，動態 webp 也只會被讀到第一格，
 * 故改送影格拼圖，讓模型能從動作變化推出語意。
 * 灰色格線是刻意留的，模型要靠它切開影格邊界
 */
export async function buildFrameSheet(filePath: string): Promise<FrameSheet> {
  const metadata = await sharp(filePath).metadata()
  const frameWidth = metadata.width ?? 0
  /** 動圖的 height 是整條影格疊起來的總高，單格高度要看 pageHeight */
  const frameHeight = metadata.pageHeight ?? metadata.height ?? 0
  if (!frameWidth || !frameHeight) {
    throw new Error(`無法取得影格尺寸：${filePath}`)
  }

  const indexList = pickFrameIndexList(metadata.pages ?? 1, SHEET_MAX_FRAME_COUNT)
  const columnCount = Math.ceil(Math.sqrt(indexList.length))
  const rowCount = Math.ceil(indexList.length / columnCount)

  const scale = Math.min(CELL_MAX_SIZE / frameWidth, CELL_MAX_SIZE / frameHeight, 1)
  const cellWidth = Math.max(1, Math.round(frameWidth * scale))
  const cellHeight = Math.max(1, Math.round(frameHeight * scale))

  const cellList = await Promise.all(indexList.map(async (frameIndex, cellIndex) => {
    // 每格尺寸一致，故用 fill 直接對齊格線，不會變形
    const input = await sharp(filePath, { page: frameIndex })
      .resize(cellWidth, cellHeight, { fit: 'fill' })
      .flatten({ background: CELL_BACKGROUND })
      .png()
      .toBuffer()

    const column = cellIndex % columnCount
    const row = Math.floor(cellIndex / columnCount)

    return {
      input,
      left: GRID_LINE_WIDTH + column * (cellWidth + GRID_LINE_WIDTH),
      top: GRID_LINE_WIDTH + row * (cellHeight + GRID_LINE_WIDTH),
    }
  }))

  const buffer = await sharp({
    create: {
      width: columnCount * cellWidth + (columnCount + 1) * GRID_LINE_WIDTH,
      height: rowCount * cellHeight + (rowCount + 1) * GRID_LINE_WIDTH,
      channels: 3,
      background: GRID_LINE_COLOR,
    },
  })
    .composite(cellList)
    .webp({ quality: 80 })
    .toBuffer()

  return { buffer, frameCount: indexList.length, columnCount }
}
