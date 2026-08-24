<template>
  <demo-frame
    :setup="setup"
    :camera-radius="30"
    :camera-beta="0.55"
    :clear-color="[0.79, 0.83, 0.88, 1]"
    title="取樣次方決定霧往哪裡擠"
    caption="把次方拉到 1.3，霧幾乎全部黏在鏡頭正下方那一小圈，圈外幾步就稀疏很多；拉到 0.5，全場密度幾乎一致，看不太出腳邊比較濃。文章用的 0.7 介於中間，腳邊仍是全場最密的地方，邊緣也還留著一些霧，不會整個空掉。"
  >
    <demo-slider
      v-model="exponent"
      label="取樣次方"
      :min="0.3"
      :max="1.3"
      :step="0.05"
      :digit="2"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Vector3 } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createMistTerrain, createMistTexture } from './mist-scene'

const exponent = ref(0.7)

/** 撒霧的半徑，畫一圈邊界線讓讀者看得出「腳邊」跟「邊緣」分別在哪 */
const MIST_RADIUS = 15
const MIST_CAPACITY = 90
const FULL_EMIT_RATE = MIST_CAPACITY / 3.2

function setup({ babylon, scene }: BabylonDemoContext) {
  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new babylon.Color3(1, 0.98, 0.94)

  createMistTerrain(babylon, scene)

  /** 邊界圈，撒霧的半徑到哪裡一眼就看得出來 */
  const ringPointList: Vector3[] = []
  const ringSegmentCount = 64
  for (let index = 0; index <= ringSegmentCount; index++) {
    const angle = (index / ringSegmentCount) * Math.PI * 2
    ringPointList.push(new babylon.Vector3(
      Math.cos(angle) * MIST_RADIUS,
      0.05,
      Math.sin(angle) * MIST_RADIUS,
    ))
  }
  const ring = babylon.MeshBuilder.CreateLines('mist-radius-ring', { points: ringPointList }, scene)
  ring.color = new babylon.Color3(0.9, 0.35, 0.25)
  ring.isPickable = false

  const emitter = new babylon.Vector3(0, 0, 0)

  const mistSystem = new babylon.ParticleSystem('ground-mist', MIST_CAPACITY, scene)
  mistSystem.particleTexture = createMistTexture(babylon, scene)
  mistSystem.emitter = emitter

  /**
   * 高度固定，不貼地形
   *
   * 這支範例只想讓讀者看清楚「半徑怎麼分佈」，貼地形的起伏
   * 會讓木座擋住視線，反而看不出密度的差異，那件事交給另一支範例
   */
  mistSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    const radius = Math.random() ** exponent.value * MIST_RADIUS
    const angle = Math.random() * Math.PI * 2

    positionToUpdate.set(
      emitter.x + Math.cos(angle) * radius,
      0.6 + Math.random() * 0.6,
      emitter.z + Math.sin(angle) * radius,
    )
  }

  const tintLight = new babylon.Color4(0.92, 0.94, 0.97, 0.32)
  const tintDark = new babylon.Color4(0.82, 0.85, 0.9, 0.22)
  const tintLightClear = new babylon.Color4(0.92, 0.94, 0.97, 0)
  const tintDarkClear = new babylon.Color4(0.82, 0.85, 0.9, 0)

  mistSystem.addColorGradient(0, tintLightClear, tintDarkClear)
  mistSystem.addColorGradient(0.3, tintLight, tintDark)
  mistSystem.addColorGradient(0.7, tintLight, tintDark)
  mistSystem.addColorGradient(1, tintLightClear, tintDarkClear)

  mistSystem.minSize = 2.6
  mistSystem.maxSize = 4.4
  /**
   * 壽命刻意壓短
   *
   * 拉滑桿之後要幾秒鐘就看到新的分佈，不必等文章裡那組十幾秒的壽命
   */
  mistSystem.minLifeTime = 2.4
  mistSystem.maxLifeTime = 4
  mistSystem.gravity = new babylon.Vector3(0, 0.01, 0)
  mistSystem.minEmitPower = 0.05
  mistSystem.maxEmitPower = 0.15
  mistSystem.minAngularSpeed = -0.03
  mistSystem.maxAngularSpeed = 0.03
  mistSystem.updateSpeed = 0.02
  mistSystem.emitRate = FULL_EMIT_RATE
  mistSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  mistSystem.start()

  return () => {
    mistSystem.dispose()
    ring.dispose()
  }
}
</script>
