<template>
  <demo-frame
    :setup="setup"
    :camera-radius="14"
    :camera-beta="1.5708"
    :camera-alpha="-1.5708"
    :interactive="false"
    :clear-color="[0.36, 0.55, 0.82, 1]"
    :height="280"
    title="兩層噪音疊起來，取分位數當門檻"
    caption="低頻那一層決定一朵雲多大，高頻那一層負責咬出邊緣的缺口。高頻權重歸零，雲會變成幾團邊緣圓滑的斑；拉高之後邊緣就碎了。覆蓋率說幾成就真的是幾成，因為門檻是排序之後取第 N 名。"
  >
    <demo-slider
      v-model="coverage"
      label="覆蓋率"
      :min="0.04"
      :max="0.6"
      :step="0.01"
    />
    <demo-slider
      v-model="detailWeight"
      label="高頻權重"
      :min="0"
      :max="0.8"
      :step="0.02"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createCloudPattern, createSeededRandom } from './cloud-pattern'

const coverage = ref(0.24)
const detailWeight = ref(0.35)

/** 圖樣的格數，一格就是天上的一朵方塊雲 */
const PATTERN_COUNT = 48

const patternMaterial = shallowRef<StandardMaterial>()
const patternScene = shallowRef<Scene>()
const babylonModule = shallowRef<BabylonModule>()

let currentTexture: DynamicTexture | undefined

function applyPattern() {
  const material = patternMaterial.value
  const scene = patternScene.value
  const babylon = babylonModule.value
  if (!material || !scene || !babylon)
    return

  const cellList = createCloudPattern(
    createSeededRandom(20260820),
    PATTERN_COUNT,
    coverage.value,
    [
      /** 低頻，決定一朵雲多大 */
      { density: 0.12, weight: 1 },
      /** 高頻，咬出邊緣的缺口 */
      { density: 0.34, weight: detailWeight.value },
    ],
  )

  /** 最近鄰取樣，方格的輪廓才留得住 */
  const texture = new babylon.DynamicTexture(
    `pattern-${Date.now()}`,
    { width: PATTERN_COUNT, height: PATTERN_COUNT },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  const image = context.createImageData(PATTERN_COUNT, PATTERN_COUNT)

  for (const [index, isCloud] of cellList.entries()) {
    const shade = isCloud ? 252 : 92
    image.data[index * 4] = shade
    image.data[index * 4 + 1] = shade
    image.data[index * 4 + 2] = isCloud ? 255 : 140
    image.data[index * 4 + 3] = 255
  }
  context.putImageData(image, 0, 0)
  texture.update()

  material.diffuseTexture = texture
  currentTexture?.dispose()
  currentTexture = texture
}

function setup({ babylon, scene }: BabylonDemoContext) {
  const material = new babylon.StandardMaterial('pattern-material', scene)
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(1, 1, 1)
  material.disableLighting = true

  const plane = babylon.MeshBuilder.CreatePlane('pattern', { size: 11 }, scene)
  plane.material = material
  plane.isPickable = false

  patternMaterial.value = material
  patternScene.value = scene
  babylonModule.value = babylon
  applyPattern()

  return () => {
    patternMaterial.value = undefined
    patternScene.value = undefined
    babylonModule.value = undefined
    currentTexture = undefined
  }
}

watch([coverage, detailWeight], applyPattern)
</script>
