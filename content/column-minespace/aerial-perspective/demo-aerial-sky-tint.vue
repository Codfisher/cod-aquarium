<template>
  <demo-frame
    :setup="setup"
    :camera-radius="70"
    :camera-alpha="-1.5708"
    :camera-beta="1.48"
    :camera-target="[0, 8, 60]"
    :height="300"
    :title="`中距離的空氣色跟著天色走（${presetName}）`"
    caption="中空的天色日夜循環本來就算好了，直接拿來用就行。中午是藍、清晨是丁香紫、黃昏是橘，這一層完全不必另外調色。"
  >
    <demo-slider
      v-model="timeOfDay"
      label="時刻"
      :min="0"
      :max="2"
      :step="0.01"
    />
    <demo-toggle
      v-model="twoLayerEnabled"
      label="兩層空氣"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createRidgeWorld, mixPreset } from './aerial-scene'

const timeOfDay = ref(1)
const twoLayerEnabled = ref(true)

const presetName = computed(() => mixPreset(timeOfDay.value).name)

function setup({ babylon, scene }: BabylonDemoContext) {
  const world = createRidgeWorld({ babylon, scene })

  const stop = watch([timeOfDay, twoLayerEnabled], ([time, enabled]) => {
    world.applyPreset(mixPreset(time), enabled ? 0.75 : 0)
  }, { immediate: true })

  return () => stop()
}
</script>
