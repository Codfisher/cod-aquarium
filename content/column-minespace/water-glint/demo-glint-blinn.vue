<template>
  <demo-frame
    :setup="setup"
    :camera-radius="24"
    :camera-alpha="-1.5708"
    :camera-beta="1.08"
    :camera-target="[0, 0, 0]"
    :clear-color="[0.58, 0.72, 0.88, 1]"
    :height="300"
    title="specularPower 決定高光收得多緊"
    caption="指數給得低，那道反光散成一整片霧面；給高才收得緊。散開的高光看起來是磨砂玻璃，水面要的是又小又亮的一點。"
  >
    <demo-toggle
      v-model="specularEnabled"
      label="高光"
    />
    <demo-slider
      v-model="specularPower"
      label="specularPower"
      :min="2"
      :max="256"
      :step="1"
      :digit="0"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createWaterStage, WATER_SPECULAR } from './glint-scene'

const specularEnabled = ref(true)
const specularPower = ref(160)

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createWaterStage(babylon, scene)

  const stop = watch([specularEnabled, specularPower], ([enabled, power]) => {
    const strength = enabled ? WATER_SPECULAR : 0
    /** 藍綠通道略高一點，反出來的那道光帶著一點水色 */
    stage.waterMaterial.specularColor.set(strength, strength * 1.025, strength * 1.06)
    stage.waterMaterial.specularPower = power
  }, { immediate: true })

  return () => {
    stop()
    stage.dispose()
  }
}
</script>
