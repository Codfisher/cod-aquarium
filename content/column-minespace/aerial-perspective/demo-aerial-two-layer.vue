<template>
  <demo-frame
    :setup="setup"
    :camera-radius="70"
    :camera-alpha="-1.5708"
    :camera-beta="1.48"
    :camera-target="[0, 8, 60]"
    :height="300"
    title="把霧拆成兩層"
    caption="偏移量為零時與內建的單色霧完全相同。往上拉之後，中距離的山開始帶著天色，遠處仍然收在霧色裡，層次就出來了。拉過頭則整片山谷染成一塊藍。"
  >
    <demo-slider
      v-model="midStrength"
      label="中距離往天色偏"
      :min="0"
      :max="1"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createRidgeWorld, SKY_PRESET_LIST } from './aerial-scene'

const midStrength = ref(0.75)

function setup({ babylon, scene }: BabylonDemoContext) {
  const world = createRidgeWorld({ babylon, scene })

  const stop = watch(midStrength, (value) => {
    world.applyPreset(SKY_PRESET_LIST[1]!, value)
  }, { immediate: true })

  return () => stop()
}
</script>
