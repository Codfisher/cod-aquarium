import type { MemeItem } from './meme-seo'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeExtendEmotion, parseMemeNdjson } from './meme-seo'

/** build 時讀取迷因資料，僅供 Node 端（config、vite plugin、動態路由）使用，不可被頁面匯入 */

const MEMES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/memes')

/** 自動分析的主檔，決定迷因清單與順序 */
export const MEME_NDJSON_PATH = resolve(MEMES_DIR, 'a-memes-data.ndjson')
/** 手動標註檔，只用來補情緒標籤 */
export const MEME_EXTEND_NDJSON_PATH = resolve(MEMES_DIR, 'a-memes-data-extend.ndjson')

export function readSeoMemeList(): MemeItem[] {
  return mergeExtendEmotion(
    parseMemeNdjson(readFileSync(MEME_NDJSON_PATH, 'utf-8')),
    parseMemeNdjson(readFileSync(MEME_EXTEND_NDJSON_PATH, 'utf-8')),
  )
}
