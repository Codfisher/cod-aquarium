import type { MemeFingerprint } from '../utils/meme-dedupe'
import type { FrameSheet } from '../utils/meme-frame-sheet'
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { GoogleGenAI } from '@google/genai'
import PQueue from 'p-queue'
import { filter, pipe } from 'remeda'
import sharp from 'sharp'
import { computeBlurLevel } from '../utils/blur-estimator'
import { parseMemeAnalysis } from '../utils/meme-analysis-parser'
import { buildFrameSprite, buildPoster, getSpriteFrameDelayList, normalizeAnimatedMeme } from '../utils/meme-animation'
import { createFingerprint, isDuplicateFingerprint } from '../utils/meme-dedupe'
import { EMOTION_LIST, EMOTION_MAX_COUNT, parseEmotionList } from '../utils/meme-emotion'
import { buildFrameSheet, getFrameCount } from '../utils/meme-frame-sheet'

const __dirname = import.meta.dirname

/** 待處理圖片的來源資料夾。各台電腦路徑不同，可在 .env.local 覆寫 */
const SOURCE_PATH = process.env.MEME_SOURCE_PATH ?? 'D:/Google 雲端硬碟/待處理 meme'
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

/** 靜態圖輸出的最長邊 */
const STATIC_MAX_SIZE = 700

const MEME_FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
/** 動圖的首格靜態圖，列表用 */
const MEME_POSTER_PATH = path.resolve(__dirname, '../../content/public/meme-posters')
/** 動圖的影格長圖，編輯器輸出動圖用 */
const MEME_SPRITE_PATH = path.resolve(__dirname, '../../content/public/meme-sprites')

/** 附加資料。版本等等 */
const MEME_META_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-meta.json')
/** 圖片資料 */
const MEME_DATA_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-data.ndjson')
/** 手動加入的資料 */
const MEME_META_EXTEND_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-data-extend.ndjson')

/** 動圖的衍生檔案。首格圖給列表，影格長圖給編輯器 */
async function writeAnimatedAsset(memePath: string) {
  const filename = path.basename(memePath)

  await mkdir(MEME_POSTER_PATH, { recursive: true })
  await writeFile(path.join(MEME_POSTER_PATH, filename), await buildPoster(memePath))

  await mkdir(MEME_SPRITE_PATH, { recursive: true })
  await writeFile(path.join(MEME_SPRITE_PATH, filename), await buildFrameSprite(memePath))
}

/** 刪迷因時一併清掉衍生檔案，免得殘留成孤兒 */
async function removeAnimatedAsset(memePath: string) {
  const filename = path.basename(memePath)

  for (const directory of [MEME_POSTER_PATH, MEME_SPRITE_PATH]) {
    const assetPath = path.join(directory, filename)
    if (!existsSync(assetPath))
      continue

    try {
      await unlink(assetPath)
    }
    catch (e) {
      console.warn('[removeAnimatedAsset] 刪除衍生檔案失敗：', assetPath, e)
    }
  }
}

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
interface MemeHash {
  filePath: string;
  fingerprint: MemeFingerprint;
}

/** 讀出每張迷因的感知雜湊。動圖會取樣多格，避免只憑第一格誤判 */
async function getMemeHashList(memePathList: string[]): Promise<MemeHash[]> {
  return Promise.all(memePathList.map(async (filePath) => ({
    filePath,
    fingerprint: await createFingerprint(await readFile(filePath)),
  })))
}

/** 移除迷因本體、衍生檔案與資料 */
async function removeMeme(memePathList: string[]) {
  for (const memePath of memePathList) {
    try {
      await unlink(memePath)
    }
    catch (e) {
      console.warn('[removeMeme] 刪除圖片失敗：', memePath, e)
    }
    await removeAnimatedAsset(memePath)
  }

  await updateJsonData(MEME_DATA_PATH, memePathList)
  await updateJsonData(MEME_META_EXTEND_PATH, memePathList)
}

/** 刪除重複迷因 */
async function dedupeMeme() {
  const hashList = await getMemeHashList(await getFilePathList(MEME_FILE_PATH))

  const keptMemeList: MemeHash[] = []
  const removedMemeList: string[] = []

  for (const item of hashList) {
    const duplicateIndex = keptMemeList.findIndex(
      (kept) => isDuplicateFingerprint(kept.fingerprint, item.fingerprint),
    )

    if (duplicateIndex === -1) {
      // 留第一張
      keptMemeList.push(item)
      continue
    }

    // 動圖的資訊量高於靜態圖，撞到靜態圖時反過來讓動圖留下
    const kept = keptMemeList[duplicateIndex]
    if (kept && item.fingerprint.animated && !kept.fingerprint.animated) {
      removedMemeList.push(kept.filePath)
      keptMemeList[duplicateIndex] = item
      continue
    }

    removedMemeList.push(item.filePath)
  }

  await removeMeme(removedMemeList)

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
  if (!existsSync(SOURCE_PATH)) {
    console.warn(`[importSourceMeme] 來源資料夾不存在，略過匯入：${SOURCE_PATH}`)
    return
  }

  const fileList = await pipe(
    await readdir(SOURCE_PATH, { withFileTypes: true }),
    filter((item) => item.isFile()),
    async (list) => {
      const tasks = list.map(async (entry) => {
        const srcPath = path.join(SOURCE_PATH, entry.name)
        const file = await readFile(srcPath)
        let fingerprint: MemeFingerprint | undefined
        try {
          fingerprint = await createFingerprint(file)
        }
        catch (error) {
          console.error(`🚀 ~ file:`, entry.name)
          console.error(`🚀 ~ error:`, error)
        }

        return {
          entry,
          file,
          srcPath,
          fingerprint,
        }
      })

      const dataList = pipe(
        await Promise.all(tasks),
        filter((item) => Boolean(item.fingerprint)),
        (list) => list.map((item) => ({ ...item, fingerprint: item.fingerprint! })),
      )

      function dropSourceFile(filePath: string) {
        const filename = path.basename(filePath)
        unlink(filePath)
          .then(() => {
            console.log('[importSourceMeme] 刪除來源重複圖片：', filename)
          })
          .catch((e) => {
            console.warn('[importSourceMeme] 刪除來源重複圖片失敗：', filename, e)
          })
      }

      return dataList.reduce((result, dataItem) => {
        const duplicateIndex = result.findIndex((resultItem) =>
          isDuplicateFingerprint(resultItem.fingerprint, dataItem.fingerprint),
        )

        if (duplicateIndex === -1) {
          result.push(dataItem)
          return result
        }

        // 同一批同時上傳動圖與其靜態截圖時，留資訊量高的動圖
        const duplicate = result[duplicateIndex]
        if (duplicate && dataItem.fingerprint.animated && !duplicate.fingerprint.animated) {
          result[duplicateIndex] = dataItem
          dropSourceFile(duplicate.srcPath)
          return result
        }

        dropSourceFile(dataItem.srcPath)
        return result
      }, [] as typeof dataList)
    },
  )

  const hashList = await getMemeHashList(await getFilePathList(MEME_FILE_PATH))

  let count = 0
  for (const { entry, file, fingerprint, srcPath } of fileList) {
    const animated = fingerprint.animated
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
    const duplicateIndex = hashList.findIndex(
      (data) => isDuplicateFingerprint(data.fingerprint, fingerprint),
    )
    if (duplicateIndex !== -1) {
      const duplicate = hashList[duplicateIndex]

      // 來源是動圖、既有是靜態圖時，讓動圖取代靜態圖，其餘一律丟掉來源
      if (!duplicate || !animated || duplicate.fingerprint.animated) {
        try {
          await unlink(srcPath)
          console.log('[importSourceMeme] 刪除重複圖片：', path.basename(srcPath))
        }
        catch (e) {
          console.warn('[importSourceMeme] 刪除重複圖片失敗：', path.basename(srcPath), e)
        }
        continue
      }

      await removeMeme([duplicate.filePath])
      hashList.splice(duplicateIndex, 1)
      console.log('[importSourceMeme] 動圖取代既有靜態圖：', path.basename(duplicate.filePath))
    }

    // 一律轉 webp，動圖輸出動態 webp。副檔名不變，前端 <img> 原生就會播
    const id = randomUUID()
    const dstPath = path.join(MEME_FILE_PATH, `meme-${id}.webp`)

    try {
      if (animated) {
        await writeFile(dstPath, await normalizeAnimatedMeme(file))
        await writeAnimatedAsset(dstPath)
      }
      else {
        await sharp(file)
          .resize({ width: STATIC_MAX_SIZE, height: STATIC_MAX_SIZE, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#fff' })
          .webp({ quality: 60, effort: 6, smartSubsample: true })
          .toFile(dstPath)
      }

      hashList.push({ filePath: dstPath, fingerprint })
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

/** 為既有 ndjson 資料補上 blurLevel */
async function backfillBlurLevel() {
  const raw = await readFile(MEME_DATA_PATH, 'utf8')
  const lineList = raw.split(/\r?\n/).filter((line) => line.trim())

  const queue = new PQueue({ concurrency: 10 })
  let updatedCount = 0

  const updatedLineList: string[] = await Promise.all(
    lineList.map((line) => queue.add<string>(async () => {
      const obj = JSON.parse(line)
      delete obj.blurScore

      const filePath = path.resolve(MEME_FILE_PATH, obj.file)
      if (!existsSync(filePath)) {
        return line
      }

      obj.blurLevel = await computeBlurLevel(filePath)
      updatedCount++
      return JSON.stringify(obj).replaceAll('\n', '')
    })),
  )

  await writeFile(MEME_DATA_PATH, `${updatedLineList.join('\n')}\n`, 'utf8')
  console.log(`[backfillBlurLevel] 已更新 ${updatedCount} 筆資料`)
}

/** 產生分析用提示詞。傳入影格拼圖資訊時，改用動圖的敘述規則 */
function buildAnalysisPrompt(sheet?: FrameSheet): string {
  const animatedRuleList = sheet
    ? [
        `這張圖是動圖抽出的 ${sheet.frameCount} 格連續影格拼圖，每列 ${sheet.columnCount} 格，由左至右、由上至下依序播放。灰色格線只是分隔用，不是畫面內容。`,
        'describe 要寫出動作變化與結果，禁止逐格敘述，禁止出現「影格」「拼圖」「格線」「連續」等字眼。',
        'ocr：各格文字可能不同，依播放順序全部抄錄，重複的只抄一次。',
        '',
      ]
    : []

  return [
    '分析圖片，回傳 JSON（不要 markdown）：',
    '{"describe":"…","ocr":"…","keyword":"…","emotion":"…"}',
    '',
    ...animatedRuleList,
    'describe：用正體中文寫 1-2 句話，只寫主體特徵、表情、出處作品名。',
    '  禁止：「此為網路迷因」「背景模糊」「無文字」「無人物」「來源不明」「出處不明」「整體呈現…情緒」。',
    '  禁止：「圖片顯示」「畫面中央是」等開頭贅詞。',
    '  禁止：描述背景細節、服裝細節、氛圍總結。',
    '  圖上文字不要寫進 describe，放 ocr 即可。',
    '  諧音雙關格式：「X」為「Y」諧音。忽略浮水印。',
    'ocr：圖上所有可見文字，原樣抄錄，多段以空格分隔。無文字則留空字串。',
    'keyword：搜尋用關鍵字與同義詞，逗號分隔。諧音雙關，則要加上「諧音」',
    `emotion：這張圖「拿來表達」的情緒，只能從此清單挑，逗號分隔，最多 ${EMOTION_MAX_COUNT} 個：`,
    `  ${EMOTION_LIST.join('、')}`,
    '  判斷依據是使用時機，不是圖中人物的心情。挑不出來就留空字串。',
    '',
    '範例：',
    '紅色星際戰士頭盔與機械手，黃光眼，黑色鳥形徽章。出自《戰鎚40,000》',
    '橙色兔耳熊絨毛玩具手持小斧從牆角探頭，神情滑稽卻帶威脅',
    '白鴨站在趴臥狗背上，狗神情無奈，「背感鴨力」為「壓力」諧音',
  ].join('\n')
}

/**
 * 匯入來源圖片並產生初稿資料。
 *
 * 這裡的分析結果只是初稿，動作方向與出處常出錯，
 * 之後一律要跑 `npm run task:review-meme` 由人逐張核對過才算完成
 */
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
  let failedCount = 0

  /** 分析單張迷因並寫入 ndjson */
  async function analyzeMeme(filePath: string) {
    const frameCount = await getFrameCount(filePath)
    const animated = frameCount > 1

    // 模型讀不到動圖的動作，故改送影格拼圖
    const sheet = animated ? await buildFrameSheet(filePath) : undefined
    const base64ImageFile = sheet
      ? sheet.buffer.toString('base64')
      : await readFile(filePath, { encoding: 'base64' })

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: 'image/webp',
            data: base64ImageFile,
          },
        },
        {
          text: buildAnalysisPrompt(sheet),
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    })

    // 動圖首格常是淡入或空畫面，取中間格才代表得了整體清晰度
    const blurLevel = await computeBlurLevel(filePath, Math.floor(frameCount / 2))

    // 只取文字 part，避免 response.text 遇到 thoughtSignature 時印出警告
    // 思考內容不是答案，混進來會讓 JSON 解析失敗
    const textList = response.candidates?.[0]?.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text)) ?? []

    const parsed = parseMemeAnalysis(textList.join(''))
    const result = pipe(
      {
        file: path.basename(filePath),
        describe: parsed.describe ?? '',
        ocr: parsed.ocr ?? '',
        keyword: parsed.keyword ?? '',
        emotion: parseEmotionList(parsed.emotion).join(','),
        blurLevel,
        // 影格長圖的格數少於動圖本身，編輯器讀的是長圖，故間隔要對齊長圖
        ...(animated
          ? {
              animated: true,
              frameDelayList: await getSpriteFrameDelayList(filePath),
            }
          : {}),
      },
      (data) => JSON.stringify(data).replaceAll('\n', ''),
    )

    ndjsonStream.write(`${result}\n`)
  }

  const tasks = memeFilePathList.map(async (filePath) => queue.add(async () => {
    try {
      await analyzeMeme(filePath)
    }
    catch (e) {
      failedCount++
      console.error(`[main] 分析失敗，略過：${path.basename(filePath)}`, e)
      return
    }

    count++
    console.log(`[main] ${count}/${memeFilePathList.length}`)
  }))

  await Promise.all(tasks)
  if (failedCount > 0) {
    console.warn(`[main] ${failedCount} 張分析失敗，未寫入資料`)
  }

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

  console.log(`[main] done，${count} 張待審。接著執行 npm run task:review-meme -- list`)
}

// backfillBlurLevel().catch(console.error)

main().catch((e) => {
  console.error(e)
})
