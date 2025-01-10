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
  DirectionalLight,
  MeshBuilder,
  ShadowGenerator,
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
  const light = new DirectionalLight('dir01', new Vector3(-5, -5, 0), scene)
  light.intensity = 0.7

  const shadowGenerator = new ShadowGenerator(1024, light)

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
