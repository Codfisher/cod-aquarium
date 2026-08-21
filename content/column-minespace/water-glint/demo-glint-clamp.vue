<template>
  <demo-frame
    :setup="setup"
    :camera-radius="22"
    :camera-alpha="-1.5708"
    :camera-beta="1.16"
    :camera-target="[0, 0, 0]"
    :clear-color="[0.58, 0.72, 0.88, 1]"
    :height="280"
    title="高光是唯一能突破亮度上限的通道"
    caption="左邊那顆沒有高光，光再強也只能亮到貼圖本身的顏色，之後就停在那裡。右邊那顆的高光加在那道 clamp 外面，所以會一路亮下去。"
  >
    <demo-slider
      v-model="lightIntensity"
      label="陽光強度"
      :min="0.2"
      :max="4"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSpherePanel, createStudio, WATER_SPECULAR } from './glint-scene'

const lightIntensity = ref(1)

function setup({ babylon, scene }: BabylonDemoContext) {
  const studio = createStudio(babylon, scene)

  /** 兩顆球的貼圖一模一樣，差別只在有沒有高光 */
  createSpherePanel({
    babylon,
    scene,
    name: 'matte',
    offsetX: -3.4,
    color: [52, 108, 158],
    specular: 0,
  })
  createSpherePanel({
    babylon,
    scene,
    name: 'glossy',
    offsetX: 3.4,
    color: [52, 108, 158],
    specular: WATER_SPECULAR,
    specularPower: 96,
  })

  const stop = watch(lightIntensity, (value) => {
    studio.sun.intensity = value
  }, { immediate: true })

  return () => stop()
}
</script>
