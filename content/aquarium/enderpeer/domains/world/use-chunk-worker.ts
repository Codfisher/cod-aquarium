import { useWebWorkerFn } from '@vueuse/core'
import { BLOCK_DEFS, BlockId } from '../block/block-constants'
import {
  CHUNK_SIZE,
  CHUNKS_PER_AXIS,
  WORLD_HEIGHT,
  WORLD_SIZE,
  worldToChunkCoordinate,
} from './world-constants'

export type ChunkResultCallback = (
  chunkX: number,
  chunkZ: number,
  matrices: Record<string, Float32Array>,
) => void

/** 方塊旗標位元 */
const FLAG_RENDERABLE = 1
const FLAG_TRANSPARENT = 2
const FLAG_PER_FACE = 4

/** 預先計算每個 BlockId 的旗標（只算一次） */
function prepareBlockFlags(): Uint8Array {
  const maxId = Math.max(
    ...(Object.values(BlockId).filter((v) => typeof v === 'number') as number[]),
  )
  const flags = new Uint8Array(maxId + 1)

  for (const id of Object.values(BlockId).filter((v) => typeof v === 'number') as number[]) {
    const def = BLOCK_DEFS[id as BlockId]
    let flag = 0
    if (!def.isHidden && def.textures)
      flag |= FLAG_RENDERABLE
    if ((def.alpha !== undefined && def.alpha < 1) || id === BlockId.GLASS)
      flag |= FLAG_TRANSPARENT
    if (def.textures && !def.textures.all && !!(def.textures.top || def.textures.side || def.textures.bottom))
      flag |= FLAG_PER_FACE
    flags[id] = flag
  }

  return flags
}

/**
 * 在 Worker 執行緒中運行的 chunk 矩陣計算函式
 *
 * 此函式完全自包含，不引用任何外部模組或閉包變數。
 * useWebWorkerFn 會將此函式序列化後在 Web Worker 中執行。
 */
function computeChunkMatricesInWorker(
  worldState: Uint8Array,
  chunksJson: string,
  blockFlags: Uint8Array,
  chunkSize: number,
  worldHeight: number,
  worldSize: number,
): Record<string, Record<string, Float32Array>> {
  const F_RENDERABLE = 1
  const F_TRANSPARENT = 2
  const F_PER_FACE = 4

  function coordToIndex(x: number, y: number, z: number): number {
    return x * worldHeight * worldSize + y * worldSize + z
  }

  const chunks: { chunkX: number; chunkZ: number }[] = JSON.parse(chunksJson)
  const allResults: Record<string, Record<string, Float32Array>> = {}

  for (const { chunkX, chunkZ } of chunks) {
    const matricesMap: Record<string, number[]> = {}

    for (let blockId = 0; blockId < blockFlags.length; blockId++) {
      if (!(blockFlags[blockId]! & F_RENDERABLE))
        continue
      if (blockFlags[blockId]! & F_PER_FACE) {
        for (const face of ['top', 'bottom', 'front', 'back', 'left', 'right']) {
          matricesMap[`${blockId}_${face}`] = []
        }
      }
      else {
        matricesMap[`${blockId}`] = []
      }
    }

    const startX = chunkX * chunkSize
    const startZ = chunkZ * chunkSize

    for (let x = startX; x < startX + chunkSize; x++) {
      for (let z = startZ; z < startZ + chunkSize; z++) {
        for (let y = 0; y < worldHeight; y++) {
          const blockId = worldState[coordToIndex(x, y, z)]!
          if (blockId === 0)
            continue
          if (!(blockFlags[blockId]! & F_RENDERABLE))
            continue

          const isSelfTransparent = !!(blockFlags[blockId]! & F_TRANSPARENT)

          const checkFace = (nx: number, ny: number, nz: number): boolean => {
            if (nx < 0 || nx >= worldSize || nz < 0 || nz >= worldSize || ny < 0 || ny >= worldHeight)
              return true
            const neighborId = worldState[coordToIndex(nx, ny, nz)]!
            if (neighborId === 0)
              return true
            const neighborTransparent = !!(blockFlags[neighborId]! & F_TRANSPARENT)
            return neighborTransparent && !isSelfTransparent ? true : neighborTransparent
          }

          const hasTop = checkFace(x, y + 1, z)
          const hasBottom = checkFace(x, y - 1, z)
          const hasFront = checkFace(x, y, z + 1)
          const hasBack = checkFace(x, y, z - 1)
          const hasLeft = checkFace(x - 1, y, z)
          const hasRight = checkFace(x + 1, y, z)

          if (!hasTop && !hasBottom && !hasFront && !hasBack && !hasLeft && !hasRight)
            continue

          const mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]

          if (blockFlags[blockId]! & F_PER_FACE) {
            if (hasTop)
              matricesMap[`${blockId}_top`]!.push(...mat)
            if (hasBottom)
              matricesMap[`${blockId}_bottom`]!.push(...mat)
            if (hasFront)
              matricesMap[`${blockId}_front`]!.push(...mat)
            if (hasBack)
              matricesMap[`${blockId}_back`]!.push(...mat)
            if (hasLeft)
              matricesMap[`${blockId}_left`]!.push(...mat)
            if (hasRight)
              matricesMap[`${blockId}_right`]!.push(...mat)
          }
          else {
            matricesMap[`${blockId}`]!.push(...mat)
          }
        }
      }
    }

    const chunkResult: Record<string, Float32Array> = {}
    for (const [key, arr] of Object.entries(matricesMap)) {
      chunkResult[key] = new Float32Array(arr)
    }
    allResults[`${chunkX}_${chunkZ}`] = chunkResult
  }

  return allResults
}

/**
 * 封裝 Chunk 矩陣計算 Worker
 *
 * 使用 VueUse 的 useWebWorkerFn 將面剔除與矩陣生成移至 Worker 執行緒。
 * 內建佇列機制：若 Worker 忙碌中收到新請求，會合併待處理的 chunk 清單，
 * 待目前計算完成後自動處理最新的請求（自動丟棄過期中間狀態）。
 */
export function useChunkWorker() {
  const blockFlags = prepareBlockFlags()
  const { workerFn, workerTerminate } = useWebWorkerFn(computeChunkMatricesInWorker)

  let onChunkResult: ChunkResultCallback | null = null
  let pendingChunks: Map<string, { chunkX: number; chunkZ: number }> | null = null
  let pendingWorldState: Uint8Array | null = null
  let isRunning = false

  async function processQueue(): Promise<void> {
    if (isRunning || !pendingChunks || !pendingWorldState)
      return

    isRunning = true
    const chunks = Array.from(pendingChunks.values())
    const worldState = pendingWorldState
    pendingChunks = null
    pendingWorldState = null

    try {
      const results = await workerFn(
        worldState,
        JSON.stringify(chunks),
        blockFlags,
        CHUNK_SIZE,
        WORLD_HEIGHT,
        WORLD_SIZE,
      )

      for (const [key, matrices] of Object.entries(results)) {
        const [cxStr, czStr] = key.split('_')
        onChunkResult?.(Number(cxStr), Number(czStr), matrices)
      }
    }
    catch (error) {
      console.error('[ChunkWorker] 計算失敗:', error)
    }
    finally {
      isRunning = false
      processQueue()
    }
  }

  function queueChunks(
    worldState: Uint8Array,
    chunks: { chunkX: number; chunkZ: number }[],
  ): void {
    if (!pendingChunks)
      pendingChunks = new Map()
    pendingWorldState = worldState
    for (const chunk of chunks) {
      pendingChunks.set(`${chunk.chunkX}_${chunk.chunkZ}`, chunk)
    }
    processQueue()
  }

  function rebuildAll(worldState: Uint8Array): void {
    const chunks: { chunkX: number; chunkZ: number }[] = []
    for (let cx = 0; cx < CHUNKS_PER_AXIS; cx++) {
      for (let cz = 0; cz < CHUNKS_PER_AXIS; cz++) {
        chunks.push({ chunkX: cx, chunkZ: cz })
      }
    }
    queueChunks(worldState, chunks)
  }

  function rebuildChunk(worldState: Uint8Array, chunkX: number, chunkZ: number): void {
    queueChunks(worldState, [{ chunkX, chunkZ }])
  }

  function rebuildAt(worldState: Uint8Array, x: number, z: number): void {
    const cx = worldToChunkCoordinate(x)
    const cz = worldToChunkCoordinate(z)

    const chunks: { chunkX: number; chunkZ: number }[] = [{ chunkX: cx, chunkZ: cz }]

    const localX = x % CHUNK_SIZE
    const localZ = z % CHUNK_SIZE

    if (localX === 0 && cx > 0)
      chunks.push({ chunkX: cx - 1, chunkZ: cz })
    if (localX === CHUNK_SIZE - 1 && cx < CHUNKS_PER_AXIS - 1)
      chunks.push({ chunkX: cx + 1, chunkZ: cz })
    if (localZ === 0 && cz > 0)
      chunks.push({ chunkX: cx, chunkZ: cz - 1 })
    if (localZ === CHUNK_SIZE - 1 && cz < CHUNKS_PER_AXIS - 1)
      chunks.push({ chunkX: cx, chunkZ: cz + 1 })

    queueChunks(worldState, chunks)
  }

  return {
    rebuildAll,
    rebuildChunk,
    rebuildAt,
    setOnChunkResult(callback: ChunkResultCallback) {
      onChunkResult = callback
    },
    terminate: workerTerminate,
  }
}

export type ChunkWorkerComposable = ReturnType<typeof useChunkWorker>
