<template>
  <div class=" overflow-hidden">
    <canvas
      ref="canvasRef"
      class="canvas w-full h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { ArcRotateCamera, Color3, Color4, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core'
import { useBabylonScene } from './use-babylon-scene'

function createGround(scene: Scene) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 1000,
    height: 1000,
  }, scene)

  const groundMaterial = new StandardMaterial('groundMaterial', scene)
  groundMaterial.diffuseColor = new Color3(240 / 255, 250 / 255, 212 / 255)
  ground.material = groundMaterial
}

const {
  canvasRef,
} = useBabylonScene({
  createCamera({ scene, canvas }) {
    const camera = new ArcRotateCamera(
      'camera',
      0,
      Math.PI / 3 * 2,
      10,
      new Vector3(0, 0, 0),
      scene,
    )

    camera.attachControl(canvas, true)
    // 禁止平移
    camera.panningSensibility = 0

    camera.wheelDeltaPercentage = 0.01
    camera.lowerRadiusLimit = 10
    camera.upperRadiusLimit = 50

    // 限制鏡頭角度
    camera.lowerBetaLimit = 0
    camera.upperBetaLimit = Math.PI / 3

    return camera
  },
  createScene({ engine }) {
    const scene = new Scene(engine)
    /** 使用預設光源 */
    scene.createDefaultLight()

    const defaultLight = scene.lights.at(-1)
    if (defaultLight instanceof HemisphericLight) {
      defaultLight.direction = new Vector3(0.5, 1, 0)
    }

    scene.clearColor = new Color4(250 / 255, 255 / 255, 222 / 255, 1)

    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = new Color3(240 / 255, 250 / 255, 212 / 255)
    scene.fogStart = 20
    scene.fogEnd = 30

    return scene
  },
  async init(params) {
    createGround(params.scene)

    const box = MeshBuilder.CreateBox('box', {
      size: 1,
    }, params.scene)
  },
})
</script>

<style lang="sass">
body
  overflow: hidden
</style>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
