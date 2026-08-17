import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { mergeEmotion, parseEmotionList } from '../utils/meme-emotion'

/**
 * 將人工標註的情緒標籤合併進手動標註檔。
 *
 * 標註來源以「自動分析檔的行號」定位，檔名皆為 UUID，寫行號可讓標註檔小上數倍。
 * 用法：vite-node .vitepress/scripts/apply-meme-emotion.ts <標註檔路徑>
 */
const MEME_DIR = path.resolve(import.meta.dirname, '../../content/public/memes')
const BASE_NDJSON_PATH = path.resolve(MEME_DIR, 'a-memes-data.ndjson')
const EXTEND_NDJSON_PATH = path.resolve(MEME_DIR, 'a-memes-data-extend.ndjson')

interface MemeRow {
  file: string;
  emotion?: string;
  [key: string]: unknown;
}

function readRowList(filePath: string): MemeRow[] {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemeRow)
}

/** 標註檔一行一筆，格式為 `行號=情緒,情緒` */
function readEmotionMap(filePath: string): Map<number, string> {
  const result = new Map<number, string>()

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const [indexText, emotionText = ''] = trimmed.split('=')
    const index = Number(indexText)
    if (!Number.isInteger(index))
      continue

    const emotion = parseEmotionList(emotionText).join(',')
    if (emotion) {
      result.set(index, emotion)
    }
  }

  return result
}

function main() {
  const mapPath = process.argv[2]
  if (!mapPath) {
    console.error('請提供標註檔路徑')
    process.exitCode = 1
    return
  }

  const baseRowList = readRowList(BASE_NDJSON_PATH)
  const extendRowList = readRowList(EXTEND_NDJSON_PATH)
  const emotionMap = readEmotionMap(mapPath)

  const extendIndexMap = new Map(extendRowList.map((row, index) => [row.file, index]))

  let updatedCount = 0
  let appendedCount = 0
  let missedCount = 0

  for (const [index, emotion] of emotionMap) {
    const baseRow = baseRowList[index]
    if (!baseRow) {
      missedCount++
      continue
    }

    const extendIndex = extendIndexMap.get(baseRow.file)
    if (extendIndex === undefined) {
      extendRowList.push({ file: baseRow.file, emotion })
      extendIndexMap.set(baseRow.file, extendRowList.length - 1)
      appendedCount++
      continue
    }

    const target = extendRowList[extendIndex]!
    target.emotion = mergeEmotion(target.emotion, emotion)
    updatedCount++
  }

  const output = extendRowList
    .map((row) => JSON.stringify(row).replaceAll('\n', ''))
    .join('\n')

  writeFileSync(EXTEND_NDJSON_PATH, `${output}\n`, 'utf8')

  console.warn(`[apply-meme-emotion] 標註 ${emotionMap.size} 筆`)
  console.warn(`[apply-meme-emotion] 更新既有 ${updatedCount} 筆、新增 ${appendedCount} 筆`)
  if (missedCount > 0) {
    console.warn(`[apply-meme-emotion] ${missedCount} 筆行號不存在，已略過`)
  }
}

main()
