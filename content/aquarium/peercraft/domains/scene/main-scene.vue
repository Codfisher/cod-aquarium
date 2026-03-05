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
      v-show="isMining && miningProgress > 0 && isReady"
      class="mining-progress-container"
    >
      <div
        class="mining-progress-bar"
        :style="{ width: `${miningProgress * 100}%` }"
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
      <!-- <div class="text-sm text-gray-400">
        房間 ID: {{ FIXED_ROOM_ID }}
      </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Mesh, Scene, UniversalCamera } from '@babylonjs/core'
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import { Color4, MeshBuilder, ParticleSystem, StandardMaterial, Texture, TransformNode, Vector3 } from '@babylonjs/core'
import { ref } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useBlockMiner } from '../../composables/use-block-miner'
import { useFpsController } from '../../composables/use-fps-controller'
import { usePeerNetwork } from '../../composables/use-peer-network'
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

const isMining = ref(false)
const miningProgress = ref(0)
const heldBlockId = ref<BlockId | null>(null)
let hasStarted = false

/** startGame 中建立，供 handleRemoteMiningProgress 使用 */
let destroyMaterialList: StandardMaterial[] = []

// 處理遠端玩家的挖掘特效
const remoteMiningEffects = new Map<string, { overlay: Mesh; particleSystem: ParticleSystem; currentBlockId: BlockId | null }>()

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
    handleRemoteMiningProgress(scene.value!, peerId, x, y, z, progress, blockId)
  },
})

/**
 * 輔助函式：建立一組挖掘特效 (模型疊加層 + 粒子系統)
 */
function createMiningEffects(id: string, sceneInstance: Scene) {
  const overlay = MeshBuilder.CreateBox(`destroy-overlay-${id}`, { size: 1.002 }, sceneInstance)
  overlay.isVisible = false
  overlay.isPickable = false

  const particleSystem = new ParticleSystem(`mining-particles-${id}`, 200, sceneInstance)
  particleSystem.createBoxEmitter(
    new Vector3(-1, 0, -1),
    new Vector3(1, 1, 1),
    new Vector3(-0.5, -0.5, -0.5),
    new Vector3(0.5, 0.5, 0.5),
  )
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  particleSystem.color1 = new Color4(1.0, 1.0, 1.0, 1.0)
  particleSystem.color2 = new Color4(1.0, 1.0, 1.0, 1.0)
  particleSystem.colorDead = new Color4(1.0, 1.0, 1.0, 0.0)
  particleSystem.minSize = 0.05
  particleSystem.maxSize = 0.15
  particleSystem.minLifeTime = 0.2
  particleSystem.maxLifeTime = 0.4
  particleSystem.emitRate = 60
  particleSystem.gravity = new Vector3(0, -10, 0)
  particleSystem.minEmitPower = 1
  particleSystem.maxEmitPower = 3
  particleSystem.updateSpeed = 0.01

  particleSystem.isAnimationSheetEnabled = true
  particleSystem.spriteCellWidth = 4
  particleSystem.spriteCellHeight = 4
  particleSystem.startSpriteCellID = 0
  particleSystem.endSpriteCellID = 15
  particleSystem.spriteCellChangeSpeed = 0
  particleSystem.spriteRandomStartCell = true

  return { overlay, particleSystem }
}

/** 處理遠端玩家的挖掘進度 */
function handleRemoteMiningProgress(sceneInstance: Scene, peerId: string, x: number, y: number, z: number, progress: number, blockId: BlockId) {
  let effect = remoteMiningEffects.get(peerId)
  if (!effect) {
    const { overlay, particleSystem } = createMiningEffects(peerId, sceneInstance)
    effect = { overlay, particleSystem, currentBlockId: null }
    remoteMiningEffects.set(peerId, effect)
  }

  if (progress > 0) {
    // 強制轉型確保 TS 知道 effect 存在 (上面剛創過或拿過)
    const eff = effect!
    // 更新材質
    if (eff.currentBlockId !== blockId) {
      eff.currentBlockId = blockId
      const textureDef = BLOCK_TEXTURES[blockId as keyof typeof BLOCK_TEXTURES]
      const texturePath = textureDef.bottom ?? textureDef.all ?? ''
      if (texturePath) {
        if (eff.particleSystem.particleTexture)
          eff.particleSystem.particleTexture.dispose()
        eff.particleSystem.particleTexture = new Texture(texturePath, sceneInstance, {
          samplingMode: Texture.NEAREST_SAMPLINGMODE,
        })
      }
    }

    // 更新位置
    const pos = new Vector3(x, y, z)
    eff.overlay.position.copyFrom(pos)
    eff.particleSystem.emitter = pos

    // 更新視覺
    const stage = Math.min(9, Math.floor(progress * 10))
    eff.overlay.material = destroyMaterialList[stage] || null
    eff.overlay.isVisible = true

    if (!eff.particleSystem.isStarted())
      eff.particleSystem.start()
  }
  else {
    // 停止挖掘
    const eff = effect!
    eff.overlay.isVisible = false
    if (eff.particleSystem.isStarted())
      eff.particleSystem.stop()
  }
}

/** 啟動遊戲場景 */
function startGame(sceneInstance: Scene, cameraInstance: UniversalCamera, canvas: HTMLCanvasElement) {
  if (hasStarted)
    return
  hasStarted = true

  /** 渲染體素 */
  renderer = createVoxelRenderer(sceneInstance, worldState)

  /** 啟動 FPS 控制器 */
  useFpsController({
    scene: sceneInstance,
    camera: cameraInstance,
    canvas,
    worldState,
  })

  /** 建立手持方塊節點 */
  const handTransform = new TransformNode('hand-transform', sceneInstance)
  handTransform.parent = cameraInstance
  handTransform.position = new Vector3(0.5, -0.4, 0.8)

  // 一點點傾斜度讓它看起來像拿在手中
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

  /** 啟動方塊挖掘控制器 (取代原本的左鍵瞬間挖掘) */
  const miner = useBlockMiner({
    scene: sceneInstance,
    camera: cameraInstance,
    canvas,
    worldState,
    canMine: () => heldBlockId.value === null,
    onBlockMined(hit) {
      /** 挖掉方塊後，將該方塊拿在手上 */
      heldBlockId.value = hit.blockId
      updateHandMesh(hit.blockId)
      renderer.rebuildInstances(worldState)

      // 廣播或發送給伺服器 (挖掉 = 變為 AIR)
      if (currentRole.value === NetworkRole.HOST) {
        broadcastBlockUpdate(hit.blockX, hit.blockY, hit.blockZ, BlockId.AIR)
      }
      else if (currentRole.value === NetworkRole.CLIENT) {
        sendBlockUpdateToHost(hit.blockX, hit.blockY, hit.blockZ, BlockId.AIR)
      }
    },
  })

  let localCurrentParticleBlockId: BlockId | null = null

  /** 建立破壞裂痕疊加層的材質列表 (0~9 階段) */
  destroyMaterialList = []
  for (let i = 0; i < 10; i++) {
    const mat = new StandardMaterial(`destroy_stage_${i}`, sceneInstance)
    const tex = new Texture(`/assets/minecraft/textures/block/destroy_stage_${i}.png`, sceneInstance, {
      samplingMode: Texture.NEAREST_SAMPLINGMODE,
    })
    tex.hasAlpha = true
    mat.diffuseTexture = tex
    mat.useAlphaFromDiffuseTexture = true
    mat.zOffset = -1 // 避免 Z-fighting
    destroyMaterialList.push(mat)
  }

  const localEffects = createMiningEffects('local', sceneInstance)

  /** 同步狀態給 UI 與粒子系統 */
  sceneInstance.onBeforeRenderObservable.add(() => {
    isMining.value = miner.isMining.value
    miningProgress.value = miner.miningProgress.value

    // 處理粒子發發射與進度同步
    if (miner.isMining.value && miner.targetBlock.value && miner.targetBlockId.value !== null) {
      // 動態更換粒子材質為方塊底部貼圖
      if (localCurrentParticleBlockId !== miner.targetBlockId.value) {
        localCurrentParticleBlockId = miner.targetBlockId.value
        const textureDef = BLOCK_TEXTURES[localCurrentParticleBlockId as keyof typeof BLOCK_TEXTURES]
        const texturePath = textureDef.bottom ?? textureDef.all ?? ''
        if (texturePath) {
          if (localEffects.particleSystem.particleTexture) {
            localEffects.particleSystem.particleTexture.dispose()
          }
          localEffects.particleSystem.particleTexture = new Texture(texturePath, sceneInstance, {
            samplingMode: Texture.NEAREST_SAMPLINGMODE,
          })
        }
      }

      localEffects.particleSystem.emitter = new Vector3(
        miner.targetBlock.value.x,
        miner.targetBlock.value.y,
        miner.targetBlock.value.z,
      )
      if (!localEffects.particleSystem.isStarted()) {
        localEffects.particleSystem.start()
      }

      // 更新裂痕疊加層
      localEffects.overlay.position.copyFrom(localEffects.particleSystem.emitter as Vector3)
      const stage = Math.min(9, Math.floor(miner.miningProgress.value * 10))
      localEffects.overlay.material = destroyMaterialList[stage] || null
      localEffects.overlay.isVisible = true

      // 【網路同步】傳送進度給他人 (如果是本機玩家在挖)
      if (currentRole.value === NetworkRole.HOST) {
        broadcastMiningProgress('host', miner.targetBlock.value.x, miner.targetBlock.value.y, miner.targetBlock.value.z, miner.miningProgress.value, miner.targetBlockId.value)
      }
      else if (currentRole.value === NetworkRole.CLIENT) {
        sendMiningProgressToHost(miner.targetBlock.value.x, miner.targetBlock.value.y, miner.targetBlock.value.z, miner.miningProgress.value, miner.targetBlockId.value)
      }
    }
    else {
      // 如果剛停止挖掘，也要同步一次進度 0 給他人，讓他人能關閉特效
      if (localCurrentParticleBlockId !== null) {
        if (currentRole.value === NetworkRole.HOST) {
          broadcastMiningProgress('host', 0, 0, 0, 0, BlockId.AIR)
        }
        else if (currentRole.value === NetworkRole.CLIENT) {
          sendMiningProgressToHost(0, 0, 0, 0, BlockId.AIR)
        }
        localCurrentParticleBlockId = null
      }

      if (localEffects.particleSystem.isStarted()) {
        localEffects.particleSystem.stop()
      }
      localEffects.overlay.isVisible = false
    }
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
        heldBlockId.value = null // 放完後變回空手
        updateHandMesh(null)
        renderer.rebuildInstances(worldState)

        // 廣播或發送給伺服器
        if (currentRole.value === NetworkRole.HOST) {
          broadcastBlockUpdate(hit.adjacentX, hit.adjacentY, hit.adjacentZ, placedBlockId)
        }
        else if (currentRole.value === NetworkRole.CLIENT) {
          sendBlockUpdateToHost(hit.adjacentX, hit.adjacentY, hit.adjacentZ, placedBlockId)
        }
      }
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
