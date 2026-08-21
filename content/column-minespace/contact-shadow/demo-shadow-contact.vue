<template>
  <demo-frame
    :setup="setup"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 3"
    :camera-radius="17"
    :camera-target="[0, 1.4, 0.5]"
    :height="300"
    title="PCF 與接觸硬化（PCSS）"
    caption="PCF 從頭到尾用同一個模糊寬度，柱腳與橫樑的影子一樣軟。接觸硬化會先找出擋在前面的是什麼、離得多遠，再依那段距離決定模糊多寬，於是柱子真的站在地上，橫樑那一段才化開。太陽大小就是「光源在陰影貼圖上佔多寬」。"
  >
    <demo-toggle
      v-model="isContactHardening"
      label="接觸硬化"
    />
    <demo-slider
      v-model="lightSize"
      label="太陽大小"
      :min="0.005"
      :max="0.3"
      :step="0.005"
      :digit="3"
    />
    <demo-toggle
      v-model="isHighQuality"
      label="高等取樣"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { ShadowGenerator } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createShadowProps, createShadowStage } from './shadow-stage'

const isContactHardening = ref(true)
/** 這個數字就是「太陽有多大」，天上的太陽只張開半度 */
const lightSize = ref(0.05)
const isHighQuality = ref(false)

const shadowGenerator = shallowRef<ShadowGenerator>()
const babylonModule = shallowRef<BabylonModule>()

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createShadowStage({ babylon, scene })

  stage.sun.position = new babylon.Vector3(-0.58, 0.66, 0.48).scale(30)
  stage.sun.autoUpdateExtends = false
  stage.sun.orthoLeft = -14
  stage.sun.orthoRight = 14
  stage.sun.orthoTop = 14
  stage.sun.orthoBottom = -14
  stage.sun.shadowMinZ = 1
  stage.sun.shadowMaxZ = 70

  const generator = new babylon.ShadowGenerator(1024, stage.sun)
  generator.darkness = 0.05
  generator.bias = 0.0005
  generator.normalBias = 0.08

  for (const mesh of createShadowProps({ babylon, scene, stage })) {
    generator.addShadowCaster(mesh)
  }

  shadowGenerator.value = generator
  babylonModule.value = babylon
  applySetting()

  return () => {
    shadowGenerator.value = undefined
    babylonModule.value = undefined
  }
}

function applySetting() {
  const generator = shadowGenerator.value
  const babylon = babylonModule.value
  if (!generator || !babylon)
    return

  generator.filteringQuality = isHighQuality.value
    ? babylon.ShadowGenerator.QUALITY_HIGH
    : babylon.ShadowGenerator.QUALITY_MEDIUM

  if (isContactHardening.value) {
    generator.usePercentageCloserFiltering = false
    generator.useContactHardeningShadow = true
    generator.contactHardeningLightSizeUVRatio = lightSize.value
    return
  }

  generator.useContactHardeningShadow = false
  generator.usePercentageCloserFiltering = true
}

watch([isContactHardening, lightSize, isHighQuality], applySetting)
</script>
