<template>
  <demo-frame
    :setup="setup"
    :camera-alpha="-Math.PI / 2.45"
    :camera-beta="Math.PI / 3.2"
    :camera-radius="20"
    :camera-target="[0, 2, 0]"
    :height="300"
    title="ShadowGenerator 的三行設定"
    caption="darkness 越大陰影越淡，1 等於沒有影子。把天光拉高之後會看到很有趣的事，darkness 給 0.5 時白沙上的影子整個消失了，因為亮處與影子雙雙撞到 clamp 的天花板。"
  >
    <demo-toggle
      v-model="shadowVisible"
      label="陰影"
    />
    <demo-slider
      v-model="darkness"
      label="darkness"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-slider
      v-model="ambientIntensity"
      label="天光強度"
      :min="0"
      :max="1.2"
      :step="0.02"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { HemisphericLight, ShadowGenerator } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createShadowProps, createShadowStage } from './shadow-stage'

const shadowVisible = ref(true)
const darkness = ref(0.05)
const ambientIntensity = ref(0.62)

const shadowGenerator = shallowRef<ShadowGenerator>()
const ambientLight = shallowRef<HemisphericLight>()

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createShadowStage({ babylon, scene })

  /**
   * 平行光沒有位置，投影用的鏡頭卻要有
   *
   * 所以要沿著光線的反方向退開一段，退到把整座場景都含進去為止
   */
  stage.sun.position = new babylon.Vector3(-0.58, 0.66, 0.48).scale(30)
  stage.sun.autoUpdateExtends = false
  stage.sun.orthoLeft = -14
  stage.sun.orthoRight = 14
  stage.sun.orthoTop = 14
  stage.sun.orthoBottom = -14
  stage.sun.shadowMinZ = 1
  stage.sun.shadowMaxZ = 70

  const generator = new babylon.ShadowGenerator(1024, stage.sun)
  generator.bias = 0.0005
  generator.normalBias = 0.08
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = babylon.ShadowGenerator.QUALITY_MEDIUM

  for (const mesh of createShadowProps({ babylon, scene, stage })) {
    generator.addShadowCaster(mesh)
  }

  shadowGenerator.value = generator
  ambientLight.value = stage.ambient
  applySetting()

  return () => {
    shadowGenerator.value = undefined
    ambientLight.value = undefined
  }
}

function applySetting() {
  const generator = shadowGenerator.value
  const ambient = ambientLight.value
  if (!generator || !ambient)
    return

  /** 關掉陰影就是把 darkness 推到 1，那等於整張陰影貼圖不起作用 */
  generator.darkness = shadowVisible.value ? darkness.value : 1
  ambient.intensity = ambientIntensity.value
}

watch([shadowVisible, darkness, ambientIntensity], applySetting)
</script>
