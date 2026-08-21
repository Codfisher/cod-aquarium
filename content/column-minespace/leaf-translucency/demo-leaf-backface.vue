<template>
  <demo-frame
    :setup="setup"
    :camera-radius="17"
    :camera-alpha="-0.75"
    :camera-beta="1.32"
    :camera-target="[0, 4.6, 0]"
    :clear-color="[0.86, 0.72, 0.5, 1]"
    title="透光只加在背光面"
    caption="關掉這道限制之後，正對太陽那一面也跟著加了一次。那一面已經被直射光照亮了，等於同一道光算了兩遍，樹冠的向光側整片過曝。"
  >
    <demo-toggle
      v-model="backFacingOnly"
      label="只加在背光面"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createLeafScene, createLeafTree, GREEN_LEAF } from './leaf-scene'

const backFacingOnly = ref(true)

function setup({ babylon, scene }: BabylonDemoContext) {
  createLeafScene({ babylon, scene })

  const tree = createLeafTree({
    babylon,
    scene,
    name: 'backface',
    leafColor: GREEN_LEAF,
  })

  /** 透光量調高一點，兩面都加的時候才看得出過曝 */
  tree.translucency.setAmount(1.1)

  const stop = watch(
    backFacingOnly,
    (enabled) => tree.translucency.setBackFacingRatio(enabled ? 1 : 0),
    { immediate: true },
  )

  return () => stop()
}
</script>
