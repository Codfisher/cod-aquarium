<template>
  <div class=" ">
    <canvas
      ref="canvasRef"
      class="w-full h-full outline-none"
    />
  </div>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import {
  Color3,
  DirectionalLight,
  HavokPlugin,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'
import { useBabylonScene } from '../composables/use-babylon-scene'

function createGround({ scene }: {
  scene: Scene;
}) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 1000,
    height: 1000,
  }, scene)
  ground.receiveShadows = true

  const groundMaterial = new StandardMaterial('groundMaterial', scene)
  groundMaterial.diffuseColor = new Color3(0.98, 0.98, 0.98)
  ground.material = groundMaterial

  const groundAggregate = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene)

  return ground
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

    const havokInstance = await HavokPhysics()
    const havokPlugin = new HavokPlugin(true, havokInstance)
    scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin)

    const shadowGenerator = createShadowGenerator(scene)

    createGround({ scene })
  },
})
</script>

<style lang="sass" scoped>
</style>
