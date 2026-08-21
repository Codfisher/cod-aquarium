<template>
  <demo-frame
    :setup="setup"
    :camera-radius="24"
    :camera-alpha="-1.5708"
    :camera-beta="1.05"
    :camera-target="[0, 0, 0]"
    :clear-color="[0.58, 0.72, 0.88, 1]"
    :height="320"
    title="法線一歪，高光自己就碎了"
    caption="擾動為零時整池水是一個光學上的平面，太陽只反得出一個點。把法線推歪之後，同一道光碎成一整片會閃的亮片，而這裡沒有畫上任何一個白點。"
  >
    <demo-slider
      v-model="strength"
      label="法線擾動"
      :min="0"
      :max="3"
      :step="0.01"
    />
    <demo-slider
      v-model="scale"
      label="波紋密度"
      :min="0.2"
      :max="4"
      :step="0.05"
    />
    <demo-toggle
      v-model="texelAligned"
      label="對齊像素格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createWaterStage } from './glint-scene'

const strength = ref(1.2)
const scale = ref(1.4)
const texelAligned = ref(true)

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createWaterStage(babylon, scene)

  const stop = watch([strength, scale, texelAligned], ([value, density, aligned]) => {
    stage.glint.setStrength(value)
    stage.glint.setScale(density)
    /** 一格方塊上有十六個貼圖像素，紋路的最小單位就是它的倒數 */
    stage.glint.setTexelScale(aligned ? 16 : 0)
  }, { immediate: true })

  return () => {
    stop()
    stage.dispose()
  }
}
</script>
