<template>
  <demo-frame
    :setup="setupScene"
    title="白沫量化成幾階"
    caption="階數給零就是原本連續的漸層，那會是全場唯一一個沒有階梯的東西。切成三四階之後，白沫是一階一階退開的，與貼圖上的像素同一個節奏。階數再往上加就慢慢退回漸層。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 3.4"
    :camera-radius="17"
    :camera-target="[0, 0, 0]"
    :height="300"
  >
    <demo-slider
      v-model="stepCount"
      label="量化階數"
      :min="0"
      :max="12"
      :step="1"
      :digit="0"
      unit=" 階"
    />
    <demo-slider
      v-model="lineWidth"
      label="亮線寬度"
      :min="0.05"
      :max="1.2"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BaseTexture } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { ShorelineState } from './shoreline-plugin'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSceneDepth, createShoreScene } from './shore-scene'
import { createShorelinePluginClass } from './shoreline-plugin'

const stepCount = shallowRef(4)
const lineWidth = shallowRef(0.5)

const state: ShorelineState = {
  width: lineWidth.value,
  glowWidth: 0.8,
  strength: 0.85,
  stepCount: stepCount.value,
}

function setupScene(context: BabylonDemoContext) {
  const { babylon } = context

  const { waterMaterial } = createShoreScene(context)
  let depthTexture: BaseTexture | null = createSceneDepth(context).getDepthMap()

  const PluginClass = createShorelinePluginClass({
    babylon,
    state,
    getDepthTexture: () => depthTexture,
  })
  // eslint-disable-next-line no-new
  new PluginClass(waterMaterial)

  return () => {
    depthTexture = null
  }
}

watch([stepCount, lineWidth], () => {
  state.stepCount = stepCount.value
  state.width = lineWidth.value
})
</script>
