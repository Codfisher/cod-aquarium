<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="相位函數是整個效果成立的關鍵"
    caption="關掉相位，加上去的東西不分方向，戶外滿視野的空氣都曬得到太陽，每一個像素被加上差不多的亮度，那是一層白幕。開著相位，亮度自己就集中到太陽那一側。轉到背對太陽再開關一次，差別最清楚。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.2"
    :camera-radius="22"
    :camera-target="[0, 3.5, 2]"
    :height="320"
  >
    <demo-toggle
      v-model="phaseEnabled"
      label="相位函數"
    />
    <demo-slider
      v-model="anisotropy"
      label="前向集中度"
      :min="0"
      :max="0.85"
      :step="0.05"
      :digit="2"
    />
    <demo-slider
      v-model="scatterBase"
      label="各向同性的底"
      :min="0"
      :max="0.6"
      :step="0.02"
      :digit="2"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { addBeamAnchor, createBeamPostProcess } from './beam-scene'

const MAX_STEP_COUNT = 32

const phaseEnabled = shallowRef(true)
const anisotropy = shallowRef(0.45)
const scatterBase = shallowRef(0.18)

const badge = computed(() => {
  if (!phaseEnabled.value)
    return '不分方向，整片一起亮'

  return `g = ${anisotropy.value.toFixed(2)}，底 ${scatterBase.value.toFixed(2)}`
})

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  addBeamAnchor(babylon, scene)

  const postProcess = createBeamPostProcess({
    babylon,
    scene,
    camera,
    maxStepCount: MAX_STEP_COUNT,
    measureSetting: () => ({
      strength: 0.75,
      stepCount: MAX_STEP_COUNT,
      anisotropy: anisotropy.value,
      scatterBase: scatterBase.value,
      phaseEnabled: phaseEnabled.value,
      averageEnabled: true,
      jitterEnabled: true,
      beamOnly: false,
    }),
  })

  return () => postProcess.dispose(camera)
}
</script>
