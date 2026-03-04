import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { RaycastHit } from '../domains/player/block-interaction'
import type { BlockId } from '../domains/world/world-constants'
import { ref, watchEffect } from 'vue'
import { castBlockRay, digBlock } from '../domains/player/block-interaction'
import { BLOCK_MINING_TIMES } from '../domains/world/world-constants'

interface UseBlockMinerParams {
  scene: Scene;
  camera: UniversalCamera;
  canvas: HTMLCanvasElement;
  worldState: Uint8Array;
  /** 當方塊被成功挖掉時觸發 */
  onBlockMined: (hit: RaycastHit) => void;
}

/**
 * 方塊挖掘控制器
 *
 * 處理長按左鍵累積挖掘進度，
 * 當進度達 100% 時執行挖掘並重置。
 * 若準心移開目標方塊或放開左鍵，則中斷挖掘。
 */
export function useBlockMiner({
  scene,
  camera,
  canvas,
  worldState,
  onBlockMined,
}: UseBlockMinerParams) {
  const isMining = ref(false)
  const miningProgress = ref(0)

  /** 正在挖掘的目標座標 */
  const targetBlock = ref<{ x: number; y: number; z: number } | null>(null)
  let targetBlockId: BlockId | null = null

  function resetMining() {
    isMining.value = false
    miningProgress.value = 0
    targetBlock.value = null
    targetBlockId = null
  }

  function handleMouseDown(event: MouseEvent) {
    /** 僅處理左鍵，且需在 Pointer Lock 狀態下 */
    if (event.button !== 0 || document.pointerLockElement !== canvas) {
      return
    }

    const hit = castBlockRay(camera, worldState)
    if (hit) {
      isMining.value = true
      miningProgress.value = 0
      targetBlock.value = { x: hit.blockX, y: hit.blockY, z: hit.blockZ }
      targetBlockId = hit.blockId
    }
  }

  function handleMouseUp(event: MouseEvent) {
    if (event.button === 0) {
      resetMining()
    }
  }

  canvas.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mouseup', handleMouseUp)

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!isMining.value || !targetBlock.value || targetBlockId === null) {
      return
    }

    const hit = castBlockRay(camera, worldState)

    /** 如果沒有瞄準到，或瞄準的座標與目標不同，則中斷挖掘 */
    if (
      !hit
      || hit.blockX !== targetBlock.value.x
      || hit.blockY !== targetBlock.value.y
      || hit.blockZ !== targetBlock.value.z
    ) {
      resetMining()
      return
    }

    /** 累加挖掘進度 */
    const deltaTime = scene.getEngine().getDeltaTime() / 1000 // 秒
    const requiredTime = BLOCK_MINING_TIMES[targetBlockId as keyof typeof BLOCK_MINING_TIMES] || 1

    miningProgress.value = Math.min(1, miningProgress.value + (deltaTime / requiredTime))

    /** 進度達 100%，挖除方塊 */
    if (miningProgress.value >= 1) {
      const success = digBlock(worldState, hit.blockX, hit.blockY, hit.blockZ)
      if (success) {
        onBlockMined(hit)
      }
      resetMining()
    }
  })

  // 清理
  watchEffect((onCleanup) => {
    onCleanup(() => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      scene.onBeforeRenderObservable.remove(observer)
    })
  })

  return {
    isMining,
    miningProgress,
    targetBlock,
  }
}
