<template>
  <demo-frame
    :setup="setupScene"
    title="怎麼知道哪裡有水"
    caption="關掉水位圖之後，判斷條件只剩「比水面矮」，於是水池旁邊那個乾的坑也整片亮起了水底才有的網。片段著色器問不到世界資料，它只知道自己在哪裡，所以「這個點在不在水下」得先烘成一張圖讓它去查。"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 3.3"
    :camera-radius="30"
    :camera-target="[2.5, 1.5, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="waterMapEnabled"
      label="查水位圖"
    />
    <demo-slider
      v-model="strength"
      label="亮網強度"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { CausticState } from './caustic-plugin'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createCausticPluginClass } from './caustic-plugin'
import { createCausticScene, MAP_ORIGIN, MAP_SPAN, WATER_SURFACE_Y } from './caustic-scene'

const waterMapEnabled = shallowRef(true)
const strength = shallowRef(0.55)

const state: CausticState = {
  time: 0,
  strength: strength.value,
  depthFalloff: 0.55,
  maxSurfaceY: WATER_SURFACE_Y + 0.2,
  cellScale: 1.4,
  cellSpeed: 0.55,
  blend: 0.45,
  secondLayerRatio: 0.7,
  hasWaterMap: waterMapEnabled.value,
}

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context

  const { materialList, waterLevelTexture } = createCausticScene(context)

  const PluginClass = createCausticPluginClass({
    babylon,
    state,
    waterLevelTexture,
    mapOrigin: MAP_ORIGIN,
    mapSpan: MAP_SPAN,
  })

  for (const material of materialList) {
    // eslint-disable-next-line no-new
    new PluginClass(material)
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    state.time += scene.getEngine().getDeltaTime() / 1000
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}

watch([waterMapEnabled, strength], () => {
  state.hasWaterMap = waterMapEnabled.value
  state.strength = strength.value
})
</script>
