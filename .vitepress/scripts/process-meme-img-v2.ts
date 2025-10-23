import type sharp from 'sharp'
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { GoogleGenAI } from '@google/genai'
import PQueue from 'p-queue'
import { chunk, pipe, tap } from 'remeda'

const __dirname = import.meta.dirname

const FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

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

/** 取得不重複的檔案 */
async function getMemeFilePathList(dir: string, { recursive = true } = {}) {
  const files: string[] = []

  const existingNames = await readExistingFilenames(MEME_DATA_PATH)

  const pickedNames = new Set<string>(existingNames)

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
        const baseName = path.basename(entry.name)
        if (!pickedNames.has(baseName)) {
          pickedNames.add(baseName)
          files.push(fullPath)
        }
      }
    }
  }

  await walk(dir)
  return files
}

async function main() {
  const queue = new PQueue({ concurrency: 5 })
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  })
  const ndjsonStream = createWriteStream(MEME_DATA_PATH, { flags: 'a', encoding: 'utf8' })

  const memeFilePathList = await getMemeFilePathList(FILE_PATH)
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
