<template>
  <div class=" overflow-hidden">
    <canvas
      ref="canvasRef"
      class="canvas w-full h-full"
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
import { onMounted, onUnmounted } from 'vue'
import { createTreeBlock } from './blocks'
import { useBabylonScene } from './use-babylon-scene'

function createGround({ scene }: {
  scene: Scene;
}) {
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
  shadowGenerator.usePoissonSampling = true

  return shadowGenerator
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene } = params
    const shadowGenerator = createShadowGenerator(scene)

    createGround({ scene })

    await createTreeBlock({ scene, shadowGenerator })
  },
})

onMounted(() => {
  document.body.classList.add('overflow-hidden')
})
onUnmounted(() => {
  document.body.classList.remove('overflow-hidden')
})
</script>

<style lang="sass">
body.overflow-hidden
  overflow: hidden
</style>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
