import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getKeywordGroupList, parseMemeNdjson } from '../meme-seo'

const NDJSON_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../public/memes/a-memes-data.ndjson',
)

/** 為每個高頻關鍵字產生著陸頁，承接「XX 迷因」這類長尾搜尋 */
export default {
  paths() {
    const groupList = getKeywordGroupList(parseMemeNdjson(readFileSync(NDJSON_PATH, 'utf-8')))

    return groupList.map((group) => ({
      params: {
        keyword: group.keyword,
        count: group.memeList.length,
        memeListJson: JSON.stringify(group.memeList),
      },
    }))
  },
}
