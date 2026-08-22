<template>
  <demo-frame
    :setup="setup"
    :camera-radius="13"
    :camera-beta="1.5708"
    :camera-alpha="-1.5708"
    :interactive="false"
    :clear-color="[0.04, 0.05, 0.1, 1]"
    title="星點數量與亮星比例，拖拖看"
    caption="星點數量從一百拉到一千，疏密差了十倍。亮星比例歸零，整片只剩暗淡的小點；拉到四成，兩格寬、幾乎滿格亮的那批星占掉大半，天空反而顯得雜亂。專案裡實際用的是四百六十顆、一成亮星。"
  >
    <demo-slider
      v-model="starCount"
      label="星點數量"
      :min="100"
      :max="1000"
      :step="20"
      :digit="0"
    />
    <demo-slider
      v-model="brightRatio"
      label="亮星比例"
      :min="0"
      :max="0.4"
      :step="0.02"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSkyBodyMaterial, createStarTexture } from './sky-texture'

const starCount = ref(460)
const brightRatio = ref(0.1)

const starMaterial = shallowRef<StandardMaterial>()
const starScene = shallowRef<Scene>()
const babylonModule = shallowRef<BabylonModule>()

/** 參數一換，貼圖要重畫一張，舊的那張收掉，不然拖一次滑桿就多留一張貼圖 */
let currentStarTexture: DynamicTexture | undefined

function applyField() {
  const material = starMaterial.value
  const scene = starScene.value
  const babylon = babylonModule.value
  if (!material || !scene || !babylon)
    return

  const texture = createStarTexture(babylon, scene, `star-field-${Date.now()}`, {
    starCount: starCount.value,
    brightRatio: brightRatio.value,
  })

  material.diffuseTexture = texture
  currentStarTexture?.dispose()
  currentStarTexture = texture
}

function setup({ babylon, scene }: BabylonDemoContext) {
  const texture = createStarTexture(babylon, scene, 'star-field', {
    starCount: starCount.value,
    brightRatio: brightRatio.value,
  })
  const material = createSkyBodyMaterial(babylon, scene, 'star-field-material', texture)

  const plane = babylon.MeshBuilder.CreatePlane('star-field', { size: 10 }, scene)
  plane.material = material
  plane.isPickable = false

  currentStarTexture = texture
  starMaterial.value = material
  starScene.value = scene
  babylonModule.value = babylon

  return () => {
    starMaterial.value = undefined
    starScene.value = undefined
    babylonModule.value = undefined
    currentStarTexture = undefined
  }
}

watch([starCount, brightRatio], applyField)
</script>
