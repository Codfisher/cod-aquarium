import type sharp from 'sharp'
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { GoogleGenAI } from '@google/genai'
import PQueue from 'p-queue'
import { chunk, filter, pipe, tap } from 'remeda'
import phash from 'sharp-phash'
import distance from 'sharp-phash/distance'

const __dirname = import.meta.dirname

const SOURCE_PATH = 'D:/Google 雲端硬碟/待處理 meme'
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

const MEME_FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
/** 附加資料。版本等等 */
const MEME_META_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-meta.json')
/** 圖片資料 */
const MEME_DATA_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-data.ndjson')

async function readExistingFilenames(ndjsonPath: string): Promise<Set<string>> {
  const names = new Set<string>()
  if (!existsSync(ndjsonPath))
    return names

  const stream = createReadStream(ndjsonPath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    const string = line.trim()
    if (!string)
      continue

    try {
      const obj = JSON.parse(string)
      const name = typeof obj?.file === 'string' ? obj.file : undefined
      if (name)
        names.add(name)
    }
    catch { }
  }
  return names
}

/** 取得檔案 */
async function getFilePathList(baseDirectory: string, { recursive = false } = {}) {
  const files: string[] = []

  async function walk(dirPath: string) {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (recursive) {
          await walk(fullPath)
        }
      }
      else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath)
      }
    }
  }

  await walk(baseDirectory)
  return files
}

/** 取得 meme 檔案 */
async function getMemePathList() {
  const existingNames = await readExistingFilenames(MEME_DATA_PATH)

  const memeList = pipe(
    await getFilePathList(MEME_FILE_PATH),
    filter((filePath) => !existingNames.has(path.basename(filePath))),
  )

  return memeList
}

/** 刪除重複迷因 */
async function dedupeMeme() {
  const memePathList = await getFilePathList(MEME_FILE_PATH)

  const hashList = await Promise.all(memePathList.map(async (filePath) => {
    const file = await readFile(filePath)
    const hash = await phash(file)
    return { filePath, hash }
  }))

  const kept: { filePath: string; hash: string }[] = []
  const removed: string[] = []

  for (const item of hashList) {
    const isDuplicate = kept.some((k) => distance(k.hash, item.hash) <= 5)

    if (isDuplicate) {
      await unlink(item.filePath)
      removed.push(item.filePath)
      continue
    }

    // 留第一張
    kept.push(item)
  }
}

async function main() {
  await dedupeMeme()

  const queue = new PQueue({ concurrency: 5 })
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  })
  const ndjsonStream = createWriteStream(MEME_DATA_PATH, { flags: 'a', encoding: 'utf8' })

  const memeFilePathList = await getMemePathList()
  console.log(`[meme] ${memeFilePathList.length} 個檔案待處理`)

  let count = 0
  const tasks = memeFilePathList.map(async (filePath) => queue.add(async () => {
    const base64ImageFile = await readFile(filePath, { encoding: 'base64' })

    const contents = [
      {
        inlineData: {
          mimeType: 'image/webp',
          data: base64ImageFile,
        },
      },
      { text: '描述圖片，句子越精簡越好，描述人物、景色、情緒、文字、出自甚麼作品，不要任何格式，使用正體中文' },
    ]

    const response = await ai.models.generateContent({
      // model: 'gemini-2.5-pro',
      model: 'gemini-2.5-flash',
      contents,
    })

    const result = pipe(
      {
        file: path.basename(filePath),
        describe: response.text,
        ocr: '',
        keyword: '',
      },
      (data) => JSON.stringify(data).replaceAll('\n', ''),
    )

    // console.log(result)
    count++
    console.log(`[meme] ${count}/${memeFilePathList.length}`)

    ndjsonStream.write(`${result}\n`)
  }))
  await Promise.all(tasks)

  await new Promise<void>((resolve, reject) => {
    ndjsonStream.on('finish', resolve)
    ndjsonStream.on('error', reject)
    ndjsonStream.end()
  })

  await writeFile(
    MEME_META_PATH,
    JSON.stringify({
      updatedAt: Math.floor(Date.now() / 1000),
    }),
    'utf8',
  )
  console.log('[meme] done')
}

main().catch((e) => {
  console.error(e)
})
