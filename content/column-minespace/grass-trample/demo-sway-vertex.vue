<template>
  <demo-frame
    :setup="setup"
    :camera-radius="13"
    :camera-beta="1.18"
    :clear-color="[0.62, 0.72, 0.78, 1]"
    title="頂點著色器外掛：改的是位置本身"
    caption="全世界的草共用同一份頂點資料，CPU 這邊沒有「單獨移動其中一株」的餘地。擺動只能在頂點著色器裡做。"
  >
    <demo-slider
      v-model="amplitude"
      label="擺動幅度"
      :min="0"
      :max="0.4"
      :step="0.01"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { advanceWind, createGrassField, createGrassSwayState } from './grass-field'

const amplitude = ref(0.14)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.92)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.29, 0.36, 0.22)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  const state = createGrassSwayState()
  const field = createGrassField({
    babylon,
    scene,
    state,
    extent: 16,
    plantCount: 900,
  })

  const observer = scene.onBeforeRenderObservable.add(() => {
    advanceWind(state, Math.min(0.1, scene.getEngine().getDeltaTime() / 1000))
  })

  const stop = watch(amplitude, (value) => {
    state.amplitude = value
  }, { immediate: true })

  return () => {
    stop()
    scene.onBeforeRenderObservable.remove(observer)
    field.dispose()
  }
}
</script>
