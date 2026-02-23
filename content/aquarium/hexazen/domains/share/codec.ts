import type { BlockType } from '../block/type'
import { Hex } from '../hex-grid'

export interface SharedBlock {
  type: BlockType;
  hex: Hex;
  /** 旋轉步數（0–5），每步 60°。預設 0 */
  rotation: number;
}

/**
 * 將 block 資料編碼為 URL 安全的字串。
 *
 * 格式：`type:q,r,rotation;type:q,r,rotation;...` 再以 Base64 編碼
 *
 * @example
 * encodeBlocks([
 *   { type: 'g1', hex: Hex.fromAxial(0, 0), rotation: 0 },
 *   { type: 't1', hex: Hex.fromAxial(1, 0), rotation: 3 },
 * ])
 */
export function encodeBlocks(blocks: Iterable<SharedBlock>): string {
  const parts: string[] = []

  for (const block of blocks) {
    parts.push(`${block.type}:${block.hex.q},${block.hex.r},${block.rotation}`)
  }

  return btoa(parts.join(';'))
}

/**
 * 將編碼後的字串解碼為 block 資料。
 *
 * @throws 當字串格式不正確時拋出錯誤
 */
export function decodeBlocks(encoded: string): SharedBlock[] {
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
