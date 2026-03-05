<template>
  <div class="relative w-full h-full">
    <canvas
      v-once
      ref="canvasRef"
      class="w-full h-full outline-0"
      @contextmenu="$event.preventDefault()"
    />

    <!-- 十字準星 -->
    <div class="crosshair" />

    <!-- 挖掘進度條 -->
    <div
      v-show="blockMiner.isMining.value && blockMiner.miningProgress.value > 0 && isReady"
      class="mining-progress-container"
    >
      <div
        class="mining-progress-bar"
        :style="{ width: `${blockMiner.miningProgress.value * 100}%` }"
      />
    </div>

    <!-- ESC 暫停選單 -->
    <div
      v-if="fpsController.isPaused.value"
      class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white z-40 backdrop-blur-sm"
    >
      <h2 class="text-3xl font-bold mb-8 text-shadow-sm">
        遊戲暫停
      </h2>
      <div class="flex flex-col gap-4 w-64">
        <button
          class="px-4 py-3 bg-neutral-600 hover:bg-neutral-500 border-2 border-neutral-800 hover:border-neutral-400 font-bold transition-colors shadow-inner"
          @click="fpsController.resume()"
        >
          回到遊戲
        </button>
      </div>
    </div>

    <!-- 連線中/載入中遮罩 -->
    <div
      v-if="!isReady && !fpsController.isPaused.value"
      class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-50 backdrop-blur-sm"
    >
      <div class="text-2xl font-bold mb-4 animate-pulse">
        {{ currentRole === 'client' ? '正在努力擺方塊...' : '連線至伺服器...' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Mesh, Scene, UniversalCamera } from '@babylonjs/core'
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import { MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core'
import { ref } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useFpsController } from '../../composables/use-fps-controller'
import { usePeerNetwork } from '../../composables/use-peer-network'
import { usePlayerAvatars } from '../../composables/use-player-avatars'
import { NetworkRole } from '../../types/network'
import { BLOCK_DEFS, BlockId } from '../block/block-constants'
import { castBlockRay, placeBlock, setBlock } from '../player/block-interaction'
import { useBlockMiner } from '../player/use-block-miner'
import { createPixelMaterial, createVoxelRenderer } from '../renderer/voxel-renderer'
import { createWorldState, generateTerrain } from '../world/world-state'

const emit = defineEmits<{
  ready: [];
}>()

/** 共享世界狀態 */
let worldState = createWorldState()
let renderer: VoxelRenderer

const heldBlockId = ref<BlockId | null>(null)
const updateHandMeshRef = ref<((blockId: BlockId | null) => void) | null>(null)
let handMeshes: Mesh[] = []
let hasStarted = false

/** 長按右鍵傳送相關 */
const rightClickStartTime = ref<number | null>(null)
const TELEPORT_HOLD_MS = 1000
const MAX_TELEPORT_DISTANCE = 80

const fpsController = useFpsController()
const blockMiner = useBlockMiner()
const playerAvatars = usePlayerAvatars()

const { canvasRef, scene, camera } = useBabylonScene({
  async init() {
    worldState = createWorldState()
  },
})

const {
  isReady,
  currentRole,
  currentPeerId,
  sendWorldSnapshot,
  broadcastBlockUpdate,
  sendBlockUpdateToHost,
  broadcastMiningProgress,
  sendMiningProgressToHost,
  broadcastPlayerPosition,
  sendPlayerPositionToHost,
} = usePeerNetwork({
  onConnected: () => {
    if (currentRole.value === NetworkRole.HOST) {
      /** Host 負責生成世界，如果已經啟動過地圖（如斷線重連轉 Host），則不再重新生成 */
      if (!hasStarted) {
        generateTerrain(worldState)
        startGame(scene.value!, camera.value!, canvasRef.value!)
      }
      else {
        console.warn('[Network] Reconnected as Host, keeping current world state.')
      }
    }
  },
  onWorldSnapshotReceived: (receivedState) => {
    /** Client 接收來自 Host 的世界 */
    worldState.set(receivedState)
    if (!hasStarted) {
      startGame(scene.value!, camera.value!, canvasRef.value!)
    }
    else {
      console.warn('[Network] Received new snapshot, updating world.')
      if (renderer) {
        renderer.rebuildInstances(worldState)
      }
    }
  },
  onClientConnected: (peerId) => {
    if (currentRole.value === NetworkRole.HOST) {
      sendWorldSnapshot(peerId, worldState)
    }
  },
  onBlockUpdateReceived: (x, y, z, blockId) => {
    // 接收到別人的變更，強迫更新本機資料
    if (setBlock(worldState, x, y, z, blockId)) {
      if (renderer) {
        renderer.rebuildInstances(worldState)
      }
    }
  },
  onMiningProgressReceived: (peerId, x, y, z, progress, blockId) => {
    blockMiner.handleRemoteMiningProgress(peerId, x, y, z, progress, blockId)
  },
  onPlayerPositionReceived: (peerId, x, y, z, rotationY) => {
    playerAvatars.updateAvatar(peerId, x, y, z, rotationY)
  },
  onClientDisconnected: (peerId) => {
    playerAvatars.removeAvatar(peerId)
  },
})

/** 啟動遊戲場景 */
function startGame(sceneInstance: Scene, cameraInstance: UniversalCamera, canvas: HTMLCanvasElement) {
  if (hasStarted)
    return
  hasStarted = true

  /** 渲染體素 */
  renderer = createVoxelRenderer(sceneInstance, worldState)

  /** 啟動 FPS 控制器 */
  fpsController.start({
    scene: sceneInstance,
    camera: cameraInstance,
    canvas,
    worldState,
  })

  /** 啟動玩家 avatar */
  playerAvatars.start({ scene: sceneInstance })

  /** 建立手持方塊節點 */
  const handTransform = new TransformNode('hand-transform', sceneInstance)
  handTransform.parent = cameraInstance
  handTransform.position = new Vector3(0.5, -0.4, 0.8)
  handTransform.rotation = new Vector3(Math.PI / 16, -Math.PI / 8, 0)

  updateHandMeshRef.value = (blockId: BlockId | null) => {
    for (const mesh of handMeshes) {
      mesh.dispose()
    }
    handMeshes = []

    if (blockId !== null && blockId !== BlockId.AIR) {
      const blockDef = BLOCK_DEFS[blockId]
      const textureDef = blockDef.textures
      if (!textureDef)
        return

      const size = 0.3

      if (textureDef.all) {
        const mesh = MeshBuilder.CreateBox('hand-block', { size }, sceneInstance)
        mesh.parent = handTransform
        mesh.material = createPixelMaterial(`hand_${blockId}`, textureDef.all, sceneInstance)
        handMeshes.push(mesh)
      }
      else {
        const half = size / 2

        const topMat = createPixelMaterial(`hand_${blockId}_top`, textureDef.top ?? '', sceneInstance, textureDef.topTint)
        const topMesh = MeshBuilder.CreatePlane(`hand_${blockId}_top`, { size }, sceneInstance)
        topMesh.rotation.x = Math.PI / 2
        topMesh.position.y = half
        topMesh.material = topMat
        topMesh.parent = handTransform
        handMeshes.push(topMesh)

        const bottomMat = createPixelMaterial(`hand_${blockId}_bottom`, textureDef.bottom ?? '', sceneInstance)
        const bottomMesh = MeshBuilder.CreatePlane(`hand_${blockId}_bottom`, { size }, sceneInstance)
        bottomMesh.rotation.x = -Math.PI / 2
        bottomMesh.position.y = -half
        bottomMesh.material = bottomMat
        bottomMesh.parent = handTransform
        handMeshes.push(bottomMesh)

        const sideMat = createPixelMaterial(`hand_${blockId}_side`, textureDef.side ?? '', sceneInstance, textureDef.sideTint)
        const sideRotations = [
          { name: 'front', rotationY: 0, x: 0, z: half },
          { name: 'back', rotationY: Math.PI, x: 0, z: -half },
          { name: 'left', rotationY: -Math.PI / 2, x: -half, z: 0 },
          { name: 'right', rotationY: Math.PI / 2, x: half, z: 0 },
        ]

        for (const { name, rotationY, x, z } of sideRotations) {
          const sideMesh = MeshBuilder.CreatePlane(`hand_${blockId}_${name}`, { size }, sceneInstance)
          sideMesh.rotation.y = rotationY
          sideMesh.position.x = x
          sideMesh.position.z = z
          sideMesh.material = sideMat
          sideMesh.parent = handTransform
          handMeshes.push(sideMesh)
        }
      }
    }
  }

  /** 啟動方塊挖掘控制器 */
  blockMiner.start({
    scene: sceneInstance,
    camera: cameraInstance,
    canvas,
    worldState,
    canMine: () => heldBlockId.value === null,
    onBlockMined(hit) {
      const blockDef = BLOCK_DEFS[hit.blockId]
      if (blockDef.isDroppable !== false) {
        heldBlockId.value = hit.blockId
        if (updateHandMeshRef.value) {
          updateHandMeshRef.value(hit.blockId)
        }
      }
      renderer.rebuildInstances(worldState)

      if (currentRole.value === NetworkRole.HOST) {
        broadcastBlockUpdate(hit.blockX, hit.blockY, hit.blockZ, BlockId.AIR)
      }
      else if (currentRole.value === NetworkRole.CLIENT) {
        sendBlockUpdateToHost(hit.blockX, hit.blockY, hit.blockZ, BlockId.AIR)
      }
    },
    onMiningProgress(info) {
      if (info) {
        if (currentRole.value === NetworkRole.HOST) {
          broadcastMiningProgress('host', info.x, info.y, info.z, info.progress, info.blockId)
        }
        else if (currentRole.value === NetworkRole.CLIENT) {
          sendMiningProgressToHost(info.x, info.y, info.z, info.progress, info.blockId)
        }
      }
      else {
        // 停止挖掘，同步進度 0 給他人
        if (currentRole.value === NetworkRole.HOST) {
          broadcastMiningProgress('host', 0, 0, 0, 0, BlockId.AIR)
        }
        else if (currentRole.value === NetworkRole.CLIENT) {
          sendMiningProgressToHost(0, 0, 0, 0, BlockId.AIR)
        }
      }
    },
  })

  /** 滑鼠互動 */
  canvas.addEventListener('mousedown', (event) => {
    if (document.pointerLockElement !== canvas)
      return

    if (event.button === 0 && heldBlockId.value !== null) {
      const hit = castBlockRay(cameraInstance, worldState)
      if (!hit) {
        return
      }

      /** 左鍵：放置持有的方塊 */
      if (placeBlock(worldState, hit.adjacentX, hit.adjacentY, hit.adjacentZ, heldBlockId.value)) {
        const placedBlockId = heldBlockId.value
        heldBlockId.value = null
        if (updateHandMeshRef.value) {
          updateHandMeshRef.value(null)
        }
        renderer.rebuildInstances(worldState)

        if (currentRole.value === NetworkRole.HOST) {
          if (typeof placedBlockId === 'number') {
            broadcastBlockUpdate(hit.adjacentX, hit.adjacentY, hit.adjacentZ, placedBlockId)
          }
        }
        else if (currentRole.value === NetworkRole.CLIENT) {
          if (typeof placedBlockId === 'number') {
            sendBlockUpdateToHost(hit.adjacentX, hit.adjacentY, hit.adjacentZ, placedBlockId)
          }
        }
      }
    }
    /** 右鍵按下：開始紀錄時間 */
    else if (event.button === 2) {
      rightClickStartTime.value = performance.now()
    }
  })

  canvas.addEventListener('mouseup', (event) => {
    if (event.button === 2 && rightClickStartTime.value !== null) {
      const duration = performance.now() - rightClickStartTime.value
      rightClickStartTime.value = null

      /** 長按超過 1 秒：執行傳送 */
      if (duration >= TELEPORT_HOLD_MS) {
        const hit = castBlockRay(cameraInstance, worldState, MAX_TELEPORT_DISTANCE)
        if (hit) {
          /** 傳送至方塊上方 1.5m (眼睛高度) */
          const targetX = hit.blockX
          const targetY = hit.blockY + 1.6 // 稍微高一點點，避免穿模
          const targetZ = hit.blockZ

          cameraInstance.position.set(targetX, targetY, targetZ)
          console.log(`[Teleport] To (${targetX}, ${targetY}, ${targetZ})`)
        }
      }
    }
  })

  /** 廣播本機玩家位置 */
  let lastPositionBroadcast = 0
  const POSITION_BROADCAST_INTERVAL = 15 // ms

  sceneInstance.onBeforeRenderObservable.add(() => {
    const now = performance.now()
    if (now - lastPositionBroadcast < POSITION_BROADCAST_INTERVAL)
      return
    lastPositionBroadcast = now

    const pos = cameraInstance.position
    const rotationY = cameraInstance.rotation.y

    if (currentRole.value === NetworkRole.HOST) {
      broadcastPlayerPosition(currentPeerId.value, pos.x, pos.y, pos.z, rotationY)
    }
    else if (currentRole.value === NetworkRole.CLIENT) {
      sendPlayerPositionToHost(pos.x, pos.y, pos.z, rotationY)
    }
  })

  emit('ready')
}

// ── 遊戲玩法：切換拿在手上的方塊 ──
window.addEventListener('wheel', (event) => {
  if (document.pointerLockElement !== canvasRef.value)
    return

  const blockIds = Object.entries(BLOCK_DEFS)
    .filter(([id, def]) => {
      const numericId = Number(id)
      return !Number.isNaN(numericId) && numericId !== BlockId.AIR && !(def as any).isHidden
    })
    .map(([id]) => Number(id) as BlockId)

  const currentIndex = heldBlockId.value === null ? -1 : blockIds.indexOf(heldBlockId.value)

  let nextIndex = currentIndex
  if (event.deltaY < 0) {
    // Scroll up
    nextIndex = (currentIndex + 1) % blockIds.length
  }
  else {
    // Scroll down
    nextIndex = (currentIndex - 1 + blockIds.length) % blockIds.length
  }

  heldBlockId.value = blockIds[nextIndex] ?? null
  if (updateHandMeshRef.value) {
    updateHandMeshRef.value(heldBlockId.value)
  }
})

/** 離開伺服器 */
function disconnect() {
  if (currentRole.value === NetworkRole.CLIENT) {
    // Client 斷線返回主畫面
    window.location.reload()
  }
  else {
    // Host 斷線將關閉整個房間
    window.location.reload()
  }
}
</script>

<style scoped lang="sass">
.crosshair
  position: absolute
  top: 50%
  left: 50%
  transform: translate(-50%, -50%)
  width: 20px
  height: 20px
  pointer-events: none

  &::before, &::after
    content: ''
    position: absolute
    background: white
    mix-blend-mode: difference

  &::before
    // 水平線
    top: 50%
    left: 0
    width: 100%
    height: 2px
    transform: translateY(-50%)

  &::after
    // 垂直線
    left: 50%
    top: 0
    height: 100%
    width: 2px
    transform: translateX(-50%)

.mining-progress-container
  position: absolute
  top: calc(50% + 20px)
  left: 50%
  transform: translateX(-50%)
  width: 40px
  height: 4px
  background: rgba(0, 0, 0, 0.5)
  border-radius: 2px
  overflow: hidden
  pointer-events: none

.mining-progress-bar
  height: 100%
  background: rgba(255, 255, 255, 0.9)
  transition: width 0.05s linear
</style>
