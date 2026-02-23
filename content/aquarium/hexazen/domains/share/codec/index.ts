import type { BlockType } from '../../block/type'
import { blockTypeList } from '../../block/builder/data'
import { Hex } from '../../hex-grid'

export interface SharedBlock {
  type: BlockType;
  hex: Hex;
  /** 旋轉步數（0–5），每步 60°。預設 0 */
  rotation: number;
}

// ────────────────── 常數 ──────────────────

/** 二進位格式版本號 */
const FORMAT_VERSION = 1

/** 座標偏移量，將 [-3, 3] 映射到 [0, 6] */
const COORDINATE_OFFSET = 3

/** 各欄位位元寬度 */
const BITS_VERSION = 4
const BITS_TYPE = 5
const BITS_COORDINATE = 3
const BITS_ROTATION = 3
const BITS_PER_BLOCK = BITS_TYPE + BITS_COORDINATE + BITS_COORDINATE + BITS_ROTATION

// ────────────────── 查表 ──────────────────

const typeToIndex = new Map<BlockType, number>(
  blockTypeList.map((type, index) => [type, index]),
)

// ────────────────── BitWriter / BitReader ──────────────────

/** 以 MSB-first 方式將任意寬度的位元寫入 Uint8Array */
class BitWriter {
  private buffer: number[] = []
  private currentByte = 0
  private bitPosition = 0

  /** 寫入 `width` 個位元（MSB-first） */
  write(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i--) {
      this.currentByte = (this.currentByte << 1) | ((value >> i) & 1)
      this.bitPosition++

      if (this.bitPosition === 8) {
        this.buffer.push(this.currentByte)
        this.currentByte = 0
        this.bitPosition = 0
      }
    }
  }

  /** 結束寫入，將剩餘位元補 0 後輸出 Uint8Array */
  finish(): Uint8Array {
    if (this.bitPosition > 0) {
      this.buffer.push(this.currentByte << (8 - this.bitPosition))
    }
    return new Uint8Array(this.buffer)
  }
}

/** 以 MSB-first 方式從 Uint8Array 讀取任意寬度的位元 */
class BitReader {
  private byteIndex = 0
  private bitPosition = 0

  constructor(private data: Uint8Array) {}

  /** 讀取 `width` 個位元，回傳數值 */
  read(width: number): number {
    let value = 0
    for (let i = 0; i < width; i++) {
      if (this.byteIndex >= this.data.length) {
        throw new TypeError('BitReader: 資料不足，無法繼續讀取')
      }

      const byte = this.data[this.byteIndex]!
      const bit = (byte >> (7 - this.bitPosition)) & 1
      value = (value << 1) | bit
      this.bitPosition++

      if (this.bitPosition === 8) {
        this.byteIndex++
        this.bitPosition = 0
      }
    }
    return value
  }

  /** 目前已消耗的位元數 */
  get consumedBits(): number {
    return this.byteIndex * 8 + this.bitPosition
  }
}

// ────────────────── Base64url ──────────────────

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlToUint8Array(encoded: string): Uint8Array {
  // 恢復標準 Base64
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  // 補齊 padding
  const paddingNeeded = (4 - (base64.length % 4)) % 4
  base64 += '='.repeat(paddingNeeded)

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ────────────────── encode / decode ──────────────────

/**
 * 將 block 資料以位元打包（bit-packing）編碼為 URL 安全的字串。
 *
 * 格式（v1）：
 * ```
 * [version: 4 bits][block₁: 14 bits][block₂: 14 bits]...
 * ```
 *
 * 每個 block 佔 14 bits：
 * - type index: 5 bits
 * - q + 3:      3 bits
 * - r + 3:      3 bits
 * - rotation:   3 bits
 *
 * @example
 * encodeBlocks([
 *   { type: 'g1', hex: Hex.fromAxial(0, 0), rotation: 0 },
 *   { type: 't1', hex: Hex.fromAxial(1, 0), rotation: 3 },
 * ])
 */
export function encodeBlocks(blocks: Iterable<SharedBlock>): string {
  const blockArray = [...blocks]

  if (blockArray.length === 0) {
    return ''
  }

  const writer = new BitWriter()

  // 版本號
  writer.write(FORMAT_VERSION, BITS_VERSION)

  for (const block of blockArray) {
    const typeIndex = typeToIndex.get(block.type)
    if (typeIndex === undefined) {
      throw new TypeError(`未知的 BlockType: "${block.type}"`)
    }

    const encodedQ = block.hex.q + COORDINATE_OFFSET
    const encodedR = block.hex.r + COORDINATE_OFFSET

    if (encodedQ < 0 || encodedQ > 7) {
      throw new RangeError(`q 座標 ${block.hex.q} 超出可編碼範圍 [-3, 4]`)
    }
    if (encodedR < 0 || encodedR > 7) {
      throw new RangeError(`r 座標 ${block.hex.r} 超出可編碼範圍 [-3, 4]`)
    }
    if (block.rotation < 0 || block.rotation > 7) {
      throw new RangeError(`rotation ${block.rotation} 超出可編碼範圍 [0, 7]`)
    }

    writer.write(typeIndex, BITS_TYPE)
    writer.write(encodedQ, BITS_COORDINATE)
    writer.write(encodedR, BITS_COORDINATE)
    writer.write(block.rotation, BITS_ROTATION)
  }

  return uint8ArrayToBase64url(writer.finish())
}

/**
 * 將編碼後的字串解碼為 block 資料。
 *
 * 支援新版位元打包格式（v1）與舊版文字格式（向下相容）。
 *
 * @throws 當字串格式不正確時拋出錯誤
 */
export function decodeBlocks(encoded: string): SharedBlock[] {
  if (!encoded) {
    return []
  }

  // 嘗試新的二進位格式
  try {
    return decodeBinaryBlocks(encoded)
  }
  catch {
    // fallback 到舊的文字格式
    return decodeLegacyBlocks(encoded)
  }
}

/** 新版二進位格式解碼 */
function decodeBinaryBlocks(encoded: string): SharedBlock[] {
  const bytes = base64urlToUint8Array(encoded)
  const reader = new BitReader(bytes)

  const version = reader.read(BITS_VERSION)
  if (version !== FORMAT_VERSION) {
    throw new TypeError(`不支援的版本號: ${version}`)
  }

  const totalBits = bytes.length * 8
  const dataBits = totalBits - BITS_VERSION
  const blockCount = Math.floor(dataBits / BITS_PER_BLOCK)

  const blocks: SharedBlock[] = []

  for (let i = 0; i < blockCount; i++) {
    const typeIndex = reader.read(BITS_TYPE)
    const blockType = blockTypeList[typeIndex]
    if (!blockType) {
      throw new TypeError(`無效的 type index: ${typeIndex}`)
    }

    const q = reader.read(BITS_COORDINATE) - COORDINATE_OFFSET
    const r = reader.read(BITS_COORDINATE) - COORDINATE_OFFSET
    const rotation = reader.read(BITS_ROTATION)

    blocks.push({
      type: blockType,
      hex: Hex.fromAxial(q, r),
      rotation,
    })
  }

  return blocks
}

/** 舊版文字格式解碼（向下相容） */
function decodeLegacyBlocks(encoded: string): SharedBlock[] {
  const raw = atob(encoded)
  if (!raw) {
    return []
  }

  return raw.split(';').map((part) => {
    const [type, coords] = part.split(':')
    if (!type || !coords) {
      throw new TypeError(`Invalid shared block format: "${part}"`)
    }

    const [qStr, rStr, rotationStr] = coords.split(',')
    const q = Number(qStr)
    const r = Number(rStr)
    const rotation = rotationStr ? Number(rotationStr) : 0

    if (Number.isNaN(q) || Number.isNaN(r)) {
      throw new TypeError(`Invalid coordinates in shared block: "${coords}"`)
    }

    return {
      type: type as BlockType,
      hex: Hex.fromAxial(q, r),
      rotation,
    }
  })
}
