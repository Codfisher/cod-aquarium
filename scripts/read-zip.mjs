/**
 * 最小的 zip 讀取器
 *
 * 自己拆而不呼叫外部工具，是被 Windows 逼出來的：
 * PATH 上先找到的往往是 Git 附的 GNU tar，而 GNU tar 根本不吃 zip。
 * zip 的結構其實很單純——尾端有一份中央目錄，照著走一遍就好，
 * 解壓縮本身 node 的 zlib 就有
 */

import { Buffer } from 'node:buffer'
import { inflateRawSync } from 'node:zlib'

/** 讀出 zip 裡每個檔案的位置 */
export function readZipEntryMap(buffer) {
  /** 從尾端往回找中央目錄的結尾標記，註解最長 65535 位元組 */
  let endOffset = -1
  for (let offset = buffer.length - 22; offset >= 0 && offset > buffer.length - 65558; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054B50) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) {
    throw new Error('這不是一個 zip 檔，找不到中央目錄')
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let offset = buffer.readUInt32LE(endOffset + 16)
  const entryMap = new Map()

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014B50) {
      throw new Error('中央目錄的內容對不上，zip 可能壞了')
    }

    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    entryMap.set(name, { method, compressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }

  return entryMap
}

/** 把一筆項目解出來 */
export function readZipEntry(buffer, entry) {
  /** 本地標頭的名稱與額外欄位長度可能與中央目錄不同，要各讀各的 */
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26)
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28)
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength
  const data = buffer.subarray(dataOffset, dataOffset + entry.compressedSize)

  /** 0 是沒壓縮、8 是 deflate，貼圖只會是這兩種 */
  return entry.method === 0 ? data : inflateRawSync(data)
}

/** 下載一個 zip 並讀出它的目錄 */
export async function downloadZip(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下載失敗（${response.status}）：${url}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  return { buffer, entryMap: readZipEntryMap(buffer) }
}
