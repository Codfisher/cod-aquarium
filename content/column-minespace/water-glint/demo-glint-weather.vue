<template>
  <demo-frame
    :setup="setup"
    :camera-radius="24"
    :camera-alpha="-1.5708"
    :camera-beta="1.05"
    :camera-target="[0, 0, 0]"
    :clear-color="[0.58, 0.72, 0.88, 1]"
    :height="320"
    title="陰天要把高光單獨收掉"
    caption="雲層把太陽打散之後，天空整片還是亮的，漫射只變柔。高光需要一個又小又亮的點，那是最先被抹掉的東西，所以它要跟漫射分開收。"
  >
    <demo-slider
      v-model="cloudRatio"
      label="雲量"
      :min="0"
      :max="1"
      :step="0.01"
    />
    <demo-toggle
      v-model="specularSeparated"
      label="高光另外收"
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

const cloudRatio = ref(0)
const specularSeparated = ref(true)

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createWaterStage(babylon, scene)
  stage.glint.setStrength(1.2)
  stage.glint.setScale(1.4)
  stage.glint.setTexelScale(16)

  const stop = watch([cloudRatio, specularSeparated], ([ratio, separated]) => {
    /**
     * 雲層把陽光打散
     *
     * 直射光收掉一截，天光反而更均勻，這是陰天該有的樣子。
     * 只改 intensity 的話，高光會跟著漫射一起等比縮小
     */
    stage.sun.intensity = 1.1 * (1 - ratio * 0.45)
    stage.ambient.intensity = 0.42 + ratio * 0.32

    /** specularRatio 量的是「天上還有沒有一顆又小又亮的太陽」 */
    const specularRatio = separated ? (1 - ratio) ** 2.2 : 1
    stage.sun.specular.set(specularRatio, specularRatio, specularRatio)
  }, { immediate: true })

  return () => {
    stop()
    stage.dispose()
  }
}
</script>
