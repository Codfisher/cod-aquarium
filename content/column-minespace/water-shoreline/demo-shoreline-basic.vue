<template>
  <demo-frame
    :setup="setupScene"
    title="拿深度差畫出岸線"
    caption="水面片元與它背後那塊沙地的距離就是「這裡有多淺」，近的地方畫白沫。石頭與水的交界也自己浮出一圈，而這件事完全不必知道那裡站著什麼東西。拖曳把鏡頭放到接近水平，同一片淺灘的白沫會整片拉長，因為那個距離是沿著視線量的。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="19"
    :camera-target="[0, 0, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="shorelineVisible"
      label="岸線"
    />
    <demo-slider
      v-model="lineWidth"
      label="亮線寬度"
      :min="0.05"
      :max="1.2"
      :step="0.05"
    />
    <demo-slider
      v-model="glowWidth"
      label="外圈的暈"
      :min="0.1"
      :max="2.5"
      :step="0.1"
      :digit="1"
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
import DemoToggle from '../demo/demo-toggle.vue'
import { createSceneDepth, createShoreScene } from './shore-scene'
import { createShorelinePluginClass } from './shoreline-plugin'

const shorelineVisible = shallowRef(true)
const lineWidth = shallowRef(0.34)
const glowWidth = shallowRef(0.8)

/** 岸線最亮到什麼程度 */
const SHORELINE_STRENGTH = 0.85

/** 材質綁定時來讀這一份，這個範例不量化 */
const state: ShorelineState = {
  width: lineWidth.value,
  glowWidth: glowWidth.value,
  strength: SHORELINE_STRENGTH,
  stepCount: 0,
}

function setupScene(context: BabylonDemoContext) {
  const { babylon } = context

  const { waterMaterial } = createShoreScene(context)

  let depthTexture: BaseTexture | null = createSceneDepth(context)

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

watch([shorelineVisible, lineWidth, glowWidth], () => {
  state.width = lineWidth.value
  state.glowWidth = glowWidth.value
  state.strength = shorelineVisible.value ? SHORELINE_STRENGTH : 0
})
</script>
