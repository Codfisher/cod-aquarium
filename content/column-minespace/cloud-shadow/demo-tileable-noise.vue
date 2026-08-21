<template>
  <demo-frame
    :setup="setup"
    :camera-radius="14"
    :camera-beta="1.5708"
    :camera-alpha="-1.5708"
    :interactive="false"
    :clear-color="[0.09, 0.1, 0.14, 1]"
    :height="280"
    title="同一張噪音平鋪三乘三"
    caption="關掉「邊界繞回去」，每一塊拼接處都會出現一條看得出來的界線。繞回去之後，讀格點的座標自己會回到另一端，整張圖於是無縫。格點數越少，雲團越大顆。"
  >
    <demo-toggle
      v-model="isWrapped"
      label="邊界繞回去"
    />
    <demo-toggle
      v-model="isSmooth"
      label="平滑內插"
    />
    <demo-slider
      v-model="pointCount"
      label="格點數"
      :min="2"
      :max="16"
      :step="1"
      :digit="0"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSeededRandom, createTileableNoise } from './cloud-pattern'

const isWrapped = ref(true)
const isSmooth = ref(true)
const pointCount = ref(6)

/** 圖樣邊長，噪音要放大到這麼細 */
const NOISE_SIZE = 128

const noiseMaterial = shallowRef<StandardMaterial>()
const noiseScene = shallowRef<Scene>()
const babylonModule = shallowRef<BabylonModule>()

let currentTexture: DynamicTexture | undefined

function applyNoise() {
  const material = noiseMaterial.value
  const scene = noiseScene.value
  const babylon = babylonModule.value
  if (!material || !scene || !babylon)
    return

  const valueList = createTileableNoise(
    createSeededRandom(20260820),
    NOISE_SIZE,
    pointCount.value,
    { isWrapped: isWrapped.value, isSmooth: isSmooth.value },
  )

  const texture = new babylon.DynamicTexture(
    `noise-${Date.now()}`,
    { width: NOISE_SIZE, height: NOISE_SIZE },
    scene,
    false,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  const image = context.createImageData(NOISE_SIZE, NOISE_SIZE)

  for (const [index, value] of valueList.entries()) {
    const shade = Math.round(Math.min(1, Math.max(0, value)) * 255)
    image.data[index * 4] = shade
    image.data[index * 4 + 1] = shade
    image.data[index * 4 + 2] = Math.min(255, shade + 12)
    image.data[index * 4 + 3] = 255
  }
  context.putImageData(image, 0, 0)
  texture.update()

  /** 平鋪三乘三，接縫才看得出來 */
  texture.uScale = 3
  texture.vScale = 3
  texture.wrapU = babylon.Texture.WRAP_ADDRESSMODE
  texture.wrapV = babylon.Texture.WRAP_ADDRESSMODE

  /** 掛在 diffuseTexture，關掉光照之後畫面上就只剩這張圖 */
  material.diffuseTexture = texture
  currentTexture?.dispose()
  currentTexture = texture
}

function setup({ babylon, scene }: BabylonDemoContext) {
  const material = new babylon.StandardMaterial('noise-material', scene)
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(1, 1, 1)
  material.disableLighting = true

  const plane = babylon.MeshBuilder.CreatePlane('noise', { size: 11 }, scene)
  plane.material = material
  plane.isPickable = false

  noiseMaterial.value = material
  noiseScene.value = scene
  babylonModule.value = babylon
  applyNoise()

  return () => {
    noiseMaterial.value = undefined
    noiseScene.value = undefined
    babylonModule.value = undefined
    currentTexture = undefined
  }
}

watch([isWrapped, isSmooth, pointCount], applyNoise)
</script>
