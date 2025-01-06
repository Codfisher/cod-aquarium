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
import { Color3, MeshBuilder, SceneLoader, StandardMaterial } from '@babylonjs/core'
import { useBabylonScene } from './use-babylon-scene'

function createGround(scene: Scene) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 1000,
    height: 1000,
  }, scene)

  const groundMaterial = new StandardMaterial('groundMaterial', scene)
  groundMaterial.diffuseColor = new Color3(0.98, 0.98, 0.98)
  ground.material = groundMaterial
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene } = params

    createGround(scene)

    // const box = MeshBuilder.CreateBox('box', {
    //   size: 1,
    // }, params.scene)

    SceneLoader.ImportMeshAsync(
      '',
      '/sound-blocks/hexagon-pack/decoration/nature/',
      'trees_B_large.gltf',
      scene,
    ).then((result) => {

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
