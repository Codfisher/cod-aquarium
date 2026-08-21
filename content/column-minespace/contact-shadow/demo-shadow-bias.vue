<template>
  <demo-frame
    :setup="setup"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="19"
    :camera-target="[0, 1.6, -1]"
    :height="300"
    title="bias、normalBias 與投影範圍"
    caption="bias 歸零，矮牆與地面會浮出自我遮蔽的條紋；拉太大，貼地的小石頭連影子都不見了。normalBias 沿著法線把投影者推進去，對付平面特別有效。投影範圍越大，同一張貼圖要分給越多格地，影子的邊緣就越粗。"
  >
    <demo-slider
      v-model="bias"
      label="bias"
      :min="0"
      :max="0.004"
      :step="0.0001"
      :digit="4"
    />
    <demo-slider
      v-model="normalBias"
      label="normalBias"
      :min="0"
      :max="0.6"
      :step="0.02"
    />
    <demo-slider
      v-model="halfExtent"
      label="投影半徑"
      :min="8"
      :max="45"
      :step="1"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DirectionalLight, ShadowGenerator } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createShadowProps, createShadowStage } from './shadow-stage'

const bias = ref(0.0005)
const normalBias = ref(0.08)
const halfExtent = ref(14)

const shadowGenerator = shallowRef<ShadowGenerator>()
const sunLight = shallowRef<DirectionalLight>()

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createShadowStage({ babylon, scene })

  stage.sun.position = new babylon.Vector3(-0.58, 0.66, 0.48).scale(30)
  stage.sun.autoUpdateExtends = false
  stage.sun.shadowMinZ = 1
  stage.sun.shadowMaxZ = 70

  /**
   * 貼圖刻意只給 512
   *
   * 投影範圍一拉大，每一格地分到的紋素立刻不夠用，
   * 邊緣的階梯才看得清楚
   */
  const generator = new babylon.ShadowGenerator(512, stage.sun)
  generator.darkness = 0.05
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = babylon.ShadowGenerator.QUALITY_MEDIUM

  for (const mesh of createShadowProps({ babylon, scene, stage })) {
    generator.addShadowCaster(mesh)
  }

  shadowGenerator.value = generator
  sunLight.value = stage.sun
  applySetting()

  return () => {
    shadowGenerator.value = undefined
    sunLight.value = undefined
  }
}

function applySetting() {
  const generator = shadowGenerator.value
  const sun = sunLight.value
  if (!generator || !sun)
    return

  generator.bias = bias.value
  generator.normalBias = normalBias.value

  sun.orthoLeft = -halfExtent.value
  sun.orthoRight = halfExtent.value
  sun.orthoTop = halfExtent.value
  sun.orthoBottom = -halfExtent.value
}

watch([bias, normalBias, halfExtent], applySetting)
</script>
