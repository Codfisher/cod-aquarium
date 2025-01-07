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
import { AssetsManager, Color3, MeshBuilder, StandardMaterial } from '@babylonjs/core'
import { useBabylonScene } from './use-babylon-scene'

function createGround(scene: Scene) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 1000,
    height: 1000,
  }, scene)

  const groundMaterial = new StandardMaterial('groundMaterial', scene)
  groundMaterial.diffuseColor = new Color3(196 / 255, 207 / 255, 199 / 255)
  ground.material = groundMaterial
}

function createAssetsManager(scene: Scene) {
  const assetsManager = new AssetsManager(scene)

  assetsManager.addMeshTask('trees', '', '/sound-blocks/hexagon-pack/decoration/nature/', 'trees_B_large.gltf')

  assetsManager.load()

  return assetsManager
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene } = params

    createGround(scene)

    const assetsManager = createAssetsManager(scene)
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
