<template>
  <demo-frame
    :setup="setup"
    :camera-radius="24"
    :camera-beta="1.4"
    :clear-color="[0.55, 0.44, 0.42, 1]"
    title="貼地加厚跟著太陽仰角走"
    caption="把仰角滑桿拉到 0，加厚衝到 1.15 倍，木座貼地的那一截泛白最明顯；拉到 0.55 以上收到 0.6 倍，同一截仍看得出泛白，只是淡了一截。超過 0.55 之後加厚卡在 0.6，不會再往下掉。"
  >
    <demo-slider
      v-model="sunHeight"
      label="太陽仰角"
      :min="0"
      :max="0.7"
      :step="0.01"
      :digit="2"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { attachHeightFog } from './height-fog'
import { computeGroundHazeBoost, createMistTerrain } from './mist-scene'

const sunHeight = ref(0.3)

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.diffuse = new babylon.Color3(1, 0.96, 0.9)

  scene.fogMode = babylon.Scene.FOGMODE_EXP2
  scene.fogDensity = 0.022
  scene.fogColor = new babylon.Color3(0.79, 0.83, 0.88)

  createMistTerrain(babylon, scene)

  /**
   * top 抓在最高那座木座（3.2 格）上面一點，falloff 讓整段木座的高度
   * 剛好從貼地的滿檔、走到頂端只剩不到一成，一根柱子上就看得出漸層
   */
  const fogState = {
    top: 3.4,
    falloff: 1 / 2.2,
    boost: computeGroundHazeBoost(sunHeight.value),
  }

  for (const material of scene.materials) {
    if (material instanceof babylon.StandardMaterial) {
      attachHeightFog(babylon, material, fogState)
    }
  }

  const stop = watch(sunHeight, (value) => {
    fogState.boost = computeGroundHazeBoost(value)

    /** 天色跟著仰角走，低仰角偏暖偏暗，貼近晨昏；高仰角收回明亮的白天 */
    const dayRatio = Math.min(1, Math.max(0, value / 0.55))
    scene.fogColor.set(
      0.55 + 0.24 * dayRatio,
      0.44 + 0.39 * dayRatio,
      0.42 + 0.46 * dayRatio,
    )
    scene.clearColor.set(
      0.55 + 0.24 * dayRatio,
      0.44 + 0.39 * dayRatio,
      0.42 + 0.46 * dayRatio,
      1,
    )
    ambient.intensity = 0.55 + 0.4 * dayRatio
  }, { immediate: true })

  return () => stop()
}
</script>
