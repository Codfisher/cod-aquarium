<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-alpha="-1.5708"
    :camera-beta="1.42"
    :camera-target="[0, 4.6, 0]"
    :clear-color="[0.86, 0.72, 0.5, 1]"
    title="出射方向往法線的反面偏一點"
    caption="偏移量為零時，亮的只有視線與光線幾乎重合的那一小塊。往法線的反面扳開之後，亮區從一條線化開成一片。"
  >
    <demo-slider
      v-model="normalDistortion"
      label="偏移量"
      :min="0"
      :max="1"
      :step="0.01"
    />
    <demo-toggle
      v-model="rotating"
      label="自動繞圈"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createLeafScene, createLeafTree, GREEN_LEAF } from './leaf-scene'

const normalDistortion = ref(0)
const rotating = ref(true)

function setup({ babylon, scene, camera }: BabylonDemoContext) {
  createLeafScene({ babylon, scene })

  const tree = createLeafTree({
    babylon,
    scene,
    name: 'distortion',
    leafColor: GREEN_LEAF,
  })

  const stop = watch(
    normalDistortion,
    (value) => tree.translucency.setNormalDistortion(value),
    { immediate: true },
  )

  /**
   * 鏡頭慢慢繞過太陽的正後方
   *
   * 這個效果的重點在於「走過去的時候亮多久」，
   * 停在原地是看不出偏移量差在哪裡的
   */
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!rotating.value)
      return

    camera.alpha += scene.getEngine().getDeltaTime() / 1000 * 0.35
  })

  return () => {
    stop()
    scene.onBeforeRenderObservable.remove(observer)
  }
}
</script>
