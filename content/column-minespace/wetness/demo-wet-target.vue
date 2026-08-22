<template>
  <demo-frame
    :setup="setupScene"
    title="目標值決定濕多深、多亮"
    caption="這裡固定顯示濕透（wetRatio = 1）的樣子，方便直接比較目標值本身。漫射比例調低，濕地整片壓得更黑；高光值調高，那道反光更刺眼，因為它加在漫射的 clamp 之外，能真的超過純白；高光範圍收到個位數，亮點會攤成一整片，調到八十附近則縮成一個很小的亮點。"
    :camera-alpha="-Math.PI / 4"
    :camera-beta="Math.PI / 2.6"
    :camera-radius="15"
    :camera-target="[0, 1.2, 0]"
    :height="300"
  >
    <demo-slider
      v-model="diffuseRatio"
      label="漫射比例"
      :min="0.2"
      :max="1"
      :step="0.02"
    />
    <demo-slider
      v-model="specular"
      label="高光值"
      :min="0"
      :max="1"
      :step="0.02"
    />
    <demo-slider
      v-model="specularPower"
      label="高光範圍"
      :min="4"
      :max="80"
      :step="4"
      :digit="0"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { Wetness } from './wetness'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createWetScene } from './wet-scene'
import { createWetness } from './wetness'

const diffuseRatio = shallowRef(0.68)
const specular = shallowRef(0.42)
const specularPower = shallowRef(20)

const wetness = shallowRef<Wetness>()

function setupScene(context: BabylonDemoContext) {
  const { babylon } = context
  const { materialList } = createWetScene(context)

  wetness.value = createWetness(materialList, {
    babylon,
    getWetTarget: () => ({
      diffuseRatio: diffuseRatio.value,
      specular: specular.value,
      specularPower: specularPower.value,
    }),
  })
  /** 固定全濕，目標值改了立刻看得出差別 */
  wetness.value.setRatio(1)

  return () => {
    wetness.value = undefined
  }
}

watch([diffuseRatio, specular, specularPower], () => wetness.value?.refresh())
</script>
