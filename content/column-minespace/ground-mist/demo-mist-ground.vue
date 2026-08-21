<template>
  <demo-frame
    :setup="setup"
    :camera-radius="28"
    :camera-beta="1.42"
    :clear-color="[0.36, 0.4, 0.48, 1]"
    title="霧片要照著地形的高度長出來"
    caption="關掉之後，霧片一律生在同一個高度，畫面上是一片橫穿所有木座的白板。打開之後霧才會積在低處、繞著木座的邊緣走。"
  >
    <demo-toggle
      v-model="surfaceAligned"
      label="貼著地面"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createMistTerrain, createMistTexture, createSurfaceProbe } from './mist-scene'

const surfaceAligned = ref(true)

const MIST_RADIUS = 16
const MIST_MIN_HEIGHT = 0.1
const MIST_MAX_HEIGHT = 1.9
const MIST_CAPACITY = 96
const FULL_EMIT_RATE = MIST_CAPACITY / 14

/** 關掉貼地時，霧片一律生在這個高度上 */
const FLAT_HEIGHT = 1.6

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.85
  ambient.diffuse = new babylon.Color3(1, 0.96, 0.9)

  createMistTerrain(babylon, scene)
  const measureSurfaceY = createSurfaceProbe(babylon, scene)

  const emitter = new babylon.Vector3(0, 0, 0)

  const mistSystem = new babylon.ParticleSystem('ground-mist', MIST_CAPACITY, scene)
  mistSystem.particleTexture = createMistTexture(babylon, scene)
  mistSystem.emitter = emitter

  /**
   * 自己決定每一片霧生在哪裡
   *
   * startPositionFunction 一給，minEmitBox 與 maxEmitBox 就不算數了。
   * 這裡先在圓內挑一個位置，再往下打一道射線問地面有多高，
   * 霧片才會照著地形的起伏鋪
   */
  mistSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    /** 稍微偏向中心取樣，越往外霧片越疏，邊緣才自然散開 */
    const radius = Math.random() ** 0.7 * MIST_RADIUS
    const angle = Math.random() * Math.PI * 2
    const x = emitter.x + Math.cos(angle) * radius
    const z = emitter.z + Math.sin(angle) * radius

    const baseY = surfaceAligned.value ? measureSurfaceY(x, z) : FLAT_HEIGHT

    positionToUpdate.set(
      x,
      baseY + MIST_MIN_HEIGHT + Math.random() * (MIST_MAX_HEIGHT - MIST_MIN_HEIGHT),
      z,
    )
  }

  const tintLight = new babylon.Color4(0.92, 0.94, 0.97, 0.3)
  const tintDark = new babylon.Color4(0.82, 0.85, 0.9, 0.2)
  const tintLightClear = new babylon.Color4(0.92, 0.94, 0.97, 0)
  const tintDarkClear = new babylon.Color4(0.82, 0.85, 0.9, 0)

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
  mistSystem.emitRate = FULL_EMIT_RATE
  mistSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  mistSystem.start()

  return () => mistSystem.dispose()
}
</script>
