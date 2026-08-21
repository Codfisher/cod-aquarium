<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-alpha="-1.5708"
    :camera-beta="1.42"
    :camera-target="[0, 4.6, 0]"
    :clear-color="[0.86, 0.72, 0.5, 1]"
    title="太陽在樹的正後方"
    caption="關掉透光的時候，逆光的樹冠只吃得到一點天光，整團是暗的。打開之後，那道光穿過葉子從另一面透出來。"
  >
    <demo-toggle
      v-model="translucencyEnabled"
      label="葉片透光"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createLeafScene, createLeafTree, GREEN_LEAF } from './leaf-scene'

const translucencyEnabled = ref(true)

function setup({ babylon, scene }: BabylonDemoContext) {
  createLeafScene({ babylon, scene })

  const tree = createLeafTree({
    babylon,
    scene,
    name: 'backlit',
    leafColor: GREEN_LEAF,
  })

  /**
   * 透光量歸零就等於這個效果不存在
   *
   * 專案裡是靠 _enable 把整段程式碼從著色器裡拿掉，
   * 範例要即時比較，所以留著程式碼、把量調成零
   */
  const stop = watch(
    translucencyEnabled,
    (enabled) => tree.translucency.setAmount(enabled ? 0.8 : 0),
    { immediate: true },
  )

  return () => stop()
}
</script>
