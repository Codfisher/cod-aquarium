<template>
  <demo-frame
    :setup="setupScene"
    title="反射一張等距柱狀投影的天色貼圖"
    caption="貼圖只有四像素寬、六十四像素高，因為等距柱狀投影的顏色只跟視線的垂直角度有關，水平朝哪看都一樣。轉動時刻，濕地那道反光會跟著天色一起走，黃昏是橘的、夜裡幾乎收乾淨。這張圖不負責「反光的到底是不是眼前那棵樹」，它只負責「濕地在斜視角會泛起一層天光」。"
    :camera-alpha="-Math.PI / 2.35"
    :camera-beta="Math.PI / 2.3"
    :camera-radius="16"
    :camera-target="[0, 0.8, 0]"
    :height="300"
  >
    <demo-slider
      v-model="dayProgress"
      label="時刻"
      :min="0"
      :max="1"
      :step="0.01"
    />
    <demo-slider
      v-model="wetRatio"
      label="濕潤度"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DirectionalLight, DynamicTexture, HemisphericLight, Scene } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { Wetness } from './wetness'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSkyReflectionTexture, measureSkyPalette, updateSkyReflectionTexture } from './sky-reflection'
import { createWetScene } from './wet-scene'
import { createWetness } from './wetness'

const dayProgress = shallowRef(0.5)
const wetRatio = shallowRef(1)

const wetness = shallowRef<Wetness>()
const skyTexture = shallowRef<DynamicTexture>()
const sceneRef = shallowRef<Scene>()
const sunRef = shallowRef<DirectionalLight>()
const ambientRef = shallowRef<HemisphericLight>()

/**
 * 天色變化很慢，不必逐幀重繪整張貼圖
 *
 * 本體是每半秒更新一次，範例裡改成滑桿動了才畫
 */
function applySky() {
  const texture = skyTexture.value
  const scene = sceneRef.value
  const sun = sunRef.value
  const ambient = ambientRef.value
  if (!texture || !scene || !sun || !ambient)
    return

  const palette = measureSkyPalette(dayProgress.value)
  updateSkyReflectionTexture(texture, palette)

  scene.clearColor.set(palette.mid[0], palette.mid[1], palette.mid[2], 1)
  sun.diffuse.set(palette.horizon[0], palette.horizon[1], palette.horizon[2])
  ambient.diffuse.set(palette.mid[0], palette.mid[1], palette.mid[2])

  /** 夜裡的日照收掉，濕地那道反光才不會變成全場唯一的光源 */
  const dayStrength = Math.max(0, Math.sin(dayProgress.value * Math.PI))
  sun.intensity = 0.15 + dayStrength * 1.1
  ambient.intensity = 0.2 + dayStrength * 0.55
}

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const { materialList, sun, ambient } = createWetScene(context)

  const reflectionTexture = createSkyReflectionTexture(babylon, scene)

  skyTexture.value = reflectionTexture
  sceneRef.value = scene
  sunRef.value = sun
  ambientRef.value = ambient

  wetness.value = createWetness(materialList, {
    babylon,
    reflectionTexture,
  })
  wetness.value.setRatio(wetRatio.value)

  applySky()

  return () => {
    wetness.value = undefined
    skyTexture.value = undefined
    sceneRef.value = undefined
    sunRef.value = undefined
    ambientRef.value = undefined
  }
}

watch(dayProgress, applySky)
watch(wetRatio, (value) => wetness.value?.setRatio(value))
</script>
