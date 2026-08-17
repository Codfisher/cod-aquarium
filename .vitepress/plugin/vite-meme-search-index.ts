import type { Plugin } from 'vite'
import type { MemeData } from '../../content/aquarium/meme-cache/domains/meme/type'
import { Buffer } from 'node:buffer'
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSearchIndexData } from '../../content/aquarium/meme-cache/domains/meme/meme-search-core'
import { mergeMemeDataList } from '../../content/aquarium/meme-cache/domains/meme/merge-meme-data'
import { memeDataSchema } from '../../content/aquarium/meme-cache/domains/meme/type'

const MEME_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../content/public/memes',
)
const BASE_NDJSON_PATH = resolve(MEME_DIR, 'a-memes-data.ndjson')
const EXTEND_NDJSON_PATH = resolve(MEME_DIR, 'a-memes-data-extend.ndjson')

/** 產出路徑必須與 useMemeSearch 的 SEARCH_INDEX_URL 一致 */
const OUTPUT_FILE_NAME = 'memes/a-memes-search-index.json'
const OUTPUT_URL = `/${OUTPUT_FILE_NAME}`

function readMemeMap(filePath: string): Map<string, MemeData> {
  const result = new Map<string, MemeData>()

  let raw = ''
  try {
    raw = readFileSync(filePath, 'utf-8')
  }
  catch {
    return result
  }

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim())
      continue

    try {
      const parsed = memeDataSchema.safeParse(JSON.parse(line))
      if (parsed.success) {
        result.set(parsed.data.file, parsed.data)
      }
    }
    catch {
      // 單行損毀不該讓整份索引產不出來
    }
  }

  return result
}

/** 匯出供檢查腳本重複使用，確認索引與資料真的對得上 */
export function buildMemeSearchIndexJson(): string {
  const dataList = mergeMemeDataList(
    readMemeMap(BASE_NDJSON_PATH),
    readMemeMap(EXTEND_NDJSON_PATH),
  )

  return JSON.stringify({
    count: dataList.length,
    firstFile: dataList[0]?.file ?? '',
    lastFile: dataList[dataList.length - 1]?.file ?? '',
    index: createSearchIndexData(dataList),
  })
}

/**
 * 預先產出快取梗圖的 Fuse 搜尋索引。
 *
 * 近千筆資料建索引約需數百毫秒，過去在使用者按下第一個字時才做；
 * 改於建置期產好靜態檔，執行期 worker 直接 parseIndex 即可搜尋。
 * 檔名與筆數對不上時執行期會自行重建，不會查到錯的結果。
 */
export function viteMemeSearchIndex(): Plugin {
  let isSsrBuild = false

  return {
    name: 'meme-search-index',
    configResolved(config) {
      isSsrBuild = Boolean(config.build.ssr)
    },
    configureServer(server) {
      // dev 時即時反映 ndjson 異動，不必重啟
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(OUTPUT_URL)) {
          next()
          return
        }

        res.setHeader('Content-Type', 'application/json')
        res.end(buildMemeSearchIndexJson())
      })
    },
    buildStart() {
      if (isSsrBuild)
        return

      this.addWatchFile(BASE_NDJSON_PATH)
      this.addWatchFile(EXTEND_NDJSON_PATH)
    },
    generateBundle() {
      // SSR 那一輪的產物不會進 dist 靜態目錄，發出來只是白費工
      if (isSsrBuild)
        return

      const source = buildMemeSearchIndexJson()
      this.emitFile({
        type: 'asset',
        fileName: OUTPUT_FILE_NAME,
        source,
      })

      const sizeKb = Math.round(Buffer.byteLength(source) / 1024)
      const sourceKb = Math.round(statSync(BASE_NDJSON_PATH).size / 1024)
      this.info?.(`[meme-search-index] ${sizeKb} KB（原始資料 ${sourceKb} KB）`)
    },
  }
}
