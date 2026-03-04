<template>
  <div class="relative w-full h-full">
    <canvas
      v-once
      ref="canvasRef"
      class="w-full h-full outline-0"
    />

    <!-- 十字準星 -->
    <div class="crosshair" />

    <!-- 挖掘進度條 -->
    <div
      v-show="isMining && miningProgress > 0"
      class="mining-progress-container"
    >
      <div
        class="mining-progress-bar"
        :style="{ width: `${miningProgress * 100}%` }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Mesh, UniversalCamera } from '@babylonjs/core'
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import { Color3, Color4, HemisphericLight, MeshBuilder, ParticleSystem, Scene, StandardMaterial, Texture, TransformNode, UniversalCamera as UniversalCameraClass, Vector3 } from '@babylonjs/core'
import { ref } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useBlockMiner } from '../../composables/use-block-miner'
import { useFpsController } from '../../composables/use-fps-controller'
import { castBlockRay, placeBlock } from '../player/block-interaction'
import { createPixelMaterial, createVoxelRenderer } from '../renderer/voxel-renderer'
import { BLOCK_TEXTURES, BlockId, WORLD_SIZE } from '../world/world-constants'
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

const { canvasRef } = useBabylonScene({
  createScene({ engine }) {
    const scene = new Scene(engine)

    scene.clearColor = new Color4(0.53, 0.74, 0.93, 1)

    const light = new HemisphericLight(
      'sun',
      new Vector3(0.3, 1, 0.5),
      scene,
    )
    light.intensity = 1.1
    light.diffuse = new Color3(1.0, 0.98, 0.92)
    light.groundColor = new Color3(0.3, 0.3, 0.4)

    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = new Color3(0.53, 0.74, 0.93)
    scene.fogStart = 40
    scene.fogEnd = 90

    return scene
  },

  createCamera({ scene, canvas }) {
    const spawnPosition = new Vector3(
      WORLD_SIZE / 2,
      12,
      WORLD_SIZE / 2,
    )

    const camera = new UniversalCameraClass(
      'fps-camera',
      spawnPosition,
      scene,
    )

    camera.setTarget(new Vector3(
      WORLD_SIZE / 2,
      8,
      WORLD_SIZE / 2 + 10,
    ))

    camera.attachControl(canvas, true)
    camera.minZ = 0.1
    /** 擴大 FOV 讓畫面看起來比較寬廣、不會太有壓迫感 (預設是 0.8) */
    camera.fov = 1.2

    return camera
  },

  async init({ scene, camera, canvas }) {
    /** 建立世界 */
    worldState = createWorldState()
    generateTerrain(worldState)

    /** 渲染體素 */
    renderer = createVoxelRenderer(scene, worldState)

    /** 啟動 FPS 控制器 */
    useFpsController({
      scene,
      camera: camera as UniversalCamera,
      canvas,
      worldState,
    })

    /** 建立手持方塊節點 */
    const handTransform = new TransformNode('hand-transform', scene)
    handTransform.parent = camera
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
          const mesh = MeshBuilder.CreateBox('hand-block', { size }, scene)
          mesh.parent = handTransform
          mesh.material = createPixelMaterial(`hand_${blockId}`, textureDef.all, scene)
          handMeshes.push(mesh)
        }
        else {
          const half = size / 2

          const topMat = createPixelMaterial(`hand_${blockId}_top`, textureDef.top ?? '', scene, textureDef.topTint)
          const topMesh = MeshBuilder.CreatePlane(`hand_${blockId}_top`, { size }, scene)
          topMesh.rotation.x = Math.PI / 2
          topMesh.position.y = half
          topMesh.material = topMat
          topMesh.parent = handTransform
          handMeshes.push(topMesh)

          const bottomMat = createPixelMaterial(`hand_${blockId}_bottom`, textureDef.bottom ?? '', scene)
          const bottomMesh = MeshBuilder.CreatePlane(`hand_${blockId}_bottom`, { size }, scene)
          bottomMesh.rotation.x = -Math.PI / 2
          bottomMesh.position.y = -half
          bottomMesh.material = bottomMat
          bottomMesh.parent = handTransform
          handMeshes.push(bottomMesh)

          const sideMat = createPixelMaterial(`hand_${blockId}_side`, textureDef.side ?? '', scene, textureDef.sideTint)
          const sideRotations = [
            { name: 'front', rotationY: 0, x: 0, z: half },
            { name: 'back', rotationY: Math.PI, x: 0, z: -half },
            { name: 'left', rotationY: -Math.PI / 2, x: -half, z: 0 },
            { name: 'right', rotationY: Math.PI / 2, x: half, z: 0 },
          ]

          for (const { name, rotationY, x, z } of sideRotations) {
            const sideMesh = MeshBuilder.CreatePlane(`hand_${blockId}_${name}`, { size }, scene)
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
      scene,
      camera: camera as UniversalCamera,
      canvas,
      worldState,
      canMine: () => heldBlockId.value === null,
      onBlockMined: (hit) => {
        /** 挖掉方塊後，將該方塊拿在手上 */
        heldBlockId.value = hit.blockId
        updateHandMesh(hit.blockId)
        renderer.rebuildInstances(worldState)
      },
    })

    let currentParticleBlockId: BlockId | null = null

    /** 建立破壞裂痕疊加層 (Destruction Overlay) */
    const destroyMaterialList: StandardMaterial[] = []
    for (let i = 0; i < 10; i++) {
      const mat = new StandardMaterial(`destroy_stage_${i}`, scene)
      const tex = new Texture(`/assets/minecraft/textures/block/destroy_stage_${i}.png`, scene, {
        samplingMode: Texture.NEAREST_SAMPLINGMODE,
      })
      tex.hasAlpha = true
      mat.diffuseTexture = tex
      mat.useAlphaFromDiffuseTexture = true
      mat.zOffset = -1 // 避免 Z-fighting
      destroyMaterialList.push(mat)
    }

    const destroyOverlay = MeshBuilder.CreateBox('destroy-overlay', { size: 1.002 }, scene)
    destroyOverlay.isVisible = false
    destroyOverlay.isPickable = false

    /** 建立挖掘粒子系統 */
    const particleSystem = new ParticleSystem('mining-particles', 200, scene)

    // 發射器形狀：剛好包住一個方塊的大小
    particleSystem.createBoxEmitter(
      new Vector3(-1, 0, -1), // direction1
      new Vector3(1, 1, 1), // direction2
      new Vector3(-0.5, -0.5, -0.5), // minBox
      new Vector3(0.5, 0.5, 0.5), // maxBox
    )

    // 使用標準透明度混合 (避免 Additive Blend 讓碎片發白)
    particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD

    // 粒子本身不干涉材質顏色
    particleSystem.color1 = new Color4(1.0, 1.0, 1.0, 1.0)
    particleSystem.color2 = new Color4(1.0, 1.0, 1.0, 1.0)
    particleSystem.colorDead = new Color4(1.0, 1.0, 1.0, 0.0)

    // 設定粒子尺寸為小碎片
    particleSystem.minSize = 0.05
    particleSystem.maxSize = 0.15
    particleSystem.minLifeTime = 0.2
    particleSystem.maxLifeTime = 0.4
    particleSystem.emitRate = 60
    particleSystem.gravity = new Vector3(0, -10, 0)
    particleSystem.minEmitPower = 1
    particleSystem.maxEmitPower = 3
    particleSystem.updateSpeed = 0.01

    // 開啟 Sprite Sheet 模式，將 16x16 的材質切成 4x4 大小的 16 塊小碎片，每顆粒子隨機取一塊
    particleSystem.isAnimationSheetEnabled = true
    particleSystem.spriteCellWidth = 4
    particleSystem.spriteCellHeight = 4
    particleSystem.startSpriteCellID = 0
    particleSystem.endSpriteCellID = 15
    particleSystem.spriteCellChangeSpeed = 0
    particleSystem.spriteRandomStartCell = true

    /** 同步狀態給 UI 與粒子系統 */
    scene.onBeforeRenderObservable.add(() => {
      isMining.value = miner.isMining.value
      miningProgress.value = miner.miningProgress.value

      // 處理粒子發射
      if (miner.isMining.value && miner.targetBlock.value && miner.targetBlockId.value !== null) {
        // 動態更換粒子材質為方塊底部貼圖
        if (currentParticleBlockId !== miner.targetBlockId.value) {
          currentParticleBlockId = miner.targetBlockId.value
          const textureDef = BLOCK_TEXTURES[currentParticleBlockId as keyof typeof BLOCK_TEXTURES]
          const texturePath = textureDef.bottom ?? textureDef.all ?? ''
          if (texturePath) {
            if (particleSystem.particleTexture) {
              particleSystem.particleTexture.dispose()
            }
            particleSystem.particleTexture = new Texture(texturePath, scene, {
              samplingMode: Texture.NEAREST_SAMPLINGMODE,
            })
          }
        }

        particleSystem.emitter = new Vector3(
          miner.targetBlock.value.x,
          miner.targetBlock.value.y,
          miner.targetBlock.value.z,
        )
        if (!particleSystem.isStarted()) {
          particleSystem.start()
        }

        // 更新裂痕疊加層
        destroyOverlay.position.copyFrom(particleSystem.emitter as Vector3)
        // 根據進度 0~1 決定階段 0~9
        const stage = Math.min(9, Math.floor(miner.miningProgress.value * 10))
        destroyOverlay.material = destroyMaterialList[stage] || null
        if (!destroyOverlay.isVisible) {
          destroyOverlay.isVisible = true
        }
      }
      else {
        if (particleSystem.isStarted()) {
          particleSystem.stop()
        }
        if (destroyOverlay.isVisible) {
          destroyOverlay.isVisible = false
        }
      }
    })

    /** 滑鼠互動：左鍵放置（空手挖掘已交由 miner 處理） */
    canvas.addEventListener('mousedown', (event) => {
      if (document.pointerLockElement !== canvas)
        return

      if (event.button === 0 && heldBlockId.value !== null) {
        const typedCamera = camera as UniversalCamera
        const hit = castBlockRay(typedCamera, worldState)
        if (hit) {
          /** 左鍵：放置持有的方塊 */
          if (placeBlock(worldState, hit.adjacentX, hit.adjacentY, hit.adjacentZ, heldBlockId.value)) {
            heldBlockId.value = null // 放完後變回空手
            updateHandMesh(null)
            renderer.rebuildInstances(worldState)
          }
        }
      }
    })

    /** 停用右鍵選單 */
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault()
    })

    emit('ready')
  },
})
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
