<template>
  <demo-frame
    :setup="setup"
    :camera-radius="22"
    :camera-alpha="-1.5708"
    :camera-beta="1.42"
    :camera-target="[0, 4.6, 0]"
    :clear-color="[0.86, 0.72, 0.5, 1]"
    :height="300"
    title="透出來的光帶著葉子自己的顏色"
    caption="關掉之後兩棵樹透出來的是同一道白光，楓樹在逆光裡變回綠樹的鄰居。乘上 baseColor 之後，綠葉透綠、楓葉透橘，不必為每一種葉子各調一組顏色。"
  >
    <demo-toggle
      v-model="tintEnabled"
      label="乘上葉色"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createLeafScene, createLeafTree, GREEN_LEAF, MAPLE_LEAF } from './leaf-scene'

const tintEnabled = ref(true)

function setup({ babylon, scene }: BabylonDemoContext) {
  createLeafScene({ babylon, scene })

  const treeList = [
    createLeafTree({
      babylon,
      scene,
      name: 'green',
      leafColor: GREEN_LEAF,
      offsetX: -6,
    }),
    createLeafTree({
      babylon,
      scene,
      name: 'maple',
      leafColor: MAPLE_LEAF,
      offsetX: 6,
    }),
  ]

  const stop = watch(tintEnabled, (enabled) => {
    for (const tree of treeList) {
      tree.translucency.setTintRatio(enabled ? 1 : 0)
    }
  }, { immediate: true })

  return () => stop()
}
</script>
