<template>
  <compare-grid
    title="峰值占本體亮度的比例，天空亮暗會改變門檻"
    caption="兩邊共用同一根滑桿，天空本身夠不夠亮卻讓結果差很多。左邊的白天藍天本來就逼近顯示上限，峰值拉滿，太陽邊緣只剩兩階落差，幾乎融進暈裡；右邊近地平線的暖橘天色沒那麼亮，峰值拉滿邊界依然有二十四階落差，太陽不會消失。專案裡真正吃到這個問題的，是白天那種天色已經夠亮的時候。"
  >
    <demo-frame
      :setup="setupDaySky"
      badge="白天"
      compact
      :camera-radius="13"
      :camera-beta="1.5708"
      :camera-alpha="-1.5708"
      :interactive="false"
      :clear-color="[0.42, 0.62, 0.86, 1]"
      :height="220"
    />
    <demo-frame
      :setup="setupHorizonSky"
      badge="近地平線"
      compact
      :camera-radius="13"
      :camera-beta="1.5708"
      :camera-alpha="-1.5708"
      :interactive="false"
      :clear-color="[0.55, 0.38, 0.3, 1]"
      :height="220"
    />
  </compare-grid>

  <div class="demo-shared-controls not-prose">
    <demo-slider
      v-model="peakRatio"
      label="峰值比例"
      :min="0.2"
      :max="1"
      :step="0.01"
    />
  </div>
</template>

<script setup lang="ts">
import type { DynamicTexture } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import CompareGrid from '../demo/compare-grid.vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createGlowTexture } from '../demo/glow-texture'
import { createSkyBodyMaterial, createSunTexture } from './sky-texture'

/** 太陽貼圖的底色，峰值比例就是相對這個顏色的倍率 */
const SUN_BASE_COLOR: [number, number, number] = [255, 250, 230]

/** 兩個場景共用同一根滑桿，天空亮暗才是唯一的變因 */
const peakRatio = ref(0.51)

function measurePeakColor(ratio: number): [number, number, number] {
  return [
    Math.round(SUN_BASE_COLOR[0] * ratio),
    Math.round(SUN_BASE_COLOR[1] * ratio),
    Math.round(SUN_BASE_COLOR[2] * ratio),
  ]
}

/** 兩個面板除了天空背景色不一樣，場景內容完全相同，工廠函式生一份共用邏輯 */
function createGlowPeakScene(namePrefix: string) {
  return function setup({ babylon, scene }: BabylonDemoContext) {
    const glowTexture = createGlowTexture(
      babylon,
      scene,
      `${namePrefix}-glow`,
      measurePeakColor(peakRatio.value),
    )
    const glowMaterial = createSkyBodyMaterial(babylon, scene, `${namePrefix}-glow-material`, glowTexture)
    const glow = babylon.MeshBuilder.CreateDisc(`${namePrefix}-glow`, { radius: 14, tessellation: 48 }, scene)
    glow.material = glowMaterial
    glow.isPickable = false

    const sunTexture = createSunTexture(babylon, scene, `${namePrefix}-sun`)
    const sun = babylon.MeshBuilder.CreatePlane(`${namePrefix}-sun`, { size: 9 }, scene)
    sun.material = createSkyBodyMaterial(babylon, scene, `${namePrefix}-sun-material`, sunTexture)
    sun.isPickable = false
    /** 本體要疊在暈前面，位置稍微往鏡頭挪一點，跟正文「暈掛得比本體再遠兩格」是同一招 */
    sun.position.z = -0.5

    /** 峰值一換，貼圖要重畫一張，舊的那張收掉，不然拖一次滑桿就多留一張貼圖 */
    let currentGlowTexture: DynamicTexture | undefined = glowTexture

    const stop = watch(peakRatio, (ratio) => {
      const texture = createGlowTexture(
        babylon,
        scene,
        `${namePrefix}-glow-${Date.now()}`,
        measurePeakColor(ratio),
      )
      glowMaterial.diffuseTexture = texture
      currentGlowTexture?.dispose()
      currentGlowTexture = texture
    })

    return () => stop()
  }
}

const setupDaySky = createGlowPeakScene('glow-peak-day')
const setupHorizonSky = createGlowPeakScene('glow-peak-horizon')
</script>

<style scoped>
.demo-shared-controls {
  display: flex;
  justify-content: center;
  margin: -0.6rem 0 1.5rem;
}
</style>
