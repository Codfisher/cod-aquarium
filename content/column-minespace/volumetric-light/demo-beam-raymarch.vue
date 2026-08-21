<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="沿著視線一步一步問"
    caption="從鏡頭往每一個像素射一條線，沿路每一步問「這一點的空氣曬得到太陽嗎」，曬得到就累加一點亮度。步數少的時候取樣點會在空間裡排成一層一層等距的殼，關掉抖動就看得到那些同心紋。拖曳可以繞著鳥居走一圈。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.2"
    :camera-radius="22"
    :camera-target="[0, 3.5, 2]"
    :height="320"
  >
    <demo-slider
      v-model="stepCount"
      label="行進步數"
      :min="2"
      :max="48"
      :step="1"
      :digit="0"
      unit=" 步"
    />
    <demo-toggle
      v-model="jitterEnabled"
      label="起點抖動"
    />
    <demo-toggle
      v-model="beamOnly"
      label="只畫加上去的光"
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

/** 迴圈的上限是編譯期常數，滑桿只能在這個數字以內動 */
const MAX_STEP_COUNT = 48

const stepCount = shallowRef(24)
const jitterEnabled = shallowRef(true)
const beamOnly = shallowRef(false)

const badge = computed(() => `每個像素查 ${stepCount.value} 次遮蔽`)

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  addBeamAnchor(babylon, scene)

  const postProcess = createBeamPostProcess({
    babylon,
    scene,
    camera,
    maxStepCount: MAX_STEP_COUNT,
    measureSetting: () => ({
      strength: 0.75,
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
