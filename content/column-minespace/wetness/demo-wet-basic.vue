<template>
  <demo-frame
    :setup="setupScene"
    title="壓暗與提亮要一起做"
    caption="只壓暗會變成髒，只加高光會變成上了一層蠟，兩件事同時做才是濕的。木頭原本的高光是零，而它照樣濕得起來，因為高光是往同一個目標值收，不是照原值放大。"
    :camera-alpha="-Math.PI / 2.35"
    :camera-beta="Math.PI / 2.6"
    :camera-radius="15"
    :camera-target="[0, 1.2, 0]"
    :height="300"
  >
    <demo-slider
      v-model="wetRatio"
      label="濕潤度"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-toggle
      v-model="diffuseEnabled"
      label="漫射壓暗"
    />
    <demo-toggle
      v-model="specularEnabled"
      label="高光提亮"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { Wetness } from './wetness'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createWetScene } from './wet-scene'
import { createWetness } from './wetness'

const wetRatio = shallowRef(0)
const diffuseEnabled = shallowRef(true)
const specularEnabled = shallowRef(true)

const wetness = shallowRef<Wetness>()

function setupScene(context: BabylonDemoContext) {
  const { babylon } = context
  const { materialList } = createWetScene(context)

  wetness.value = createWetness(materialList, {
    babylon,
    isDiffuseEnabled: () => diffuseEnabled.value,
    isSpecularEnabled: () => specularEnabled.value,
  })
  wetness.value.setRatio(wetRatio.value)

  return () => {
    wetness.value = undefined
  }
}

watch(wetRatio, (value) => wetness.value?.setRatio(value))
watch([diffuseEnabled, specularEnabled], () => wetness.value?.refresh())
</script>
