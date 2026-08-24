<template>
  <demo-frame
    :setup="setup"
    :camera-radius="16"
    :camera-beta="1.3"
    :clear-color="[0.08, 0.09, 0.12, 1]"
    title="洞裡的第三種空氣"
    caption="固定在沒有陽光的夜裡，只拉洞穴程度。發射率跟著 caveRatio 乘 0.7 走，最高也只到日間滿發射率的七成；顏色同時從花粉的暖黃線性混到冷灰，走進洞口那一段連續變化，沒有切換的頓點。"
  >
    <demo-slider
      v-model="caveRatio"
      label="洞穴程度"
      :min="0"
      :max="1"
      :step="0.01"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createLandmarkList, createMoteTexture } from './mote-texture'

const caveRatio = ref(0)

/** 浮塵滿發射率，跟其他範例用同一個數字 */
const MOTE_EMIT_RATE = 26

function setup({ babylon, scene }: BabylonDemoContext) {
  /** 花粉：白天曬得到太陽的暖色 */
  const pollenColor = new babylon.Color4(1, 0.94, 0.72, 0.5)
  const pollenColorFaded = new babylon.Color4(0.94, 0.9, 0.78, 0.28)
  /** 洞裡的塵：冷灰，一點暖都不留 */
  const caveColor = new babylon.Color4(0.72, 0.76, 0.84, 0.42)
  const caveColorFaded = new babylon.Color4(0.6, 0.64, 0.72, 0.24)

  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.32
  ambient.diffuse = new babylon.Color3(0.78, 0.8, 0.86)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 44, height: 44 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.22, 0.22, 0.25)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial
  ground.isPickable = false

  createLandmarkList(babylon, scene)

  const emitter = new babylon.Vector3(0, 2, 0)

  /**
   * 洞裡的浮塵，骨架與白天那組完全一樣
   *
   * 差別只在顏色與發射率，兩者都跟著洞穴程度即時插值，
   * 不必重建系統
   */
  const moteSystem = new babylon.ParticleSystem('air-mote', 240, scene)
  moteSystem.particleTexture = createMoteTexture(babylon, scene, 'air-mote-texture')
  moteSystem.emitter = emitter
  moteSystem.minEmitBox = new babylon.Vector3(-11, -2.5, -11)
  moteSystem.maxEmitBox = new babylon.Vector3(11, 4, 11)
  moteSystem.colorDead = new babylon.Color4(pollenColor.r, pollenColor.g, pollenColor.b, 0)
  moteSystem.minSize = 0.04
  moteSystem.maxSize = 0.08
  moteSystem.minLifeTime = 6
  moteSystem.maxLifeTime = 13
  moteSystem.gravity = new babylon.Vector3(0, 0.012, 0)
  moteSystem.direction1 = new babylon.Vector3(-0.06, 0.02, -0.06)
  moteSystem.direction2 = new babylon.Vector3(0.06, 0.09, 0.06)
  moteSystem.minEmitPower = 0.04
  moteSystem.maxEmitPower = 0.16
  moteSystem.updateSpeed = 0.02
  moteSystem.blendMode = babylon.ParticleSystem.BLENDMODE_STANDARD
  moteSystem.start()

  const stop = watch(caveRatio, (ratio) => {
    /**
     * 沒有日光，litRatio 只剩 caveRatio 這一項
     *
     * 洞穴程度乘 0.7，所以拉到底也只到日間滿發射率的七成，
     * 灰塵是被燈火照亮的，不是被太陽照亮的
     */
    const litRatio = ratio * 0.7
    moteSystem.emitRate = MOTE_EMIT_RATE * litRatio

    babylon.Color4.LerpToRef(pollenColor, caveColor, ratio, moteSystem.color1)
    babylon.Color4.LerpToRef(pollenColorFaded, caveColorFaded, ratio, moteSystem.color2)
  }, { immediate: true })

  return () => {
    stop()
    moteSystem.dispose()
  }
}
</script>
