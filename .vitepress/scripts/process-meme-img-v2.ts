import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { GoogleGenAI } from '@google/genai'
import PQueue from 'p-queue'
import { filter, pipe } from 'remeda'
import sharp from 'sharp'
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
/** 手動加入的資料 */
const MEME_META_EXTEND_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-data-extend.ndjson')

/** 圖片相似度閾值 */
const IMG_SIMILARITY_THRESHOLD = 5

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

/** 更新 JSON 檔案，移除已刪除的 meme */
async function updateJsonData(dataPath: string, removedPaths: string[]) {
  if (!removedPaths.length)
    return

  const removedNames = removedPaths.map((value) => path.basename(value))

  const data = await readFile(dataPath, 'utf8')
  if (!data)
    return

  const lines = pipe(
    data.split(/\r?\n/),
    filter((line) => !removedNames.some((name) => line.includes(name))),
  )

  await writeFile(dataPath, lines.join('\n'), 'utf8')
}
/** 刪除重複迷因 */
async function dedupeMeme() {
  const memePathList = await getFilePathList(MEME_FILE_PATH)

  const hashList = await Promise.all(memePathList.map(async (filePath) => {
    const file = await readFile(filePath)
    const hash = await phash(file)
    return { filePath, hash }
  }))

  const keptMemeList: { filePath: string; hash: string }[] = []
  const removedMemeList: string[] = []

  for (const item of hashList) {
    const isDuplicate = keptMemeList.some(
      (k) => distance(k.hash, item.hash) <= IMG_SIMILARITY_THRESHOLD,
    )

    if (isDuplicate) {
      await unlink(item.filePath)
      removedMemeList.push(item.filePath)
      continue
    }

    // 留第一張
    keptMemeList.push(item)
  }

  // 更新資料
  await updateJsonData(MEME_DATA_PATH, removedMemeList)
  await updateJsonData(MEME_META_EXTEND_PATH, removedMemeList)

  console.log(`[dedupeMeme] 已刪除 ${removedMemeList.length} 張重複圖片`)
}

/** 壓縮現有檔案，會寫入 temp 資料夾中 */
async function minifyCurrentMeme() {
  const fileList = await getFilePathList(MEME_FILE_PATH)
  const queue = new PQueue({ concurrency: 10 })

  const tasks = fileList.map((filePath) => queue.add(async () => {
    const newFile = await sharp(filePath)
      .resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fff' })
      .webp({ quality: 60, effort: 6, smartSubsample: true })
      .toBuffer()

    await writeFile(path.join(
      path.dirname(filePath),
      'temp',
      path.basename(filePath),
    ), newFile)
  }))
  await Promise.all(tasks)
}
// minifyCurrentMeme().catch((e) => {
//   console.error(e)
// })

/** 從上傳資料夾引入 meme */
async function importSourceMeme() {
  const fileList = await pipe(
    await readdir(SOURCE_PATH, { withFileTypes: true }),
    filter((item) => item.isFile()),
    async (list) => {
      const tasks = list.map(async (entry) => {
        const srcPath = path.join(SOURCE_PATH, entry.name)
        const file = await readFile(srcPath)
        let hash = ''
        try {
          hash = await phash(file)
        }
        catch (error) {
          console.error(`🚀 ~ file:`, entry.name)
          console.error(`🚀 ~ error:`, error)
        }

        return {
          entry,
          file,
          srcPath,
          hash,
        }
      })

      const dataList = pipe(
        await Promise.all(tasks),
        filter(({ hash }) => hash !== ''),
      )

      return dataList.reduce((result, dataItem) => {
        const isDuplicate = result.some((resultItem) =>
          distance(resultItem.hash, dataItem.hash) <= IMG_SIMILARITY_THRESHOLD,
        )

        if (!isDuplicate) {
          result.push(dataItem)
        }
        else {
          const filename = path.basename(dataItem.srcPath)
          unlink(dataItem.srcPath)
            .then(() => {
              console.log('[importSourceMeme] 刪除來源重複圖片：', filename)
            })
            .catch((e) => {
              console.warn('[importSourceMeme] 刪除來源重複圖片失敗：', filename, e)
            })
        }

        return result
      }, [] as typeof dataList)
    },
  )

  const hashList = await pipe(
    await getFilePathList(MEME_FILE_PATH),
    (memePathList) => Promise.all(memePathList.map(async (filePath) => {
      const file = await readFile(filePath)
      const hash = await phash(file)
      return { filePath, hash }
    })),
  )

  let count = 0
  for (const { entry, file, hash, srcPath } of fileList) {
    const ext = path.extname(entry.name).toLowerCase()

    // 刪除不符合格式的檔案
    if (!IMAGE_EXTS.has(ext)) {
      try {
        await unlink(srcPath)
      }
      catch (e) {
        console.warn('[importSourceMeme] 刪除圖片失敗：', srcPath, e)
      }
      continue
    }

    // 判斷是否重複
    const isDuplicate = hashList.some((data) => distance(data.hash, hash) <= IMG_SIMILARITY_THRESHOLD)
    if (isDuplicate) {
      try {
        await unlink(srcPath)
        console.log('[importSourceMeme] 刪除重複圖片：', path.basename(srcPath))
      }
      catch (e) {
        console.warn('[importSourceMeme] 刪除重複圖片失敗：', path.basename(srcPath), e)
      }
      continue
    }

    // 轉 webp、最長邊 700px
    const id = randomUUID()
    const dstPath = path.join(MEME_FILE_PATH, `meme-${id}.webp`)

    try {
      await sharp(file)
        .resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#fff' })
        .webp({ quality: 60, effort: 6, smartSubsample: true })
        .toFile(dstPath)

      count++

      // 刪除來源檔
      try {
        await unlink(srcPath)
      }
      catch (e) {
        console.warn('[importSourceMeme] 刪除來源檔失敗：', srcPath, e)
      }
    }
    catch (e) {
      console.error('[importSourceMeme] 轉檔失敗：', srcPath, e)
    }
  }

  console.log(`[importSourceMeme] 已匯入 ${count} 張圖片`)
}

async function main() {
  // await dedupeMeme()
  await importSourceMeme()

  const queue = new PQueue({ concurrency: 5 })
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  })
  const ndjsonStream = createWriteStream(MEME_DATA_PATH, { flags: 'a', encoding: 'utf8' })

  const memeFilePathList = await getMemePathList()
  console.log(`[main] ${memeFilePathList.length} 個檔案待處理`)

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
      {
        text: [
          '分析圖片，回傳 JSON（不要 markdown）：',
          '{"describe":"…","ocr":"…","keyword":"…"}',
          '',
          'describe：用正體中文寫 1-2 句話，只寫主體特徵、表情、出處作品名。',
          '  禁止：「此為網路迷因」「背景模糊」「無文字」「無人物」「來源不明」「出處不明」「整體呈現…情緒」。',
          '  禁止：「圖片顯示」「畫面中央是」等開頭贅詞。',
          '  禁止：描述背景細節、服裝細節、氛圍總結。',
          '  圖上文字不要寫進 describe，放 ocr 即可。',
          '  諧音雙關格式：「X」為「Y」諧音。忽略浮水印。',
          'ocr：圖上所有可見文字，原樣抄錄，多段以空格分隔。無文字則留空字串。',
          'keyword：搜尋用關鍵字與同義詞，逗號分隔。諧音雙關，則要加上「諧音」',
          '',
          '範例：',
          '紅色星際戰士頭盔與機械手，黃光眼，黑色鳥形徽章。出自《戰鎚40,000》',
          '橙色兔耳熊絨毛玩具手持小斧從牆角探頭，神情滑稽卻帶威脅',
          '白鴨站在趴臥狗背上，狗神情無奈，「背感鴨力」為「壓力」諧音',
        ].join('\n'),
      },
    ]

    const response = await ai.models.generateContent({
      // model: 'gemini-2.5-pro',
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const parsed = JSON.parse(response.text ?? '{}')
    const result = pipe(
      {
        file: path.basename(filePath),
        describe: parsed.describe ?? '',
        ocr: parsed.ocr ?? '',
        keyword: parsed.keyword ?? '',
      },
      (data) => JSON.stringify(data).replaceAll('\n', ''),
    )

    // console.log(result)
    count++
    console.log(`[main] ${count}/${memeFilePathList.length}`)

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
  console.log('[main] done')
}

main().catch((e) => {
  console.error(e)
})
