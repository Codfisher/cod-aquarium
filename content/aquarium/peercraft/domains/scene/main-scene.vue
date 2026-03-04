<template>
  <canvas
    v-once
    ref="canvasRef"
    class="w-full h-full outline-0"
  />
</template>

<script setup lang="ts">
import {
  Color3,
  Color4,
  HemisphericLight,
  Scene,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { WORLD_SIZE } from '../world/world-constants'
import { createWorldState, generateTerrain } from '../world/world-state'

const emit = defineEmits<{
  ready: [];
}>()

const { canvasRef } = useBabylonScene({
  createScene({ engine }) {
    const scene = new Scene(engine)

    /** 天空色 */
    scene.clearColor = new Color4(0.53, 0.74, 0.93, 1)

    /** 半球光源：模擬日光 */
    const light = new HemisphericLight(
      'sun',
      new Vector3(0.3, 1, 0.5),
      scene,
    )
    light.intensity = 1.1
    light.diffuse = new Color3(1.0, 0.98, 0.92)
    light.groundColor = new Color3(0.3, 0.3, 0.4)

    /** 線性霧效 */
    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = new Color3(0.53, 0.74, 0.93)
    scene.fogStart = 40
    scene.fogEnd = 90

    return scene
  },

  createCamera({ scene, canvas }) {
    /** FPS 風格攝影機，初始位置在世界中央上方 */
    const spawnPosition = new Vector3(
      WORLD_SIZE / 2,
      12,
      WORLD_SIZE / 2,
    )

    const camera = new UniversalCamera(
      'fps-camera',
      spawnPosition,
      scene,
    )

    /** 視線朝向世界中心 */
    camera.setTarget(new Vector3(
      WORLD_SIZE / 2,
      8,
      WORLD_SIZE / 2 + 10,
    ))

    camera.attachControl(canvas, true)

    /** WASD 移動 */
    camera.keysUp = [87] // W
    camera.keysDown = [83] // S
    camera.keysLeft = [65] // A
    camera.keysRight = [68] // D

    camera.speed = 0.5
    camera.minZ = 0.1

    return camera
  },

  async init({ scene }) {
    /** 建立世界 */
    const worldState = createWorldState()
    generateTerrain(worldState)

    /** 渲染體素 */
    createVoxelRenderer(scene, worldState)

    emit('ready')
  },
})
</script>
