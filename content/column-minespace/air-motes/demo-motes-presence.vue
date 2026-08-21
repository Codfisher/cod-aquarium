<template>
  <demo-frame
    :setup="setup"
    :camera-radius="17"
    :camera-beta="1.28"
    :clear-color="[0.55, 0.63, 0.71, 1]"
    title="同一個場景，空氣裡有沒有東西"
    caption="關掉顆粒時，方塊與方塊之間是一段完全透明的距離。打開之後，那段距離才有東西可以量。"
  >
    <demo-toggle
      v-model="motesVisible"
      label="空氣顆粒"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createLandmarkList, createMoteTexture } from './mote-texture'

const motesVisible = ref(true)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.75
  ambient.diffuse = new babylon.Color3(1, 0.97, 0.9)

  const sun = new babylon.DirectionalLight('sun', new babylon.Vector3(-0.4, -0.8, 0.45), scene)
  sun.intensity = 0.8

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 44, height: 44 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.34, 0.42, 0.25)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  createLandmarkList(babylon, scene)

  /**
   * 顆粒撒在鏡頭周圍這一圈盒子裡
   *
   * 發射器本身是一個座標，minEmitBox 與 maxEmitBox 是相對於它的角落，
   * 兩者夾出來的長方體就是顆粒生出來的範圍
   */
  const emitter = new babylon.Vector3(0, 2, 0)

  const moteSystem = new babylon.ParticleSystem('air-mote', 240, scene)
  moteSystem.particleTexture = createMoteTexture(babylon, scene, 'air-mote-texture')
  moteSystem.emitter = emitter
  moteSystem.minEmitBox = new babylon.Vector3(-11, -2.5, -11)
  moteSystem.maxEmitBox = new babylon.Vector3(11, 4, 11)

  moteSystem.color1 = new babylon.Color4(1, 0.94, 0.72, 0.5)
  moteSystem.color2 = new babylon.Color4(0.94, 0.9, 0.78, 0.28)
  moteSystem.colorDead = new babylon.Color4(1, 0.94, 0.72, 0)

  /** 大一點就不是浮塵而是雪，這個尺寸在畫面上只佔幾個像素 */
  moteSystem.minSize = 0.04
  moteSystem.maxSize = 0.08
  moteSystem.minLifeTime = 6
  moteSystem.maxLifeTime = 13

  /** 幾乎沒有重力，只留一點點浮力。灰塵在靜止的空氣裡是懸著的 */
  moteSystem.gravity = new babylon.Vector3(0, 0.012, 0)
  moteSystem.direction1 = new babylon.Vector3(-0.06, 0.02, -0.06)
  moteSystem.direction2 = new babylon.Vector3(0.06, 0.09, 0.06)
  moteSystem.minEmitPower = 0.04
  moteSystem.maxEmitPower = 0.16
  moteSystem.updateSpeed = 0.02
  moteSystem.emitRate = 26
  moteSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  moteSystem.start()

  const stop = watch(motesVisible, (visible) => {
    moteSystem.emitRate = visible ? 26 : 0
  }, { immediate: true })

  return () => {
    stop()
    moteSystem.dispose()
  }
}
</script>
