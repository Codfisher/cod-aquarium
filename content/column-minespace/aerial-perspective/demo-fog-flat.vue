<template>
  <demo-frame
    :setup="setup"
    :camera-radius="70"
    :camera-alpha="-1.5708"
    :camera-beta="1.48"
    :camera-target="[0, 8, 60]"
    :height="300"
    title="內建的霧只有一個顏色"
    caption="霧的終點拉近，遠處的山會一路收到霧色為止。那個顏色比它背後的天空還淡，於是最遠的山脊看起來浮在天空前面，而現實裡天不可能比空氣本身更暗。"
  >
    <demo-slider
      v-model="fogEnd"
      label="霧的終點"
      :min="40"
      :max="260"
      :step="1"
      :digit="0"
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

const fogEnd = ref(150)

function setup({ babylon, scene }: BabylonDemoContext) {
  const world = createRidgeWorld({ babylon, scene })

  /** 中距離的偏移量給零，這就是 Babylon 原本那一行 mix(vFogColor, color, fog) */
  world.applyPreset(SKY_PRESET_LIST[1]!, 0)

  const stop = watch(fogEnd, (value) => {
    scene.fogEnd = value
  }, { immediate: true })

  return () => stop()
}
</script>
