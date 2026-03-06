<template>
  <div class="relative w-full h-full">
    <canvas
      v-once
      ref="canvasRef"
      class="w-full h-full outline-0"
      @contextmenu="$event.preventDefault()"
    />

    <div class="crosshair" />

    <!-- 挖掘進度條 -->
    <div
      v-show="blockMiner.isMining && blockMiner.miningProgress > 0 && isReady"
      class="mining-progress-container"
    >
      <div
        class="mining-progress-bar"
        :style="{ width: `${blockMiner.miningProgress * 100}%` }"
      />
    </div>

    <!-- 傳送暗角 -->
    <div
      v-if="teleportProgress > 0"
      class="teleport-vignette"
      :style="{ opacity: teleportProgress * 0.8 }"
    />

    <!-- 傳送集氣條 -->
    <div
      v-if="teleportProgress > 0"
      class="teleport-charge-outer"
    >
      <div class="teleport-charge-container">
        <div
          class="teleport-charge-bar"
          :style="{ width: `${teleportProgress * 100}%` }"
        />
      </div>

      <div class="teleport-charge-text text-left">
        TELEPORT<br>CHARGING...
      </div>
    </div>

    <!-- 手機虛擬控制 -->
    <touch-control-panel
      v-if="mobileController.isMobile"
      :joystick-active="mobileController.joystickActive"
      :joystick-origin="mobileController.joystickOrigin"
      :joystick-offset="mobileController.joystickOffset"
      :has-block="heldBlockId !== null"
      @jump="mobileController.setJump"
      @sprint="mobileController.setSprint"
      @action="mobileController.setAction"
      @teleport="mobileController.setTeleport"
    />

    <!-- ESC 暫停選單 (獨立元件) -->
    <pause-menu
      v-model:player-name="playerName"
      :show="fpsController.isPaused"
      @resume="fpsController.resume()"
    />

    <!-- 連線中/載入中遮罩 -->
    <div
      v-if="!isReady && !fpsController.isPaused"
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
import type { SandFall } from '../world/world-state'
import { Material, MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core'
import { useEventListener } from '@vueuse/core'
import { animate } from 'animejs'
import { reactive, ref, watch } from 'vue'
import PauseMenu from '../../components/pause-menu.vue'
import TouchControlPanel from '../../components/touch-control-panel.vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useFpsController } from '../../composables/use-fps-controller'
import { useMobileController } from '../../composables/use-mobile-controller'
import { usePeerNetwork } from '../../composables/use-peer-network'
import { usePlayerAvatars } from '../../composables/use-player-avatars'
import { NetworkRole } from '../../types/network'
import { BLOCK_DEFS, BlockId } from '../block/block-constants'
import { castBlockRay, placeBlock, setBlock } from '../player/block-interaction'
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from '../player/collision'
import { useBlockMiner } from '../player/use-block-miner'
import { createPixelMaterial, createVoxelRenderer } from '../renderer/voxel-renderer'
import {
  CHUNKS_PER_AXIS,
  coordinateToIndex,
  getChunkIndex,
  worldToChunkCoordinate,
} from '../world/world-constants'
import { createWorldState, findSafeTeleportY, generateTerrain, simulateSandGravity } from '../world/world-state'

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

/** 玩家姓名持久化 */
const LOCAL_STORAGE_PLAYER_NAME = 'peercraft_player_name'
const playerName = ref(localStorage.getItem(LOCAL_STORAGE_PLAYER_NAME) || `Player_${Math.floor(Math.random() * 1000)}`)

watch(playerName, (newName) => {
  localStorage.setItem(LOCAL_STORAGE_PLAYER_NAME, newName)
})

/** 處理沙子重力並播放動畫 */
function handleSandGravity(sceneInstance?: Scene, affectedX?: number, affectedZ?: number) {
  let range
  if (affectedX !== undefined && affectedZ !== undefined) {
    // 掃描受影響方塊周圍 1x1 區域的所有 y 層 (簡單起見，掃描整根柱子)
    range = { minX: affectedX, maxX: affectedX, minZ: affectedZ, maxZ: affectedZ }
  }

  const falls = simulateSandGravity(worldState, range)
  if (falls.length > 0 && sceneInstance) {
    const affectedChunks = new Set<number>()

    // 暫時隱藏落地位置的沙子，讓動畫結束後才顯示
    for (const fall of falls) {
      const idx = coordinateToIndex(fall.x, fall.toY, fall.z)
      worldState[idx] = BlockId.AIR

      const cx = worldToChunkCoordinate(fall.x)
      const cz = worldToChunkCoordinate(fall.z)
      affectedChunks.add(getChunkIndex(cx, cz))
    }

    if (renderer) {
      for (const chunkIdx of affectedChunks) {
        const cx = Math.floor(chunkIdx / CHUNKS_PER_AXIS)
        const cz = chunkIdx % CHUNKS_PER_AXIS
        renderer.rebuildChunk(worldState, cx, cz)
      }
    }

    // 還原落地位置（但視覺上由動畫 mesh 呈現）
    for (const fall of falls) {
      const idx = coordinateToIndex(fall.x, fall.toY, fall.z)
      worldState[idx] = BlockId.SAND
    }
    animateSandFalls(falls, sceneInstance, affectedChunks)
  }
  else if (renderer) {
    if (affectedX !== undefined && affectedZ !== undefined) {
      const cx = worldToChunkCoordinate(affectedX)
      const cz = worldToChunkCoordinate(affectedZ)
      renderer.rebuildChunk(worldState, cx, cz)
    }
    else {
      renderer.rebuildInstances(worldState)
    }
  }
}

/** 沙子掉落動畫：建立臨時方塊從原位掉到目標位，動畫結束後才更新世界 */
function animateSandFalls(falls: SandFall[], sceneInstance: Scene, affectedChunks: Set<number>) {
  const promises: Promise<void>[] = []

  for (const fall of falls) {
    const mesh = MeshBuilder.CreateBox('sand_fall', { size: 1 }, sceneInstance)
    const sandDef = BLOCK_DEFS[BlockId.SAND]
    if (sandDef.textures?.all) {
      mesh.material = createPixelMaterial('sand_fall_mat', sandDef.textures.all, sceneInstance)
    }
    mesh.position.set(fall.x, fall.fromY, fall.z)

    const distance = fall.fromY - fall.toY
    const duration = Math.min(Math.sqrt(distance) * 300, 2000)

    const pos = { y: fall.fromY }
    promises.push(animate(pos, {
      y: fall.toY,
      duration,
      ease: 'inCirc',
      onUpdate: () => {
        mesh.position.y = pos.y
      },
      onComplete: () => {
        mesh.material?.dispose()
        mesh.dispose()
      },
    }).then())
  }

  // 所有沙子落地後才更新世界方塊
  Promise.all(promises).then(() => {
    if (renderer) {
      for (const chunkIdx of affectedChunks) {
        const cx = Math.floor(chunkIdx / CHUNKS_PER_AXIS)
        const cz = chunkIdx % CHUNKS_PER_AXIS
        renderer.rebuildChunk(worldState, cx, cz)
      }
    }
  })
}

/** 長按右鍵傳送相關 */
const rightClickStartTime = ref<number | null>(null)
const teleportProgress = ref(0)
const TELEPORT_HOLD_MS = 1000
const MAX_TELEPORT_DISTANCE = 80

const mobileController = reactive(useMobileController())
const fpsController = reactive(useFpsController())
const blockMiner = reactive(useBlockMiner())
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
  sendPlayerPositionToClient,
  broadcastHeldBlock,
  sendHeldBlockToHost,
  sendHeldBlockToClient,
  broadcastPlayerName,
  sendPlayerNameToHost,
  sendPlayerNameToClient,
} = usePeerNetwork({
  onConnected: () => {
    if (currentRole.value === NetworkRole.HOST) {
      /** Host 負責生成世界，如果已經啟動過地圖（如斷線重連轉 Host），則不再重新生成 */
      if (!hasStarted) {
        generateTerrain(worldState)
        simulateSandGravity(worldState) // 初始地形不需動畫，直接結算
        startGame(scene.value!, camera.value!, canvasRef.value!)
      }
      else {
        console.warn('[Network] Reconnected as Host, keeping current world state.')
      }
      // Host 廣播自己的名字
      broadcastPlayerName(currentPeerId.value, playerName.value)
    }
    else if (currentRole.value === NetworkRole.CLIENT) {
      // Client 連線後，主動告知 Host 自己手上拿的東西和姓名
      sendHeldBlockToHost(heldBlockId.value)
      sendPlayerNameToHost(playerName.value)
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
      // 同步 Host 目前手上拿的東西、姓名與位置給新進來的 Client
      sendHeldBlockToClient(peerId, currentPeerId.value, heldBlockId.value)
      sendPlayerNameToClient(peerId, currentPeerId.value, playerName.value)

      const cameraPos = camera.value!.position
      const rotationY = camera.value!.rotation.y
      sendPlayerPositionToClient(peerId, currentPeerId.value, cameraPos.x, cameraPos.y, cameraPos.z, rotationY)

      // 同步「其他」已經在場內的人給新進來的 Client
      playerAvatars.avatars.forEach((entry: any, otherPeerId: string) => {
        // 同步位置
        const pos = entry.state.targetPosition
        const rot = entry.state.targetRotationY
        // 注意：這裡的 y 座標在 updateAvatar 會被還原回眼睛高度，所以要傳原始 y
        const originalY = pos.y + PLAYER_EYE_HEIGHT - PLAYER_HEIGHT / 2
        sendPlayerPositionToClient(peerId, otherPeerId, pos.x, originalY, pos.z, rot)

        // 同步姓名
        sendPlayerNameToClient(peerId, otherPeerId, entry.name)

        // 同步手持 (暫留擴充空間)
      })
    }
  },
  onBlockUpdateReceived: (x, y, z, blockId) => {
    // 接收到別人的變更，強迫更新本機資料
    if (setBlock(worldState, x, y, z, blockId)) {
      handleSandGravity(scene.value ?? undefined, x, z)
    }
    else if (renderer) {
      const cx = worldToChunkCoordinate(x)
      const cz = worldToChunkCoordinate(z)
      renderer.rebuildChunk(worldState, cx, cz)
    }
  },
  onMiningProgressReceived: (peerId, x, y, z, progress, blockId) => {
    blockMiner.handleRemoteMiningProgress(peerId, x, y, z, progress, blockId)
  },
  onPlayerPositionReceived: (peerId, x, y, z, rotationY) => {
    playerAvatars.updateAvatar(peerId, x, y, z, rotationY)
  },
  onHeldBlockReceived: (peerId, blockId) => {
    playerAvatars.updateHeldBlock(peerId, blockId)
  },
  onPlayerNameReceived: (peerId, name) => {
    playerAvatars.updatePlayerName(peerId, name)
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

  // 監聽手持方塊變更並同步
  watch(heldBlockId, (newId) => {
    if (currentRole.value === NetworkRole.HOST) {
      broadcastHeldBlock(currentPeerId.value, newId)
    }
    else if (currentRole.value === NetworkRole.CLIENT) {
      sendHeldBlockToHost(newId)
    }
  })

  // 監聽姓名變更並同步
  watch(playerName, (newName) => {
    if (currentRole.value === NetworkRole.HOST) {
      broadcastPlayerName(currentPeerId.value, newName)
    }
    else if (currentRole.value === NetworkRole.CLIENT) {
      sendPlayerNameToHost(newName)
    }
  })

  /** 渲染體素 */
  renderer = createVoxelRenderer(sceneInstance, worldState)

  /** 手機模式：設定觸控監聽 */
  if (mobileController.isMobile) {
    mobileController.setupTouchListeners(canvas)
  }

  /** 啟動 FPS 控制器 */
  fpsController.start({
    scene: sceneInstance,
    camera: cameraInstance,
    canvas,
    worldState,
    mobileControls: mobileController.isMobile
      ? {
          state: mobileController.state,
          consumeLookDelta: mobileController.consumeLookDelta,
        }
      : undefined,
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

      // 透明方塊處理（如玻璃）
      if (blockDef.alpha !== undefined && blockDef.alpha < 1) {
        for (const mesh of handMeshes) {
          const mat = mesh.material as import('@babylonjs/core').StandardMaterial
          mat.alpha = blockDef.alpha
          mat.transparencyMode = Material.MATERIAL_ALPHABLEND
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
    isMobile: mobileController.isMobile,
    canMine: () => heldBlockId.value === null,
    onBlockMined(hit) {
      const blockDef = BLOCK_DEFS[hit.blockId]
      if (blockDef.isDroppable !== false) {
        heldBlockId.value = hit.blockId
        if (updateHandMeshRef.value) {
          updateHandMeshRef.value(hit.blockId)
        }
      }
      handleSandGravity(sceneInstance, hit.blockX, hit.blockZ)

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

  /** 手機動作按鈕（挖掘/放置） */
  let mobileActionActive = false

  if (mobileController.isMobile) {
    sceneInstance.onBeforeRenderObservable.add(() => {
      const actionPressed = mobileController.state.action

      /** 放置方塊（按下瞬間觸發） */
      if (actionPressed && !mobileActionActive && heldBlockId.value !== null) {
        mobileActionActive = true
        const hit = castBlockRay(cameraInstance, worldState)
        if (hit) {
          const playerFootX = cameraInstance.position.x
          const playerFootY = cameraInstance.position.y - PLAYER_EYE_HEIGHT
          const playerFootZ = cameraInstance.position.z
          if (placeBlock(worldState, hit.adjacentX, hit.adjacentY, hit.adjacentZ, heldBlockId.value, playerFootX, playerFootY, playerFootZ)) {
            const placedBlockId = heldBlockId.value
            heldBlockId.value = null
            if (updateHandMeshRef.value) {
              updateHandMeshRef.value(null)
            }
            handleSandGravity(sceneInstance, hit.adjacentX, hit.adjacentZ)

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
      }

      /** 挖掘方塊（持續按住由 blockMiner 處理） */
      if (actionPressed && !mobileActionActive && heldBlockId.value === null) {
        mobileActionActive = true
        blockMiner.startMiningAtTarget(cameraInstance, worldState, () => heldBlockId.value === null)
      }

      if (!actionPressed && mobileActionActive) {
        mobileActionActive = false
        blockMiner.stopMining()
      }

      /** 傳送按鈕長按處理 */
      if (mobileController.state.teleport) {
        if (rightClickStartTime.value === null) {
          rightClickStartTime.value = performance.now()
        }
      }
      else if (rightClickStartTime.value !== null) {
        const duration = performance.now() - rightClickStartTime.value
        rightClickStartTime.value = null

        if (duration >= TELEPORT_HOLD_MS) {
          const hit = castBlockRay(cameraInstance, worldState, MAX_TELEPORT_DISTANCE)
          if (hit) {
            const targetX = hit.blockX + 0.5
            const targetZ = hit.blockZ + 0.5
            const safeY = findSafeTeleportY(worldState, targetX, hit.blockY + 1, targetZ)
            if (safeY !== null) {
              fpsController.teleport(targetX, safeY, targetZ)
            }
          }
        }
      }
    })
  }

  /** 滑鼠互動 */
  useEventListener(canvas, 'mousedown', (event) => {
    if (document.pointerLockElement !== canvas)
      return

    /** 左鍵取消傳送集氣 */
    if (event.button === 0 && rightClickStartTime.value !== null) {
      rightClickStartTime.value = null
      return
    }

    if (event.button === 0 && heldBlockId.value !== null) {
      const hit = castBlockRay(cameraInstance, worldState)
      if (!hit) {
        return
      }

      /** 左鍵：放置持有的方塊（檢查不與玩家重疊） */
      const playerFootX = cameraInstance.position.x
      const playerFootY = cameraInstance.position.y - PLAYER_EYE_HEIGHT
      const playerFootZ = cameraInstance.position.z
      if (placeBlock(worldState, hit.adjacentX, hit.adjacentY, hit.adjacentZ, heldBlockId.value, playerFootX, playerFootY, playerFootZ)) {
        const placedBlockId = heldBlockId.value
        heldBlockId.value = null
        if (updateHandMeshRef.value) {
          updateHandMeshRef.value(null)
        }
        handleSandGravity(sceneInstance, hit.adjacentX, hit.adjacentZ)

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

  useEventListener(canvas, 'mouseup', (event) => {
    if (event.button === 2 && rightClickStartTime.value !== null) {
      const duration = performance.now() - rightClickStartTime.value
      rightClickStartTime.value = null

      /** 長按超過 1 秒：執行傳送 */
      if (duration >= TELEPORT_HOLD_MS) {
        const hit = castBlockRay(cameraInstance, worldState, MAX_TELEPORT_DISTANCE)
        if (hit) {
          /** 從命中方塊上方開始，往上尋找安全位置（用實際傳送座標檢查完整 AABB） */
          const targetX = hit.blockX + 0.5
          const targetZ = hit.blockZ + 0.5
          const safeY = findSafeTeleportY(worldState, targetX, hit.blockY + 1, targetZ)
          if (safeY !== null) {
            fpsController.teleport(targetX, safeY, targetZ)
            console.warn(`[Teleport] To (${targetX}, ${safeY}, ${targetZ})`)
          }
        }
      }
    }
  })

  /** 廣播本機玩家位置 */
  let lastPositionBroadcast = 0
  const POSITION_BROADCAST_INTERVAL = 15 // ms
  const BASE_FOV = cameraInstance.fov

  // 用於過濾微小移動的變數
  const lastSentPos = new Vector3()
  let lastSentRotationY = 0
  const MOVE_THRESHOLD = 0.01
  const ROTATION_THRESHOLD = 0.01

  sceneInstance.onBeforeRenderObservable.add(() => {
    /** 處理傳送進度與視覺效果 */
    if (rightClickStartTime.value !== null) {
      const elapsed = performance.now() - rightClickStartTime.value
      // 直接更新 ref 的 value 確保 Vue 響應式觸發
      teleportProgress.value = Math.min(1, elapsed / TELEPORT_HOLD_MS)

      // FOV 縮放效果 (從 BASE_FOV 縮到 BASE_FOV - 0.15)
      cameraInstance.fov = BASE_FOV - (teleportProgress.value * 0.3)
    }
    else {
      // 重置進度
      if (teleportProgress.value !== 0) {
        teleportProgress.value = 0
        cameraInstance.fov = BASE_FOV
      }
    }

    const now = performance.now()
    if (now - lastPositionBroadcast < POSITION_BROADCAST_INTERVAL)
      return

    const pos = cameraInstance.position
    const rotationY = cameraInstance.rotation.y

    // 檢查是否有顯著移動或轉動
    const distance = Vector3.Distance(pos, lastSentPos)
    const rotationDiff = Math.abs(rotationY - lastSentRotationY)

    if (distance < MOVE_THRESHOLD && rotationDiff < ROTATION_THRESHOLD)
      return

    lastPositionBroadcast = now
    lastSentPos.copyFrom(pos)
    lastSentRotationY = rotationY

    if (currentRole.value === NetworkRole.HOST) {
      broadcastPlayerPosition(currentPeerId.value, pos.x, pos.y, pos.z, rotationY)
    }
    else if (currentRole.value === NetworkRole.CLIENT) {
      sendPlayerPositionToHost(pos.x, pos.y, pos.z, rotationY)
    }
  })

  emit('ready')
}

// ── 切換拿在手上的方塊 ──
// window.addEventListener('wheel', (event) => {
//   if (document.pointerLockElement !== canvasRef.value)
//     return

//   const blockIds = Object.values(BlockId)
//     .filter((v) => typeof v === 'number') as BlockId[]
//     .filter((id) => id !== BlockId.AIR && !(BLOCK_DEFS[id] as any)?.isHidden)

//   const currentIndex = heldBlockId.value === null ? -1 : blockIds.indexOf(heldBlockId.value)

//   let nextIndex = currentIndex
//   if (event.deltaY < 0) {
//     // Scroll up
//     nextIndex = (currentIndex + 1) % blockIds.length
//   }
//   else {
//     // Scroll down
//     nextIndex = (currentIndex - 1 + blockIds.length) % blockIds.length
//   }

//   heldBlockId.value = blockIds[nextIndex] ?? null
//   if (updateHandMeshRef.value) {
//     updateHandMeshRef.value(heldBlockId.value)
//   }
// })

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

.teleport-vignette
  position: absolute
  inset: 0
  pointer-events: none
  background: radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.9) 100%)
  transition: opacity 0.1s linear

.teleport-charge-outer
  position: absolute
  top: 50%
  left: 50%
  transform: translate(-50%, 40px)
  display: flex
  flex-direction: column
  align-items: start
  pointer-events: none

.teleport-charge-container
  width: 120px
  height: 6px
  background: rgba(0, 0, 0, 0.6)
  border: 1px solid rgba(255, 255, 255, 0.2)
  overflow: hidden

.teleport-charge-bar
  height: 100%
  background: #a855f7
  box-shadow: 0 0 10px #a855f7
  transition: width 0.016s linear

.teleport-charge-text
  font-size: 10px
  font-weight: bold
  color: #a855f7
  margin-top: 6px
  text-shadow: 0 0 4px black
  letter-spacing: 1px
</style>
