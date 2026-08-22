<template>
  <demo-frame
    :setup="setup"
    :camera-radius="9"
    :camera-beta="1.25"
    :clear-color="[0.05, 0.06, 0.09, 1]"
    title="白天要保留的比例，得給得比直覺高"
    caption="把時刻拖到白天，再把保留比例拉到零，那盞燈就完全熄了。關鍵在最後那個開關，畫面出去還要過一次 ACES 色調映射，而那條曲線在高處壓縮得很兇。同樣的 0.17，夜裡是一團明顯的光，白天幾乎整個被壓掉。"
  >
    <demo-slider
      v-model="dayRatio"
      label="時刻"
      :min="0"
      :max="1"
      :step="0.01"
    />
    <demo-slider
      v-model="dayStrengthRatio"
      label="白天保留比例"
      :min="0"
      :max="1"
      :step="0.01"
    />
    <demo-toggle
      v-model="hasToneMapping"
      label="ACES 色調映射"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Color3 } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createGlowMaterial, createGlowTexture } from '../demo/glow-texture'

/** 夜裡的光暈強度，與專案裡的 NIGHT_STRENGTH 同一個值 */
const NIGHT_STRENGTH = 0.85

/** 光暈本身的顏色，燈籠的暖黃 */
const GLOW_COLOR: readonly [number, number, number] = [255, 220, 160]

const dayRatio = ref(0)
const dayStrengthRatio = ref(0.45)
const hasToneMapping = ref(true)

const glowEmissive = shallowRef<Color3>()
const ambientRef = shallowRef<{ intensity: number }>()
const toneMappingRef = shallowRef<{ toneMappingEnabled: boolean }>()

/**
 * 亮度寫在材質的自發光上
 *
 * 一整個世界的燈火只有兩三種顏色，所以幾十盞燈改的其實就是這幾個顏色物件，
 * 不必逐盞去動。這裡只有一盞，公式完全一樣
 */
watch([dayRatio, dayStrengthRatio], ([ratio, keepRatio]) => {
  const color = glowEmissive.value
  if (!color)
    return

  const strength = NIGHT_STRENGTH * (1 - ratio * (1 - keepRatio))
  color.set(strength, strength, strength)

  if (ambientRef.value) {
    ambientRef.value.intensity = 0.25 + ratio * 0.75
  }
})

watch(hasToneMapping, (enabled) => {
  if (toneMappingRef.value) {
    toneMappingRef.value.toneMappingEnabled = enabled
  }
})

function setup({ babylon, scene, camera }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.25 + dayRatio.value * 0.75
  ambient.diffuse = new babylon.Color3(0.72, 0.78, 0.92)
  ambientRef.value = ambient

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 14, height: 14 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.32, 0.31, 0.29)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial

  const lamp = babylon.MeshBuilder.CreateBox('lamp', { size: 1 }, scene)
  lamp.position.y = 1.5
  const lampMaterial = new babylon.StandardMaterial('lamp-material', scene)
  lampMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  lampMaterial.specularColor = new babylon.Color3(0, 0, 0)
  lampMaterial.emissiveColor = new babylon.Color3(1, 0.86, 0.62)
  lamp.material = lampMaterial

  const texture = createGlowTexture(babylon, scene, 'glow', GLOW_COLOR)
  const material = createGlowMaterial(babylon, scene, 'glow-material', texture)
  glowEmissive.value = material.emissiveColor

  const initialStrength = NIGHT_STRENGTH * (1 - dayRatio.value * (1 - dayStrengthRatio.value))
  material.emissiveColor.set(initialStrength, initialStrength, initialStrength)

  const halo = babylon.MeshBuilder.CreateDisc('halo', { radius: 1.8, tessellation: 32 }, scene)
  halo.material = material
  halo.billboardMode = babylon.Mesh.BILLBOARDMODE_ALL
  halo.position.copyFrom(lamp.position)
  halo.isPickable = false

  /**
   * 色調映射要放在後處理，不能只開材質那一層
   *
   * 光暈走的是相加混合，混合是發生在材質輸出之後。
   * 只開材質層的話，壓縮的是光暈自己那份顏色，
   * 而真正被壓的其實是它加到畫面上之後的總和
   */
  const pipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', true, scene, [camera])
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = hasToneMapping.value
  pipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  pipeline.bloomEnabled = false
  pipeline.fxaaEnabled = false
  toneMappingRef.value = pipeline.imageProcessing

  /**
   * 背景跟著時刻走，不然白天的燈看起來只是變暗，感覺不到它在跟天光比
   *
   * demo-frame 的 clear-color 只在引擎建立當下套用一次，之後不會再讀，
   * 天色的日夜變化得自己在這裡跟著 dayRatio 動
   */
  const stopSky = watch(dayRatio, (ratio) => {
    scene.clearColor.set(
      0.05 + ratio * 0.38,
      0.06 + ratio * 0.53,
      0.09 + ratio * 0.72,
      1,
    )
  }, { immediate: true })

  return () => {
    stopSky()
    glowEmissive.value = undefined
    ambientRef.value = undefined
    toneMappingRef.value = undefined
    pipeline.dispose()
  }
}
</script>
