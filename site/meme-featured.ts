import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { shuffle } from 'remeda'
import { CONTENT_PUBLIC_DIR, MEME_NDJSON_RELATIVE_PATH, PROJECT_ROOT } from './constants'
import { BlurLevel } from './utils/blur-level'

/** 快取梗圖首屏梗圖的欄位，與 app 的 MemeData 相容（見 content/aquarium/meme-cache/domains/meme/type.ts） */
export interface FeaturedMeme {
  file: string;
  describe: string;
  ocr: string;
  keyword: string;
  emotion: string;
  blurLevel?: BlurLevel;
}

/** 首屏梗圖數：img-list 第二列之後是廣告版位，首屏最多兩列，桌機 5 欄 × 2 列 */
export const FEATURED_MEME_COUNT = 10

/** 從梗圖資料隨機挑出首屏用的梗圖，每次 build 挑一次。
 *
 * 只挑靜態且清晰的：動圖在可懸停的裝置上會改顯示預覽圖（/meme-posters/），網址與 HTML 預先放的對不上，交接時會重新下載；
 * 模糊的圖不適合當第一眼
 */
export function getFeaturedMemeList(count = FEATURED_MEME_COUNT): FeaturedMeme[] {
  const ndjsonPath = path.join(PROJECT_ROOT, MEME_NDJSON_RELATIVE_PATH)
  const candidateList = readFileSync(ndjsonPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as FeaturedMeme & { animated?: boolean; excluded?: boolean })
    .filter((meme) => !meme.excluded)
    .filter((meme) => !meme.animated)
    .filter((meme) => meme.blurLevel === undefined || meme.blurLevel <= BlurLevel.LEVEL_1)
    .filter((meme) => existsSync(path.join(CONTENT_PUBLIC_DIR, 'memes', meme.file)))

  return shuffle(candidateList)
    .slice(0, count)
    .map(({ file, describe, ocr, keyword, emotion, blurLevel }) => ({
      file,
      describe: describe ?? '',
      ocr: ocr ?? '',
      keyword: keyword ?? '',
      emotion: emotion ?? '',
      blurLevel,
    }))
}
