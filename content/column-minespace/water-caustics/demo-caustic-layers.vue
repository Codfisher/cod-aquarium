<template>
  <demo-frame
    :setup="setupScene"
    title="一層與兩層"
    caption="單層的網會蠕動，但整片水底是同一個節奏，看久了像一張抖動的網子。疊上第二層，尺度小一點、速度快一點、方向相反，兩層錯開之後才有水在流的樣子。密度太粗會變成水底鋪著幾塊亮斑，那不像光。"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 3.3"
    :camera-radius="24"
    :camera-target="[0, 1.5, 0]"
    :height="300"
  >
    <demo-slider
      v-model="secondLayerRatio"
      label="第二層"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-slider
      v-model="cellScale"
      label="網格密度"
      :min="0.4"
      :max="3"
      :step="0.1"
      :digit="1"
    />
    <demo-slider
      v-model="cellSpeed"
      label="流速"
      :min="0"
      :max="1.5"
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
import { createCausticPluginClass } from './caustic-plugin'
import { createCausticScene, MAP_ORIGIN, MAP_SPAN, WATER_SURFACE_Y } from './caustic-scene'

const secondLayerRatio = shallowRef(0.7)
const cellScale = shallowRef(1.4)
const cellSpeed = shallowRef(0.55)

const state: CausticState = {
  time: 0,
  strength: 0.55,
  depthFalloff: 0.55,
  /** 留一點餘裕給水面本身那一格，門檻卡在水面上會讓最淺的一層閃掉 */
  maxSurfaceY: WATER_SURFACE_Y + 0.2,
  cellScale: cellScale.value,
  cellSpeed: cellSpeed.value,
  blend: 0.45,
  secondLayerRatio: secondLayerRatio.value,
  hasWaterMap: true,
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

watch([secondLayerRatio, cellScale, cellSpeed], () => {
  state.secondLayerRatio = secondLayerRatio.value
  state.cellScale = cellScale.value
  state.cellSpeed = cellSpeed.value
})
</script>
