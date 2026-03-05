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

    <!-- 連線中/載入中遮罩 -->
    <div
      v-if="!isReady"
      class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-50 backdrop-blur-sm"
    >
      <div class="text-2xl font-bold mb-4 animate-pulse">
        {{ currentRole === 'client' ? '正在下載世界地圖...' : '連線至伺服器...' }}
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
import { useBlockMiner } from '../../composables/use-block-miner'
import { useFpsController } from '../../composables/use-fps-controller'
import { usePeerNetwork } from '../../composables/use-peer-network'
import { usePlayerAvatars } from '../../composables/use-player-avatars'
import { NetworkRole } from '../../types/network'
import { castBlockRay, placeBlock, setBlock } from '../player/block-interaction'
import { createPixelMaterial, createVoxelRenderer } from '../renderer/voxel-renderer'
import { BLOCK_TEXTURES, BlockId } from '../world/world-constants'
import { createWorldState, generateTerrain } from '../world/world-state'

const emit = defineEmits<{
  ready: [];
}>()

/** 共享世界狀態 */
let worldState: Uint8Array
let renderer: VoxelRenderer

const heldBlockId = ref<BlockId | null>(null)
let hasStarted = false

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
        console.log('[Network] Reconnected as Host, keeping current world state.')
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
      console.log('[Network] Received new snapshot, updating world.')
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

  let handMeshes: Mesh[] = []

  function updateHandMesh(blockId: BlockId | null) {
    for (const mesh of handMeshes) {
      mesh.dispose()
    }
    handMeshes = []

    if (blockId !== null && blockId !== BlockId.AIR) {
      const textureDef = BLOCK_TEXTURES[blockId]
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
      heldBlockId.value = hit.blockId
      updateHandMesh(hit.blockId)
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
        updateHandMesh(null)
        renderer.rebuildInstances(worldState)

        if (currentRole.value === NetworkRole.HOST) {
          broadcastBlockUpdate(hit.adjacentX, hit.adjacentY, hit.adjacentZ, placedBlockId)
        }
        else if (currentRole.value === NetworkRole.CLIENT) {
          sendBlockUpdateToHost(hit.adjacentX, hit.adjacentY, hit.adjacentZ, placedBlockId)
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
      broadcastPlayerPosition('host', pos.x, pos.y, pos.z, rotationY)
    }
    else if (currentRole.value === NetworkRole.CLIENT) {
      sendPlayerPositionToHost(pos.x, pos.y, pos.z, rotationY)
    }
  })

  emit('ready')
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
