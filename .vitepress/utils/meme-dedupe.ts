import type { Buffer } from 'node:buffer'
import sharp from 'sharp'
import phash from 'sharp-phash'
import distance from 'sharp-phash/distance'
import { getFrameCount, pickFrameIndexList } from './meme-frame-sheet'

/** 感知雜湊的相似度閾值，越小越嚴格 */
export const IMG_SIMILARITY_THRESHOLD = 5

/** 動圖取樣的影格數。只比第一格的話，開頭是黑幕的動圖會全部撞在一起 */
const ANIMATED_SAMPLE_COUNT = 5

export interface MemeFingerprint {
  /** 各取樣影格的感知雜湊，靜態圖只有一筆 */
  hashList: string[];
  animated: boolean;
}

/** 取出圖片的感知雜湊。動圖會等距取樣多格，靜態圖維持單格 */
export async function createFingerprint(input: string | Buffer): Promise<MemeFingerprint> {
  const frameCount = await getFrameCount(input)

  if (frameCount <= 1) {
    return {
      hashList: [await phash(await sharp(input).png().toBuffer())],
      animated: false,
    }
  }

  const indexList = pickFrameIndexList(frameCount, ANIMATED_SAMPLE_COUNT)
  const hashList = await Promise.all(indexList.map(
    async (page) => phash(await sharp(input, { page }).png().toBuffer()),
  ))

  return { hashList, animated: true }
}

/**
 * 判斷兩張圖是否重複。
 *
 * 動圖對動圖時逐格對應比對，過半數相符才算重複，避免開頭相似卻內容不同的動圖被誤刪。
 * 其餘組合維持單格比對。
 * 起始點被裁掉的同一張動圖仍抓不到，那需要整串影格雜湊做滑動對齊，成本高很多
 */
export function isDuplicateFingerprint(
  source: MemeFingerprint,
  target: MemeFingerprint,
  threshold = IMG_SIMILARITY_THRESHOLD,
): boolean {
  const sourceHead = source.hashList[0]
  const targetHead = target.hashList[0]
  if (!sourceHead || !targetHead)
    return false

  if (!source.animated || !target.animated) {
    return distance(sourceHead, targetHead) <= threshold
  }

  const sampleCount = Math.min(source.hashList.length, target.hashList.length)
  let matchedCount = 0
  for (let index = 0; index < sampleCount; index++) {
    if (distance(source.hashList[index]!, target.hashList[index]!) <= threshold) {
      matchedCount++
    }
  }

  return matchedCount * 2 > sampleCount
}
