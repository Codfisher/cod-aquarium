<template>
  <div class=" overflow-hidden">
    <canvas
      ref="canvasRef"
      class="canvas w-full !h-full"
    />
  </div>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import {
  Color3,
  MeshBuilder,
  ShadowGenerator,
  SpotLight,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { createTreeBlock } from './blocks/tree'
import { useBabylonScene } from './use-babylon-scene'

function createGround(scene: Scene) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 1000,
    height: 1000,
  }, scene)

  const groundMaterial = new StandardMaterial('groundMaterial', scene)
  groundMaterial.diffuseColor = new Color3(0.98, 0.98, 0.98)
  ground.material = groundMaterial

  ground.receiveShadows = true
}

function createShadowGenerator(scene: Scene) {
  const light = new SpotLight(
    'spot',
    new Vector3(30, 40, 20),
    new Vector3(-1, -2, -1),
    1.1,
    16,
    scene,
  )
  light.intensity = 0.7

  const shadowGenerator = new ShadowGenerator(1024, light)
  shadowGenerator.useBlurExponentialShadowMap = true

  return shadowGenerator
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene } = params

    createGround(scene)
    const shadowGenerator = createShadowGenerator(scene)

    const block = await createTreeBlock({ scene })
    block.meshes.forEach((mesh) => {
      shadowGenerator.addShadowCaster(mesh)
    })
  },
})
</script>

<!-- <style lang="sass">
body
  overflow: hidden
</style> -->

<style lang="sass" scoped>
.canvas
  outline: none
</style>
