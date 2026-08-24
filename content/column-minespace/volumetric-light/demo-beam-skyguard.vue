<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="保護整份跟著亮度走，只有天頂看得出差別"
    caption="把底拉到零，天空的保護整份交給亮度決定，貼著太陽跟壓在地平線上的天空亮度早就頂到滿檔，兩種底值疊出來的顏色幾乎一樣。只有離太陽夠遠、接近天頂那片天色還沒頂滿，才看得出零讓天空多染一層暖色；往右拉，那層暖色收乾淨，貼著太陽跟地平線的地方仍然沒感覺。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="2.27"
    :camera-radius="16"
    :camera-target="[0, 12.8, 2]"
    :height="320"
  >
    <demo-slider
      v-model="skyGuardBase"
      label="天空保護的底"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { addBeamAnchor, createBeamPostProcess } from './beam-scene'

const MAX_STEP_COUNT = 32

/** 與亮部保護那一支用同一顆太陽，光暈位置才對得上 */
const SUN_DIRECTION = [0.251, -0.351, -0.902] as const

const skyGuardBase = shallowRef(0)

const badge = computed(() => {
  if (skyGuardBase.value < 0.05)
    return '底 0.00，整份跟著亮度走'

  return `底 ${skyGuardBase.value.toFixed(2)}`
})

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  addBeamAnchor(babylon, scene)

  const postProcess = createBeamPostProcess({
    babylon,
    scene,
    camera,
    maxStepCount: MAX_STEP_COUNT,
    measureSetting: () => ({
      strength: 1,
      stepCount: MAX_STEP_COUNT,
      anisotropy: 0.45,
      scatterBase: 0.18,
      phaseEnabled: true,
      averageEnabled: true,
      jitterEnabled: true,
      beamOnly: false,
      skyGuardBase: skyGuardBase.value,
      sunDirection: SUN_DIRECTION,
    }),
  })

  return () => postProcess.dispose(camera)
}
</script>
