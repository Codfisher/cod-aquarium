<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-beta="1.24"
    :camera-alpha="-0.35"
    :clear-color="[0.62, 0.72, 0.78, 1]"
    title="陣風管範圍，行進波管順序"
    caption="只留陣風，整片草是同時動的，因為十一格才一個起伏。加上行進波之後，一排草才是接力倒下去的。"
  >
    <demo-toggle
      v-model="gustEnabled"
      label="陣風"
    />
    <demo-toggle
      v-model="rippleEnabled"
      label="行進波"
    />
    <demo-slider
      v-model="wavelength"
      label="波長"
      :min="2"
      :max="30"
      :step="0.5"
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
import DemoToggle from '../demo/demo-toggle.vue'
import { advanceWind, createGrassField, createGrassSwayState } from './grass-field'

const gustEnabled = ref(true)
const rippleEnabled = ref(true)
const wavelength = ref(6)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.92)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 44, height: 44 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.29, 0.36, 0.22)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  const state = createGrassSwayState()
  state.amplitude = 0.22
  /** 這個範例只看前兩層，細碎顫動先收掉 */
  state.flutterWeight = 0

  const field = createGrassField({
    babylon,
    scene,
    state,
    extent: 26,
    plantCount: 2200,
  })

  const observer = scene.onBeforeRenderObservable.add(() => {
    advanceWind(state, Math.min(0.1, scene.getEngine().getDeltaTime() / 1000))
  })

  const stopGust = watch(gustEnabled, (enabled) => {
    state.gustWeight = enabled ? 1 : 0
  }, { immediate: true })

  const stopRipple = watch(rippleEnabled, (enabled) => {
    state.rippleWeight = enabled ? 1 : 0
  }, { immediate: true })

  const stopWavelength = watch(wavelength, (value) => {
    /** 波長換算成角頻率，一個週期是 2π */
    state.rippleFrequency = Math.PI * 2 / value
  }, { immediate: true })

  return () => {
    stopGust()
    stopRipple()
    stopWavelength()
    scene.onBeforeRenderObservable.remove(observer)
    field.dispose()
  }
}
</script>
