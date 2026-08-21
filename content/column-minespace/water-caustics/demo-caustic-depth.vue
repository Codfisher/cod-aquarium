<template>
  <demo-frame
    :setup="setupScene"
    title="隨深度衰減，隨日照收放"
    caption="光穿過水會被吃掉，深處的光斑本來就淡。衰減係數往上調，亮網會退到只剩池邊那一圈淺灘，而淺灘正是人看得最清楚的地方。日照那一項則是把整張網一起收掉，夜裡沒有陽光可以聚，水底不該有光斑。"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 3.6"
    :camera-radius="22"
    :camera-target="[0, 1.5, 0]"
    :height="300"
  >
    <demo-slider
      v-model="depthFalloff"
      label="深度衰減"
      :min="0"
      :max="2"
      :step="0.05"
    />
    <demo-slider
      v-model="dayRatio"
      label="日照"
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
import { createCausticPluginClass } from './caustic-plugin'
import { createCausticScene, MAP_ORIGIN, MAP_SPAN, WATER_SURFACE_Y } from './caustic-scene'

const depthFalloff = shallowRef(0.55)
const dayRatio = shallowRef(1)

/** 亮網最亮到什麼程度 */
const CAUSTIC_STRENGTH = 0.55

const state: CausticState = {
  time: 0,
  strength: CAUSTIC_STRENGTH,
  depthFalloff: depthFalloff.value,
  maxSurfaceY: WATER_SURFACE_Y + 0.2,
  cellScale: 1.4,
  cellSpeed: 0.55,
  blend: 0.45,
  secondLayerRatio: 0.7,
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

watch([depthFalloff, dayRatio], () => {
  state.depthFalloff = depthFalloff.value
  /** 陽光穿過水才有焦散，夜裡沒有東西可以聚 */
  state.strength = CAUSTIC_STRENGTH * dayRatio.value
})
</script>
