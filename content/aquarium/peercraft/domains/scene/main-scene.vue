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
import type { UniversalCamera } from '@babylonjs/core'
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import {
  Color3,
  Color4,
  HemisphericLight,
  ParticleSystem,
  Scene,
  Texture,
  UniversalCamera as UniversalCameraClass,
  Vector3,
} from '@babylonjs/core'
import { ref } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useBlockMiner } from '../../composables/use-block-miner'
import { useFpsController } from '../../composables/use-fps-controller'
import { castBlockRay, placeBlock } from '../player/block-interaction'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { BlockId, WORLD_SIZE } from '../world/world-constants'
import { createWorldState, generateTerrain } from '../world/world-state'

const emit = defineEmits<{
  ready: [];
}>()

/** 共享世界狀態 */
let worldState: Uint8Array
let renderer: VoxelRenderer

const isMining = ref(false)
const miningProgress = ref(0)

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

    /** 啟動方塊挖掘控制器 (取代原本的左鍵瞬間挖掘) */
    const miner = useBlockMiner({
      scene,
      camera: camera as UniversalCamera,
      canvas,
      worldState,
      onBlockMined: () => {
        renderer.rebuildInstances(worldState)
      },
    })

    /** 建立挖掘粒子系統 */
    const particleSystem = new ParticleSystem('mining-particles', 200, scene)
    // 簡單的 1x1 白色貼圖 (Base64)
    particleSystem.particleTexture = new Texture(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAwAB/AL+f4R4AAAAAElFTkSuQmCC',
      scene,
    )

    // 發射器形狀：剛好包住一個方塊的大小
    particleSystem.createBoxEmitter(
      new Vector3(-1, 0, -1), // direction1
      new Vector3(1, 1, 1), // direction2
      new Vector3(-0.5, -0.5, -0.5), // minBox
      new Vector3(0.5, 0.5, 0.5), // maxBox
    )

    // 粒子顏色設定為帶點灰土色
    particleSystem.color1 = new Color4(0.6, 0.5, 0.4, 1.0)
    particleSystem.color2 = new Color4(0.4, 0.3, 0.2, 1.0)
    particleSystem.colorDead = new Color4(0.2, 0.2, 0.2, 0.0)

    particleSystem.minSize = 0.05
    particleSystem.maxSize = 0.15
    particleSystem.minLifeTime = 0.2
    particleSystem.maxLifeTime = 0.4
    particleSystem.emitRate = 60
    particleSystem.gravity = new Vector3(0, -10, 0)
    particleSystem.minEmitPower = 0.5
    particleSystem.maxEmitPower = 2
    particleSystem.updateSpeed = 0.01

    /** 同步狀態給 UI 與粒子系統 */
    scene.onBeforeRenderObservable.add(() => {
      isMining.value = miner.isMining.value
      miningProgress.value = miner.miningProgress.value

      // 處理粒子發射
      if (miner.isMining.value && miner.targetBlock.value) {
        particleSystem.emitter = new Vector3(
          miner.targetBlock.value.x,
          miner.targetBlock.value.y,
          miner.targetBlock.value.z,
        )
        if (!particleSystem.isStarted()) {
          particleSystem.start()
        }
      }
      else {
        if (particleSystem.isStarted()) {
          particleSystem.stop()
        }
      }
    })

    /** 滑鼠互動：右鍵放置（左鍵已交由 miner 處理） */
    canvas.addEventListener('mousedown', (event) => {
      if (document.pointerLockElement !== canvas)
        return

      if (event.button === 2) {
        const typedCamera = camera as UniversalCamera
        const hit = castBlockRay(typedCamera, worldState)
        if (hit) {
          /** 右鍵：放置（使用石頭方塊作為預設） */
          if (placeBlock(worldState, hit.adjacentX, hit.adjacentY, hit.adjacentZ, BlockId.STONE)) {
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
