<template>
  <demo-frame
    :setup="setup"
    :camera-radius="92"
    :camera-alpha="-1.5708"
    :camera-beta="1.18"
    :camera-target="[0, 6, 55]"
    :height="320"
    title="太陽貼地時，貼地濁氣自動加濃"
    caption="太陽仰角低於 0.12 時貼地濃度給滿 1.15，爬過 0.55 之後收回基準值 0.6，中間用平滑曲線接起來，看不出一道分界。拖到低角度，山谷比山脊更快陷進濁氣；拖到接近正午，只剩最深的谷底還看得出來。"
  >
    <demo-slider
      v-model="sunHeight"
      label="太陽仰角"
      :min="0"
      :max="0.8"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { computeGroundHazeBoost, createRidgeWorld, SKY_PRESET_LIST } from './aerial-scene'

/** 從貼地水氣最明顯的低角度開始 */
const sunHeight = ref(0.1)

function setup({ babylon, scene }: BabylonDemoContext) {
  const world = createRidgeWorld({ babylon, scene, fogEnd: 190 })

  world.applyPreset(SKY_PRESET_LIST[0]!, 0.75)

  const stop = watch(sunHeight, (value) => {
    const normalizedSunHeight = world.setSunHeight(value)

    const boost = computeGroundHazeBoost(normalizedSunHeight)
    for (const aerial of world.aerialList) {
      /** 頂與倒數維持跟第五步的範例一樣，只有加濃倍率跟著仰角走 */
      aerial.setGroundHaze(10, 1 / 12, boost)
    }
  }, { immediate: true })

  return () => stop()
}
</script>
