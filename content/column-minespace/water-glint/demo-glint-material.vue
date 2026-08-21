<template>
  <demo-frame
    :setup="setup"
    :camera-radius="26"
    :camera-alpha="-1.5708"
    :camera-beta="1.16"
    :camera-target="[0, 0, 0]"
    :clear-color="[0.58, 0.72, 0.88, 1]"
    :height="280"
    title="光源端給滿，材質決定要反射多少"
    caption="三顆球從左到右分別是乾方塊的 0.02、淋濕表面的 0.42 與水面的 0.8。把光源端的高光收掉，三顆一起失去那道光，包括本來該是鏡子的那一顆。"
  >
    <demo-slider
      v-model="lightSpecular"
      label="光源端高光"
      :min="0"
      :max="1"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import {
  createSpherePanel,
  createStudio,
  DRY_SPECULAR,
  WATER_SPECULAR,
  WET_SPECULAR,
} from './glint-scene'

const lightSpecular = ref(1)

function setup({ babylon, scene }: BabylonDemoContext) {
  const studio = createStudio(babylon, scene)

  const recipeList = [
    { name: 'dry', specular: DRY_SPECULAR, color: [138, 130, 118] },
    { name: 'wet', specular: WET_SPECULAR, color: [104, 82, 58] },
    { name: 'water', specular: WATER_SPECULAR, color: [52, 108, 158] },
  ] as const

  for (const [index, recipe] of recipeList.entries()) {
    createSpherePanel({
      babylon,
      scene,
      name: recipe.name,
      offsetX: (index - 1) * 6,
      color: recipe.color,
      specular: recipe.specular,
      specularPower: 96,
    })
  }

  /**
   * 光源這一端只有一個值
   *
   * 它會乘上每一份材質的 specularColor，所以在這裡收掉
   * 等於整個場景一起沒有高光
   */
  const stop = watch(lightSpecular, (value) => {
    studio.sun.specular.set(value, value, value)
  }, { immediate: true })

  return () => stop()
}
</script>
