<template>
  <demo-frame
    :setup="setup"
    :camera-radius="9"
    :camera-beta="1.42"
    :clear-color="[0.62, 0.72, 0.78, 1]"
    title="高度槓桿：從根部彎，還是整塊平移"
    caption="槓桿為零時整株一起橫移，底邊也跟著跑，草看起來像浮在地上的一塊布。拉到一，根部就釘住了，只有上半截在動。"
  >
    <demo-slider
      v-model="heightLeverage"
      label="高度槓桿"
      :min="0"
      :max="1"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { advanceWind, createGrassField, createGrassSwayState } from './grass-field'

const heightLeverage = ref(1)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.92
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.92)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.29, 0.36, 0.22)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  const state = createGrassSwayState()
  /** 幅度給大一點，兩種擺法的差別才看得清楚 */
  state.amplitude = 0.32

  const field = createGrassField({
    babylon,
    scene,
    state,
    extent: 8,
    plantCount: 260,
  })

  const observer = scene.onBeforeRenderObservable.add(() => {
    advanceWind(state, Math.min(0.1, scene.getEngine().getDeltaTime() / 1000))
  })

  const stop = watch(heightLeverage, (value) => {
    state.heightLeverage = value
  }, { immediate: true })

  return () => {
    stop()
    scene.onBeforeRenderObservable.remove(observer)
    field.dispose()
  }
}
</script>
