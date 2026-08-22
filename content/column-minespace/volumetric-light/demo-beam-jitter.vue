<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="起點抖動之前，取樣點排成一層一層等距的殼"
    caption="把步數壓到最低、關掉抖動，畫面上會浮出一圈一圈的同心紋，那是所有像素從同一個位置起步造成的。打開抖動，同樣的步數換成看不出來的雜訊。切到「只看加上去的光」最清楚。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.2"
    :camera-radius="22"
    :camera-target="[0, 3.5, 2]"
    :height="320"
  >
    <demo-toggle
      v-model="jitterEnabled"
      label="起點抖動"
    />
    <demo-toggle
      v-model="beamOnly"
      label="只看加上去的光"
    />
    <demo-slider
      v-model="stepCount"
      label="步數"
      :min="4"
      :max="32"
      :step="1"
      :digit="0"
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

const jitterEnabled = shallowRef(false)
const beamOnly = shallowRef(true)
const stepCount = shallowRef(8)

const badge = computed(() =>
  jitterEnabled.value
    ? `${stepCount.value} 步，抖過`
    : `${stepCount.value} 步，沒抖`)

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  addBeamAnchor(babylon, scene)

  const postProcess = createBeamPostProcess({
    babylon,
    scene,
    camera,
    maxStepCount: MAX_STEP_COUNT,
    measureSetting: () => ({
      strength: 0.9,
      stepCount: stepCount.value,
      anisotropy: 0.45,
      scatterBase: 0.18,
      phaseEnabled: true,
      averageEnabled: true,
      jitterEnabled: jitterEnabled.value,
      beamOnly: beamOnly.value,
    }),
  })

  return () => postProcess.dispose(camera)
}
</script>
