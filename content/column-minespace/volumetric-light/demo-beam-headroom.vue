<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="關掉亮部保護，天空與亮面一起頂到天花板"
    caption="望向太陽的視線幾乎整條都是曬得到太陽的空氣，累積值頂到滿檔。而天色本身早就很亮了，再疊上去只會衝破上限，層次整個壓平。打開保護之後，天空只剩 2.5%~3.1%，光束留在該待的地方。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.2"
    :camera-radius="22"
    :camera-target="[0, 3.5, 2]"
    :height="320"
  >
    <demo-toggle
      v-model="headroomEnabled"
      label="亮部保護"
    />
    <demo-slider
      v-model="strength"
      label="光束強度"
      :min="0.2"
      :max="1.6"
      :step="0.05"
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

/** 太陽擺在畫面正中偏上，一進來就看得到天空爆掉 */
const SUN_DIRECTION = [0.251, -0.351, -0.902] as const

const headroomEnabled = shallowRef(false)
const strength = shallowRef(0.9)

const badge = computed(() =>
  headroomEnabled.value ? '保護開著' : '保護關掉，天空爆了')

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
      averageEnabled: true,
      jitterEnabled: true,
      beamOnly: false,
      headroomEnabled: headroomEnabled.value,
      sunDirection: SUN_DIRECTION,
    }),
  })

  return () => postProcess.dispose(camera)
}
</script>
