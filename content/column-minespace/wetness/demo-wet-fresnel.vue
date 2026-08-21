<template>
  <demo-frame
    :setup="setupScene"
    title="Fresnel 把反光趕到掠射角"
    caption="bias 是「正對時還留多少」，power 是「往掠射角集中得多快」。bias 給高一點，低頭看到的地面也會蒙上一層天色，整片草地泛白；收到近乎零、power 拉高，反光就縮回它該在的地方，也就是斜看出去的那一段遠景。拖曳把鏡頭壓低，那一道白會自己浮出來。"
    :camera-alpha="-Math.PI / 2.35"
    :camera-beta="Math.PI / 2.35"
    :camera-radius="16"
    :camera-target="[0, 0.8, 0]"
    :height="300"
  >
    <demo-slider
      v-model="wetRatio"
      label="濕潤度"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-slider
      v-model="fresnelBias"
      label="Fresnel bias"
      :min="0"
      :max="0.6"
      :step="0.02"
    />
    <demo-slider
      v-model="fresnelPower"
      label="Fresnel power"
      :min="0.5"
      :max="8"
      :step="0.5"
      :digit="1"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { Wetness } from './wetness'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSkyReflectionTexture, measureSkyPalette, updateSkyReflectionTexture } from './sky-reflection'
import { createWetScene } from './wet-scene'
import { createWetness } from './wetness'

const wetRatio = shallowRef(1)
const fresnelBias = shallowRef(0.02)
const fresnelPower = shallowRef(4)

const wetness = shallowRef<Wetness>()

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const { materialList } = createWetScene(context)

  const reflectionTexture = createSkyReflectionTexture(babylon, scene)
  /** 這個範例的天色不變，畫一次就好 */
  updateSkyReflectionTexture(reflectionTexture, measureSkyPalette(0.5))

  wetness.value = createWetness(materialList, {
    babylon,
    reflectionTexture,
    getFresnel: () => ({
      bias: fresnelBias.value,
      power: fresnelPower.value,
    }),
  })
  wetness.value.setRatio(wetRatio.value)

  return () => {
    wetness.value = undefined
  }
}

watch(wetRatio, (value) => wetness.value?.setRatio(value))
watch([fresnelBias, fresnelPower], () => wetness.value?.refresh())
</script>
