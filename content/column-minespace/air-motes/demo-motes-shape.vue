<template>
  <demo-frame
    :setup="setup"
    :camera-radius="19"
    :camera-beta="1.22"
    :clear-color="[0.5, 0.58, 0.67, 1]"
    title="散布範圍、發射率與壽命"
    caption="三個數字合起來決定「同時有幾顆飄在空中」。範圍拉大而發射率不動，密度就稀掉了；壽命拉長則是同一批顆粒撐得更久。"
  >
    <demo-slider
      v-model="spread"
      label="散布半徑"
      :min="3"
      :max="16"
      :step="0.5"
      :digit="1"
      unit=" 格"
    />
    <demo-slider
      v-model="emitRate"
      label="發射率"
      :min="0"
      :max="80"
      :step="1"
      :digit="0"
      unit=" 顆／秒"
    />
    <demo-slider
      v-model="lifeTime"
      label="壽命"
      :min="1"
      :max="16"
      :step="0.5"
      :digit="1"
      unit=" 秒"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createLandmarkList, createMoteTexture } from './mote-texture'

const spread = ref(11)
const emitRate = ref(26)
const lifeTime = ref(10)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.diffuse = new babylon.Color3(1, 0.97, 0.9)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 44, height: 44 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.32, 0.4, 0.24)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  createLandmarkList(babylon, scene)

  const emitter = new babylon.Vector3(0, 2, 0)

  const moteSystem = new babylon.ParticleSystem('air-mote', 900, scene)
  moteSystem.particleTexture = createMoteTexture(babylon, scene, 'air-mote-texture')
  moteSystem.emitter = emitter
  moteSystem.color1 = new babylon.Color4(1, 0.94, 0.72, 0.55)
  moteSystem.color2 = new babylon.Color4(0.94, 0.9, 0.78, 0.3)
  moteSystem.colorDead = new babylon.Color4(1, 0.94, 0.72, 0)
  moteSystem.minSize = 0.04
  moteSystem.maxSize = 0.08
  moteSystem.gravity = new babylon.Vector3(0, 0.012, 0)
  moteSystem.direction1 = new babylon.Vector3(-0.06, 0.02, -0.06)
  moteSystem.direction2 = new babylon.Vector3(0.06, 0.09, 0.06)
  moteSystem.minEmitPower = 0.04
  moteSystem.maxEmitPower = 0.16
  moteSystem.updateSpeed = 0.02
  moteSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  moteSystem.start()

  /**
   * 三個參數都可以邊跑邊改
   *
   * 發射盒與壽命只影響「還沒生出來的那些」，已經飄在空中的顆粒
   * 照著自己出生時那一份設定走完。所以拉動滑桿之後，
   * 畫面要過幾秒才整批換成新的樣子
   */
  const stopSpread = watch(spread, (radius) => {
    moteSystem.minEmitBox.set(-radius, -2.5, -radius)
    moteSystem.maxEmitBox.set(radius, 4, radius)
  }, { immediate: true })

  const stopRate = watch(emitRate, (rate) => {
    moteSystem.emitRate = rate
  }, { immediate: true })

  const stopLife = watch(lifeTime, (second) => {
    moteSystem.minLifeTime = second * 0.6
    moteSystem.maxLifeTime = second * 1.3
  }, { immediate: true })

  return () => {
    stopSpread()
    stopRate()
    stopLife()
    moteSystem.dispose()
  }
}
</script>
