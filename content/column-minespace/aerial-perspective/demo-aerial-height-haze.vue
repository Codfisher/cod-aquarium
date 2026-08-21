<template>
  <demo-frame
    :setup="setup"
    :camera-radius="92"
    :camera-alpha="-1.5708"
    :camera-beta="1.18"
    :camera-target="[0, 6, 55]"
    :height="320"
    title="濁氣積在低處"
    caption="濃度走的是乘法，所以腳邊的方塊完全不受影響，只有本來就有點遠的東西會再糊一點。往上拉之後，山谷比山脊先糊掉。"
  >
    <demo-slider
      v-model="groundBoost"
      label="貼地濃度"
      :min="0"
      :max="1.6"
      :step="0.01"
    />
    <demo-slider
      v-model="hazeTop"
      label="濁氣的頂"
      :min="0"
      :max="24"
      :step="0.5"
      :digit="1"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createRidgeWorld, SKY_PRESET_LIST } from './aerial-scene'

const groundBoost = ref(1.15)
const hazeTop = ref(10)

function setup({ babylon, scene }: BabylonDemoContext) {
  const world = createRidgeWorld({ babylon, scene, fogEnd: 190 })

  /** 晨昏是貼地水氣最看得出來的時段 */
  world.applyPreset(SKY_PRESET_LIST[0]!, 0.75)

  const stop = watch([groundBoost, hazeTop], ([boost, top]) => {
    for (const aerial of world.aerialList) {
      /** 倒數是「幾格內從沒有變成滿」，給十二格才不會出現一條水平的界線 */
      aerial.setGroundHaze(top, 1 / 12, boost)
    }
  }, { immediate: true })

  return () => stop()
}
</script>
