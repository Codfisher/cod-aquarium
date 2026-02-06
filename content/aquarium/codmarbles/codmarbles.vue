<template>
  <div class=" fixed w-screen h-screen">
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
  FollowCamera,
  HavokPlugin,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Quaternion,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'
import { pipe, tap } from 'remeda'
import { createTrackSegment } from './track-segment'
import { useBabylonScene } from './use-babylon-scene'

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

function createMarble({
  scene,
  startPosition = Vector3.Zero(),
}: {
  scene: Scene;
  startPosition?: Vector3;
}) {
  const marble = MeshBuilder.CreateSphere('marble', {
    diameter: 0.2,
    segments: 32,
  }, scene)
  marble.position.copyFrom(startPosition)
  marble.receiveShadows = true

  const marbleMaterial = new StandardMaterial('marbleMaterial', scene)
  marbleMaterial.diffuseColor = new Color3(0.1, 0.1, 0.1)
  marble.material = marbleMaterial

  const sphereAggregate = new PhysicsAggregate(
    marble,
    PhysicsShapeType.SPHERE,
    { mass: 1, restitution: 0.1, friction: 0 },
    scene,
  )

  return marble
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

    const followCamera = pipe(
      new FollowCamera('FollowCam', new Vector3(0, 10, -10), scene),
      tap((camera) => {
        // 設定相機參數
        camera.radius = 20 // 相機距離目標多遠
        camera.heightOffset = 10 // 相機比目標高多少
        camera.rotationOffset = 90 // 視角角度 (180 代表從正後方看，0 代表從正面看)
        camera.cameraAcceleration = 0.05 // 跟隨加速度 (越小越平滑/延遲)
        camera.maxCameraSpeed = 20 // 最大跟隨速度
      }),
    )

    // 將此相機設為當前主要相機
    scene.activeCamera = followCamera

    const shadowGenerator = createShadowGenerator(scene)

    createGround({ scene })
    const trackSegment = await createTrackSegment({ scene })

    for (let i = 0; i < 2; i++) {
      const marble = createMarble({
        scene,
        startPosition: trackSegment.startPosition,
      })
      shadowGenerator.addShadowCaster(marble)

      if (i === 0) {
        followCamera.lockedTarget = marble
      }
    }
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
