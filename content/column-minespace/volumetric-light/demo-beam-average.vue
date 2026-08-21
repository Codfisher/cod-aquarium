<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="取沿路平均，不要取積分"
    caption="樹冠底下相鄰兩個像素的行進距離可能差上好幾倍，一個撞到葉片、一個從縫裡穿到很遠的地方去。跟著距離走的話那道落差會整條印在縫上；取平均之後前半段的取樣是共用的，平均值幾乎連續，落差自然就沒了。打開「只畫加上去的光」看得最清楚。"
    :camera-alpha="-Math.PI / 2.25"
    :camera-beta="Math.PI / 2.6"
    :camera-radius="17"
    :camera-target="[0, 5.5, 3]"
    :height="320"
  >
    <demo-toggle
      v-model="averageEnabled"
      label="取沿路平均"
    />
    <demo-toggle
      v-model="beamOnly"
      label="只畫加上去的光"
    />
    <demo-slider
      v-model="strength"
      label="光束強度"
      :min="0"
      :max="1.4"
      :step="0.05"
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

const averageEnabled = shallowRef(true)
const beamOnly = shallowRef(true)
const strength = shallowRef(0.75)

const badge = computed(() => (averageEnabled.value ? '沿路平均' : '跟著距離走'))

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  addBeamAnchor(babylon, scene)

  const postProcess = createBeamPostProcess({
    babylon,
    scene,
    camera,
    maxStepCount: MAX_STEP_COUNT,
    measureSetting: () => ({
      strength: strength.value,
      stepCount: MAX_STEP_COUNT,
      anisotropy: 0.45,
      scatterBase: 0.18,
      phaseEnabled: true,
      averageEnabled: averageEnabled.value,
      jitterEnabled: true,
      beamOnly: beamOnly.value,
    }),
  })

  return () => postProcess.dispose(camera)
}
</script>
