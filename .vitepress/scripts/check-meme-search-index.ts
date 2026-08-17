import { Buffer } from 'node:buffer'
import process from 'node:process'
import { buildMemeSearchIndexJson } from '../plugin/vite-meme-search-index'

const json = buildMemeSearchIndexJson()
const parsed = JSON.parse(json) as { count: number; firstFile: string; lastFile: string }

console.warn('[check] 筆數:', parsed.count)
console.warn('[check] 首筆:', parsed.firstFile)
console.warn('[check] 末筆:', parsed.lastFile)
console.warn('[check] 索引大小:', `${Math.round(Buffer.byteLength(json) / 1024)} KB`)

if (parsed.count === 0) {
  process.exitCode = 1
}
