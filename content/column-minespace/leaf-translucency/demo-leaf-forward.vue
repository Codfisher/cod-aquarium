<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-alpha="-1.5708"
    :camera-beta="1.42"
    :camera-target="[0, 4.6, 0]"
    :clear-color="[0.86, 0.72, 0.5, 1]"
    title="次方決定透光集中在多窄的角度裡"
    caption="次方給得低，整團樹冠不管從哪個方向看都在發光，那已經是自發光了。給得太高則只剩太陽正後方那一點，走過去根本遇不上。"
  >
    <demo-slider
      v-model="forwardPower"
      label="次方"
      :min="0.5"
      :max="16"
      :step="0.1"
      :digit="1"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createLeafScene, createLeafTree, GREEN_LEAF } from './leaf-scene'

const forwardPower = ref(3.5)

function setup({ babylon, scene }: BabylonDemoContext) {
  createLeafScene({ babylon, scene })

  const tree = createLeafTree({
    babylon,
    scene,
    name: 'forward',
    leafColor: GREEN_LEAF,
  })

  /** 拉滑桿只是換一個 uniform，著色器不會重新編譯 */
  const stop = watch(
    forwardPower,
    (value) => tree.translucency.setForwardPower(value),
    { immediate: true },
  )

  return () => stop()
}
</script>
