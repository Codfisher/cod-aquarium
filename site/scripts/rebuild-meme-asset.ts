import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import PQueue from 'p-queue'
import { buildFrameSprite, buildPoster, getSpriteFrameDelayList } from '../utils/meme-animation'

const __dirname = import.meta.dirname

const MEME_FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
const MEME_DATA_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-data.ndjson')
const MEME_POSTER_PATH = path.resolve(__dirname, '../../content/public/meme-posters')
const MEME_SPRITE_PATH = path.resolve(__dirname, '../../content/public/meme-sprites')

interface MemeRow {
  file: string;
  animated?: boolean;
  frameDelayList?: number[];
}

/**
 * 依現有動圖重建首格圖、影格長圖與影格間隔。
 *
 * 長圖的排版規則改動時（例如從單欄改成格狀），舊檔的格數與排列都會對不上，
 * 但動圖本體還在，衍生檔可以直接重生，不必重新匯入
 */
async function main() {
  const content = readFileSync(MEME_DATA_PATH, 'utf8')
  const lineList = content.split(/\r?\n/)

  await mkdir(MEME_POSTER_PATH, { recursive: true })
  await mkdir(MEME_SPRITE_PATH, { recursive: true })

  const queue = new PQueue({ concurrency: 4 })
  let count = 0
  let failedCount = 0

  const nextLineList = await Promise.all(lineList.map((line) => queue.add(async () => {
    if (!line.trim()) {
      return line
    }

    let row: MemeRow
    try {
      row = JSON.parse(line) as MemeRow
    }
    catch {
      return line
    }

    if (!row.animated) {
      return line
    }

    const filePath = path.join(MEME_FILE_PATH, row.file)
    if (!existsSync(filePath)) {
      console.warn('[rebuild] 找不到動圖，略過：', row.file)
      return line
    }

    try {
      await writeFile(path.join(MEME_POSTER_PATH, row.file), await buildPoster(filePath))
      await writeFile(path.join(MEME_SPRITE_PATH, row.file), await buildFrameSprite(filePath))

      const frameDelayList = await getSpriteFrameDelayList(filePath)
      count++
      console.log(`[rebuild] ${row.file.slice(5, 13)} ${row.frameDelayList?.length ?? 0} → ${frameDelayList.length} 格`)

      return JSON.stringify({ ...row, frameDelayList }).replaceAll('\n', '')
    }
    catch (e) {
      failedCount++
      console.error('[rebuild] 重建失敗：', row.file, e)
      return line
    }
  })))

  writeFileSync(MEME_DATA_PATH, nextLineList.join('\n'), 'utf8')

  console.log(`[rebuild] 完成 ${count} 張${failedCount ? `，失敗 ${failedCount} 張` : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
