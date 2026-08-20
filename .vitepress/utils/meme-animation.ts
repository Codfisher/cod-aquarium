import type { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { pickFrameIndexList } from './meme-frame-sheet'

/** 動圖輸出的最長邊。每一格都要存，尺寸不砍檔案會大到不堪用 */
export const ANIMATED_MAX_SIZE = 480

/**
 * 動圖保留的影格上限。
 *
 * 這是「總量上限」而非目標值，短片會完整保留原影格。
 * 曾經訂成 24 格，結果 14 秒的片子被壓成 1.6 fps 的投影片 ——
 * 影格數必須跟著時長走，不能訂死
 */
const ANIMATED_MAX_FRAME_COUNT = 120

/**
 * 影格長圖的影格上限。
 *
 * 長圖是把影格直向疊起來的單張靜態圖，受兩個硬限制：
 * webp 單邊不得超過 16383px，且行動裝置解大圖會自動降採樣、切格就會錯位。
 * 故長圖獨立抽格，編輯器預覽與 GIF 輸出會比列表播放略頓，換取可攜性
 */
const SPRITE_MAX_FRAME_COUNT = 32

/** webp 單邊尺寸上限 */
const WEBP_MAX_DIMENSION = 16383

/** 影格間隔缺漏或為 0 時的預設值，比照瀏覽器對 gif 的處理 */
const DEFAULT_FRAME_DELAY = 100

/** 把被跳過的影格時間併進前一個保留影格，抽格後總時長才不會走鐘 */
function mergeFrameDelayList(delayList: number[], indexList: number[]): number[] {
  return indexList.map((frameIndex, order) => {
    const nextIndex = indexList[order + 1] ?? delayList.length
    const merged = delayList
      .slice(frameIndex, nextIndex)
      .reduce((total, delay) => total + delay, 0)

    return merged || DEFAULT_FRAME_DELAY
  })
}

/** 讀出影格間隔，來源缺漏時補預設值，長度一律對齊影格數 */
function toDelayList(delay: number[] | undefined, frameCount: number): number[] {
  return delay?.length === frameCount
    ? delay
    : Array.from({ length: frameCount }, () => DEFAULT_FRAME_DELAY)
}

/**
 * 縮圖並重組動圖。
 *
 * 影格數在上限內就原封不動，超過才等距抽格，
 * 故一般長度的迷因不會損失流暢度
 */
export async function normalizeAnimatedMeme(input: string | Buffer): Promise<Buffer> {
  const metadata = await sharp(input).metadata()
  const frameCount = metadata.pages ?? 1
  const indexList = pickFrameIndexList(frameCount, ANIMATED_MAX_FRAME_COUNT)

  const frameList = await Promise.all(indexList.map((frameIndex) => sharp(input, { page: frameIndex })
    .resize({ width: ANIMATED_MAX_SIZE, height: ANIMATED_MAX_SIZE, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()))

  const frameDelayList = mergeFrameDelayList(toDelayList(metadata.delay, frameCount), indexList)

  /*
   * 動圖保留透明度；effort 6 對多影格慢到不可用。
   *
   * webp 編碼器會把壓縮後幾乎相同的相鄰影格合併，實際影格數可能少於送進去的張數，
   * 總時長則會保留。故首格圖、影格長圖一律從寫出的檔案再讀，才對得上
   */
  return sharp(frameList, { join: { animated: true } })
    .webp({ quality: 55, effort: 4, smartSubsample: true, delay: frameDelayList, loop: 0 })
    .toBuffer()
}

/** 首格靜態圖。列表預設顯示它，桌機一屏十幾張動圖同時播會吃滿 CPU */
export function buildPoster(input: string | Buffer): Promise<Buffer> {
  return sharp(input, { page: 0 })
    .flatten({ background: '#fff' })
    .webp({ quality: 60, effort: 6, smartSubsample: true })
    .toBuffer()
}

/** 長圖要挑哪幾格。與 delay 計算共用，兩者才不會對不上 */
function pickSpriteFrameIndexList(frameCount: number, frameHeight: number): number[] {
  const maxByDimension = Math.max(1, Math.floor(WEBP_MAX_DIMENSION / Math.max(1, frameHeight)))
  return pickFrameIndexList(frameCount, Math.min(SPRITE_MAX_FRAME_COUNT, maxByDimension))
}

/** 長圖各影格的顯示毫秒數，編輯器要靠它切格與計時 */
export async function getSpriteFrameDelayList(input: string | Buffer): Promise<number[]> {
  const metadata = await sharp(input).metadata()
  const frameCount = metadata.pages ?? 1
  const frameHeight = metadata.pageHeight ?? metadata.height ?? 1

  return mergeFrameDelayList(
    toDelayList(metadata.delay, frameCount),
    pickSpriteFrameIndexList(frameCount, frameHeight),
  )
}

/**
 * 影格縱向拼接的長圖。
 *
 * 瀏覽器沒有通用的逐格解碼 API（ImageDecoder 只有 Chromium 系有），
 * 編輯器要輸出動圖就得自己切格，故另存這張長圖給前端用 canvas 裁
 */
export async function buildFrameSprite(input: string | Buffer): Promise<Buffer> {
  const metadata = await sharp(input).metadata()
  const frameCount = metadata.pages ?? 1
  const frameWidth = metadata.width ?? 1
  const frameHeight = metadata.pageHeight ?? metadata.height ?? 1

  const indexList = pickSpriteFrameIndexList(frameCount, frameHeight)

  const cellList = await Promise.all(indexList.map(async (frameIndex, order) => ({
    input: await sharp(input, { page: frameIndex }).png().toBuffer(),
    left: 0,
    top: order * frameHeight,
  })))

  // 直接疊成單張靜態圖，不走多頁輸出，才不會又被寫成動圖
  return sharp({
    create: {
      width: frameWidth,
      height: indexList.length * frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cellList)
    .webp({ quality: 70, effort: 4, smartSubsample: true })
    .toBuffer()
}
