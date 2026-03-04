<template>
  <div class="relative w-full h-full">
    <canvas
      v-once
      ref="canvasRef"
      class="w-full h-full outline-0"
    />

    <!-- 十字準星 -->
    <div class="crosshair" />
  </div>
</template>

<script setup lang="ts">
import type { UniversalCamera } from '@babylonjs/core'
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import {
  Color3,
  Color4,
  HemisphericLight,
  Scene,
  UniversalCamera as UniversalCameraClass,
  Vector3,
} from '@babylonjs/core'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useFpsController } from '../../composables/use-fps-controller'
import { castBlockRay, digBlock, placeBlock } from '../player/block-interaction'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { BlockId, WORLD_SIZE } from '../world/world-constants'
import { createWorldState, generateTerrain } from '../world/world-state'

const emit = defineEmits<{
  ready: [];
}>()

/** 共享世界狀態 */
let worldState: Uint8Array
let renderer: VoxelRenderer

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

    /** 滑鼠互動：左鍵挖掘、右鍵放置 */
    canvas.addEventListener('mousedown', (event) => {
      /** 需要在 Pointer Lock 狀態下才能操作 */
      if (document.pointerLockElement !== canvas)
        return

      const typedCamera = camera as UniversalCamera
      const hit = castBlockRay(typedCamera, worldState)
      if (!hit)
        return

      if (event.button === 0) {
        /** 左鍵：挖掘 */
        if (digBlock(worldState, hit.blockX, hit.blockY, hit.blockZ)) {
          renderer.rebuildInstances(worldState)
        }
      }
      else if (event.button === 2) {
        /** 右鍵：放置（使用石頭方塊作為預設） */
        if (placeBlock(worldState, hit.adjacentX, hit.adjacentY, hit.adjacentZ, BlockId.STONE)) {
          renderer.rebuildInstances(worldState)
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
</style>
