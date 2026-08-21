<template>
  <demo-frame
    :setup="setup"
    :camera-radius="17"
    :camera-beta="1.16"
    :clear-color="[0.62, 0.72, 0.78, 1]"
    title="踩過去要推開，也要壓下去"
    caption="只有橫推的話，草是整株往旁邊挪，高度一點沒變。加上下壓之後，草尖才從正上方倒到大約五十度。"
  >
    <demo-slider
      v-model="push"
      label="推開量"
      :min="0"
      :max="1.4"
      :step="0.05"
      unit=" 格"
    />
    <demo-slider
      v-model="pressRatio"
      label="下壓比例"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-slider
      v-model="radius"
      label="影響半徑"
      :min="0.6"
      :max="4.5"
      :step="0.1"
      :digit="1"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { advanceWind, createGrassField, createGrassSwayState, createTrail } from './grass-field'

const push = ref(0.75)
const pressRatio = ref(0.55)
const radius = ref(1.5)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.92)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 34, height: 34 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.29, 0.36, 0.22)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  const state = createGrassSwayState()
  state.amplitude = 0.14

  const field = createGrassField({
    babylon,
    scene,
    state,
    extent: 20,
    plantCount: 2400,
  })

  const trail = createTrail(state, {
    recoverSecond: 1,
    push: push.value,
    stampDistanceMin: 0.8,
    stampDistanceMax: 4,
  })

  /** 一個在草叢裡走來走去的人 */
  const walker = babylon.MeshBuilder.CreateBox('walker', { width: 0.5, depth: 0.5, height: 1.8 }, scene)
  const walkerMaterial = new babylon.StandardMaterial('walker-material', scene)
  walkerMaterial.diffuseColor = new babylon.Color3(0.22, 0.24, 0.3)
  walkerMaterial.specularColor = new babylon.Color3(0, 0, 0)
  walker.material = walkerMaterial
  walker.isPickable = false

  let elapsedSecond = 0

  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    elapsedSecond += deltaSecond
    advanceWind(state, deltaSecond)

    /** 走一個八字，順便看看轉彎時草倒的方向怎麼跟上 */
    const footX = Math.sin(elapsedSecond * 0.55) * 6
    const footZ = Math.sin(elapsedSecond * 1.1) * 4.5

    walker.position.set(footX, 0.9, footZ)
    trail.update(footX, 0, footZ, deltaSecond)
  })

  const stopPush = watch(push, (value) => {
    trail.config.push = value
  })

  const stopPress = watch(pressRatio, (value) => {
    state.tramplePressRatio = value
  }, { immediate: true })

  const stopRadius = watch(radius, (value) => {
    state.trampleRadius = value
    /** 核心永遠是外圈的四成，兩者不能顛倒 */
    state.trampleCoreRadius = value * 0.4
  }, { immediate: true })

  return () => {
    stopPush()
    stopPress()
    stopRadius()
    scene.onBeforeRenderObservable.remove(observer)
    field.dispose()
    walker.dispose()
    walkerMaterial.dispose()
  }
}
</script>
