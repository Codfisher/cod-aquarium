<template>
  <demo-frame
    :setup="setup"
    :camera-radius="26"
    :camera-beta="1.35"
    :clear-color="[0.1, 0.12, 0.2, 1]"
    title="晨霧只在天亮前那一段出現"
    caption="時刻從 0.09 走到 0.41，濃度先升到滿再慢慢散掉。淡出拖得比淡入長，太陽把霧曬散的那一段本來就是最好看的。"
  >
    <demo-slider
      v-model="timeOfDay"
      label="時刻"
      :min="0"
      :max="0.5"
      :step="0.005"
      :digit="3"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createMistTerrain, createMistTexture, getDawnMistRatio } from './mist-scene'

const timeOfDay = ref(0.18)

/** 霧鋪開的半徑 */
const MIST_RADIUS = 17

/** 這組系統最多養幾片霧 */
const MIST_CAPACITY = 96

/**
 * 滿檔的發射率
 *
 * 同時活著的數量大約是發射率乘上平均壽命。壽命平均十四秒，
 * 所以除以十四剛好把容量填滿而不會撞到上限
 */
const FULL_EMIT_RATE = MIST_CAPACITY / 14

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.diffuse = new babylon.Color3(1, 0.96, 0.9)

  createMistTerrain(babylon, scene)

  const emitter = new babylon.Vector3(0, 0, 0)

  const mistSystem = new babylon.ParticleSystem('ground-mist', MIST_CAPACITY, scene)
  mistSystem.particleTexture = createMistTexture(babylon, scene)
  mistSystem.emitter = emitter
  mistSystem.minEmitBox = new babylon.Vector3(-MIST_RADIUS, 0.1, -MIST_RADIUS)
  mistSystem.maxEmitBox = new babylon.Vector3(MIST_RADIUS, 1.9, MIST_RADIUS)

  const tintLight = new babylon.Color4(0.9, 0.92, 0.95, 0.26)
  const tintDark = new babylon.Color4(0.8, 0.83, 0.88, 0.18)
  const tintLightClear = new babylon.Color4(0.9, 0.92, 0.95, 0)
  const tintDarkClear = new babylon.Color4(0.8, 0.83, 0.88, 0)

  /** 一生的透明度：淡入、撐住、淡出，接替的過程才看不出來 */
  mistSystem.addColorGradient(0, tintLightClear, tintDarkClear)
  mistSystem.addColorGradient(0.3, tintLight, tintDark)
  mistSystem.addColorGradient(0.6, tintLight, tintDark)
  mistSystem.addColorGradient(1, tintLightClear, tintDarkClear)

  mistSystem.minSize = 5
  mistSystem.maxSize = 11
  mistSystem.minLifeTime = 10
  mistSystem.maxLifeTime = 18
  mistSystem.gravity = new babylon.Vector3(0, 0.015, 0)
  mistSystem.direction1 = new babylon.Vector3(-0.05, 0.01, -0.03)
  mistSystem.direction2 = new babylon.Vector3(0.05, 0.02, 0.03)
  mistSystem.minEmitPower = 0.1
  mistSystem.maxEmitPower = 0.4
  mistSystem.minAngularSpeed = -0.04
  mistSystem.maxAngularSpeed = 0.04
  mistSystem.updateSpeed = 0.02
  mistSystem.emitRate = 0
  mistSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  mistSystem.start()

  const stop = watch(timeOfDay, (value) => {
    /** 天色跟著時刻走，不然「天亮前」只是一句話 */
    const dayRatio = Math.min(1, Math.max(0, (value - 0.14) / 0.22))
    scene.clearColor.set(
      0.1 + 0.48 * dayRatio,
      0.12 + 0.5 * dayRatio,
      0.2 + 0.48 * dayRatio,
      1,
    )
    ambient.intensity = 0.25 + 0.65 * dayRatio

    /** 濃度只看時刻，一條寫死的曲線 */
    mistSystem.emitRate = FULL_EMIT_RATE * getDawnMistRatio(value)
  }, { immediate: true })

  return () => {
    stop()
    mistSystem.dispose()
  }
}
</script>
