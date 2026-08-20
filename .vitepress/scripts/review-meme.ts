import { Buffer } from 'node:buffer'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'
import { EMOTION_LIST, EMOTION_MAX_COUNT, isEmotion } from '../utils/meme-emotion'
import { buildFrameSheet } from '../utils/meme-frame-sheet'

const __dirname = import.meta.dirname

const MEME_FILE_PATH = path.resolve(__dirname, '../../content/public/memes')
const MEME_DATA_PATH = path.resolve(__dirname, '../../content/public/memes/a-memes-data.ndjson')
/** 審查用圖片的輸出位置，不進版控 */
const OUTPUT_PATH = path.resolve(__dirname, '../../.meme-review')

/** 可被審查修改的欄位，其餘由管線產生，不開放手改 */
const EDITABLE_KEY_LIST = ['describe', 'ocr', 'keyword', 'emotion'] as const
type EditableKey = typeof EDITABLE_KEY_LIST[number]

interface MemeRow {
  file: string;
  describe: string;
  ocr: string;
  keyword: string;
  emotion: string;
  animated?: boolean;
  /** 已由人核對過。未核對的一律視為初稿 */
  reviewed?: boolean;
}

function readLineList(): string[] {
  return readFileSync(MEME_DATA_PATH, 'utf8').split(/\r?\n/)
}

function parseRow(line: string): MemeRow | undefined {
  if (!line.trim())
    return undefined

  try {
    return JSON.parse(line) as MemeRow
  }
  catch {
    return undefined
  }
}

function toId(file: string) {
  return file.replace(/\.webp$/, '')
}

/**
 * 尚未核對的項目。
 *
 * 新資料是附加在檔尾，故反轉後最新的排在最前面，
 * 剛匯入的那批才不會被舊資料淹沒
 */
function getPendingList(): MemeRow[] {
  return readLineList()
    .map(parseRow)
    .filter((row): row is MemeRow => Boolean(row?.file) && !row!.reviewed)
    .reverse()
}

function findRow(id: string): MemeRow {
  const row = readLineList()
    .map(parseRow)
    .find((item) => item && toId(item.file) === id)

  if (!row) {
    throw new Error(`找不到 ${id}`)
  }
  return row
}

/** 只改動目標那一行，其餘位元組原樣保留，避免整份檔案產生假 diff */
function writeRow(id: string, patch: Partial<Record<EditableKey, string>>) {
  const content = readFileSync(MEME_DATA_PATH, 'utf8')
  const lineStart = content.indexOf(`{"file":"${id}.webp"`)
  if (lineStart === -1) {
    throw new Error(`找不到 ${id}`)
  }

  const lineEnd = content.indexOf('\n', lineStart)
  const rawLine = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).replace(/\r$/, '')
  const data = JSON.parse(rawLine) as MemeRow

  // 經手過就等於核對過，不必再多下一道指令
  Object.assign(data, patch, { reviewed: true })
  const nextLine = JSON.stringify(data).replaceAll('\n', '')

  writeFileSync(
    MEME_DATA_PATH,
    content.slice(0, lineStart) + nextLine + content.slice(lineStart + rawLine.length),
    'utf8',
  )
}

function assertEmotion(value: string) {
  const itemList = value.split(',').map((item) => item.trim()).filter(Boolean)

  const invalidList = itemList.filter((item) => !isEmotion(item))
  if (invalidList.length) {
    throw new Error(`情緒標籤不在清單內：${invalidList.join('、')}\n可用值：${EMOTION_LIST.join('、')}`)
  }
  if (itemList.length > EMOTION_MAX_COUNT) {
    throw new Error(`情緒標籤最多 ${EMOTION_MAX_COUNT} 個，收到 ${itemList.length} 個`)
  }
}

async function buildSheet(id: string) {
  await mkdir(OUTPUT_PATH, { recursive: true })

  const filePath = path.join(MEME_FILE_PATH, `${id}.webp`)
  const frameCount = (await sharp(filePath).metadata()).pages ?? 1
  const outputPath = path.join(OUTPUT_PATH, `${id}.webp`)

  // 靜態圖直接輸出一份，審查流程才不必分兩種路徑
  const buffer = frameCount > 1
    ? (await buildFrameSheet(filePath)).buffer
    : await sharp(filePath).webp({ quality: 85 }).toBuffer()

  await writeFile(outputPath, buffer)
  return { outputPath, frameCount }
}

/** 九宮格的九等分區塊，`crop` 用九宮格位置指定要放大的範圍 */
const CROP_AREA_MAP = {
  '左上': [0, 0],
  '上': [1, 0],
  '右上': [2, 0],
  '左': [0, 1],
  '中': [1, 1],
  '右': [2, 1],
  '左下': [0, 2],
  '下': [1, 2],
  '右下': [2, 2],
} as const
type CropArea = keyof typeof CROP_AREA_MAP

function isCropArea(value: string): value is CropArea {
  return value in CROP_AREA_MAP
}

/**
 * 放大靜態圖的指定區塊並加強對比。
 *
 * 迷因圖多半是低解析度轉存，爪子、手勢、小字這類細節在原圖看不出來，
 * 而動作方向常常就卡在這種細節上。九宮格解決的是「時間」，這裡解決的是「空間」
 */
async function buildCrop(id: string, area: CropArea) {
  await mkdir(OUTPUT_PATH, { recursive: true })

  const filePath = path.join(MEME_FILE_PATH, `${id}.webp`)
  const metadata = await sharp(filePath).metadata()
  const width = metadata.width ?? 1
  const height = metadata.pageHeight ?? metadata.height ?? 1

  const [column, row] = CROP_AREA_MAP[area]
  // 區塊間互相重疊，跨在邊界上的細節才不會被切成兩半
  const cellWidth = Math.round(width * 0.45)
  const cellHeight = Math.round(height * 0.45)
  const left = Math.min(Math.round(column * width * 0.275), width - cellWidth)
  const top = Math.min(Math.round(row * height * 0.275), height - cellHeight)

  const buffer = await sharp(filePath, { page: 0 })
    .extract({ left, top, width: cellWidth, height: cellHeight })
    .resize({ width: 900, kernel: 'lanczos3', withoutEnlargement: false })
    .linear(1.4, -40)
    .sharpen({ sigma: 1.2 })
    .webp({ quality: 92 })
    .toBuffer()

  const outputPath = path.join(OUTPUT_PATH, `${id}-crop-${area}.webp`)
  await writeFile(outputPath, buffer)
  return outputPath
}

/** 抽出指定影格範圍並標上編號，供九宮格看不清楚時放大確認 */
async function buildZoom(id: string, from: number, to: number) {
  await mkdir(OUTPUT_PATH, { recursive: true })

  const filePath = path.join(MEME_FILE_PATH, `${id}.webp`)
  const metadata = await sharp(filePath).metadata()
  const frameWidth = metadata.width ?? 1
  const frameHeight = metadata.pageHeight ?? metadata.height ?? 1

  const indexList = Array.from({ length: to - from + 1 }, (_, index) => from + index)
  const columnCount = 4
  const cellWidth = 240
  const cellHeight = Math.max(1, Math.round(cellWidth * (frameHeight / frameWidth)))
  const gap = 4

  const cellList = await Promise.all(indexList.map(async (frameIndex, order) => ({
    input: await sharp(filePath, { page: frameIndex })
      .resize(cellWidth, cellHeight, { fit: 'fill' })
      .composite([{
        input: Buffer.from([
          `<svg width="${cellWidth}" height="${cellHeight}">`,
          `<text x="8" y="26" font-size="22" fill="#ff0" stroke="#000" stroke-width="3" paint-order="stroke">${frameIndex}</text>`,
          '</svg>',
        ].join('')),
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer(),
    left: gap + (order % columnCount) * (cellWidth + gap),
    top: gap + Math.floor(order / columnCount) * (cellHeight + gap),
  })))

  const rowCount = Math.ceil(indexList.length / columnCount)
  const buffer = await sharp({
    create: {
      width: columnCount * cellWidth + (columnCount + 1) * gap,
      height: rowCount * cellHeight + (rowCount + 1) * gap,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  }).composite(cellList).webp({ quality: 85 }).toBuffer()

  const outputPath = path.join(OUTPUT_PATH, `${id}-zoom.webp`)
  await writeFile(outputPath, buffer)
  return outputPath
}

const HELP_TEXT = [
  '迷因審查工具。管線產生的是初稿，核對過才算完成',
  '',
  '  list [數量]                       列出尚未核對的項目，最新的排前面',
  '  draft [數量]                      印出待核對項目的初稿內容，供比對用',
  '  sheet <id...> | --pending [數量]  產生九宮格，輸出到 .meme-review/',
  '  zoom <id> <起格> <訖格>           抽出指定影格並標號，看不清楚時用',
  '  crop <id> <區塊>                  放大靜態圖的九宮格區塊並加強對比',
  '                                    區塊：左上 上 右上 左 中 右 左下 下 右下',
  '  show <id>                         印出單筆資料',
  '  ok <id...>                        初稿正確，直接標記為已核對',
  '  write <id> 欄位=值 ...            修正並標記為已核對',
].join('\n')

/** 初稿正確時直接標記，不必為了蓋章而重打一次原本的內容 */
function runOk(idList: string[]) {
  if (!idList.length) {
    throw new Error('缺少 id')
  }

  for (const id of idList) {
    writeRow(id, {})
    console.warn(`已核對 ${id}`)
  }
}

/** 一次印出多筆初稿，配合九宮格逐張比對 */
function runDraft(argList: string[]) {
  const limit = Number(argList[0] ?? 10)

  getPendingList().slice(0, limit).forEach((row) => {
    console.warn(`\n${toId(row.file)}${row.animated ? '（動圖）' : ''}`)
    console.warn(`  describe: ${row.describe}`)
    console.warn(`  ocr     : ${JSON.stringify(row.ocr)}`)
    console.warn(`  keyword : ${row.keyword}`)
    console.warn(`  emotion : ${row.emotion}`)
  })
}

async function runList(argList: string[]) {
  const limit = Number(argList[0] ?? 30)
  const pendingList = getPendingList()

  console.warn(`待審 ${pendingList.length} 筆`)
  pendingList.slice(0, limit).forEach((row) => {
    console.warn(`  ${toId(row.file)}${row.animated ? '（動圖）' : ''}`)
  })
}

async function runSheet(argList: string[]) {
  const idList = argList[0] === '--pending'
    ? getPendingList().slice(0, Number(argList[1] ?? 20)).map((row) => toId(row.file))
    : argList

  for (const id of idList) {
    const { outputPath, frameCount } = await buildSheet(id)
    console.warn(`${outputPath}  ${frameCount} 格`)
  }
}

async function runWrite(argList: string[]) {
  const [id, ...pairList] = argList
  if (!id) {
    throw new Error('缺少 id')
  }

  const patch: Partial<Record<EditableKey, string>> = {}
  for (const pair of pairList) {
    const index = pair.indexOf('=')
    const key = pair.slice(0, index) as EditableKey
    const value = pair.slice(index + 1)

    if (!EDITABLE_KEY_LIST.includes(key)) {
      throw new Error(`不可修改的欄位：${key}，可改 ${EDITABLE_KEY_LIST.join(' / ')}`)
    }
    if (key === 'emotion') {
      assertEmotion(value)
    }
    patch[key] = value
  }

  console.warn('修改前:', JSON.stringify(findRow(id), null, 2))
  writeRow(id, patch)
  console.warn('修改後:', JSON.stringify(findRow(id), null, 2))
}

async function main() {
  const [command, ...argList] = process.argv.slice(2)

  if (!existsSync(MEME_DATA_PATH)) {
    throw new Error(`找不到資料檔：${MEME_DATA_PATH}`)
  }

  if (command === 'list') {
    await runList(argList)
    return
  }
  if (command === 'sheet') {
    await runSheet(argList)
    return
  }
  if (command === 'zoom') {
    const [id, from, to] = argList
    console.warn(await buildZoom(id!, Number(from), Number(to)))
    return
  }
  if (command === 'crop') {
    const [id, area] = argList
    if (!id || !area || !isCropArea(area)) {
      throw new Error(`區塊需為：${Object.keys(CROP_AREA_MAP).join('、')}`)
    }
    console.warn(await buildCrop(id, area))
    return
  }
  if (command === 'show') {
    console.warn(JSON.stringify(findRow(argList[0]!), null, 2))
    return
  }
  if (command === 'write') {
    await runWrite(argList)
    return
  }
  if (command === 'ok') {
    runOk(argList)
    return
  }
  if (command === 'draft') {
    runDraft(argList)
    return
  }

  console.warn(HELP_TEXT)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
