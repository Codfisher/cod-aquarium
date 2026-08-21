<template>
  <demo-frame
    :setup="setupScene"
    title="雨停之後慢慢乾"
    caption="濕潤度那條滑桿會自己走。開始下雨時很快淋濕，雨停之後拉長好幾倍的時間慢慢乾，走出聽雨亭的那一步世界才不會在一瞬間乾透。滑桿也可以自己抓，放開之後它會繼續往目標走。"
    :camera-alpha="-Math.PI / 2.35"
    :camera-beta="Math.PI / 2.55"
    :camera-radius="15"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isRaining"
      label="下雨"
    />
    <demo-slider
      v-model="wetRatio"
      label="濕潤度"
      :min="0"
      :max="1"
      :step="0.01"
    />
    <demo-slider
      v-model="drySecond"
      label="乾燥時間"
      :min="2"
      :max="40"
      :step="1"
      :digit="0"
      unit=" 秒"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { Wetness } from './wetness'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSkyReflectionTexture, measureSkyPalette, updateSkyReflectionTexture } from './sky-reflection'
import { createWetScene } from './wet-scene'
import { createWetness } from './wetness'

const isRaining = shallowRef(false)
const wetRatio = shallowRef(0)
const drySecond = shallowRef(14)

/** 淋濕比乾快得多，一場雨幾秒就把地面打濕 */
const SOAK_SECOND = 3

const wetness = shallowRef<Wetness>()

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const { materialList } = createWetScene(context)

  const reflectionTexture = createSkyReflectionTexture(babylon, scene)
  updateSkyReflectionTexture(reflectionTexture, measureSkyPalette(0.42))

  const currentWetness = createWetness(materialList, { babylon, reflectionTexture })
  wetness.value = currentWetness

  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = scene.getEngine().getDeltaTime() / 1000
    const target = isRaining.value ? 1 : 0
    const speed = 1 / (isRaining.value ? SOAK_SECOND : drySecond.value)
    const step = speed * deltaSecond

    if (Math.abs(target - wetRatio.value) > step) {
      wetRatio.value += Math.sign(target - wetRatio.value) * step
    }
    else {
      wetRatio.value = target
    }

    currentWetness.setRatio(wetRatio.value)
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    wetness.value = undefined
  }
}

watch(wetRatio, (value) => wetness.value?.setRatio(value))
</script>
