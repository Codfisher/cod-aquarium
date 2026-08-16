<template>
  <demo-frame
    :setup="setupScene"
    title="ACES 色調映射的前後差別"
    caption="關掉映射時，被曬到的白沙與方塊頂面全部擠在純白，亮部的層次整個不見。打開之後高處被曲線壓回來，那些階調才回得來。"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="16"
    :camera-target="[0, 1, 0]"
    :height="280"
  >
    <demo-toggle
      v-model="isToneMappingEnabled"
      label="ACES 色調映射"
    />
    <demo-slider
      v-model="exposure"
      label="曝光"
      :min="0.6"
      :max="2"
      :step="0.02"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DefaultRenderingPipeline } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const isToneMappingEnabled = shallowRef(true)
const exposure = shallowRef(1.06)

const pipeline = shallowRef<DefaultRenderingPipeline>()

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const { Color3, DirectionalLight, HemisphericLight, MeshBuilder, StandardMaterial, Vector3 } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  /**
   * 光開得比一般範例強
   *
   * 這個效果要在「亮到快溢出」的畫面上才看得出來，
   * 光給得溫和的話兩邊會長得一模一樣
   */
  const sun = new DirectionalLight('sun', new Vector3(0.666, -0.62, -0.416), scene)
  sun.intensity = 1.3
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.specular = new Color3(1, 1, 1)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  sandMaterial.ambientColor = new Color3(1, 1, 1)

  const ground = MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 幾顆高低不同的方塊，才有被曬到的頂面與背光的側面可以比較 */
  const blockList: [number, number, number, boolean][] = [
    [-3, 0.5, -1, false],
    [-3, 1.5, -1, false],
    [0, 0.5, 1.5, true],
    [2.5, 0.5, -2, true],
    [2.5, 1.5, -2, false],
    [2.5, 2.5, -2, true],
    [-1, 0.5, -3.5, true],
  ]

  for (const [x, y, z, isWood] of blockList) {
    const box = MeshBuilder.CreateBox(`block-${x}-${y}-${z}`, { size: 1 }, scene)
    box.position.set(x, y, z)
    box.material = isWood ? woodMaterial : stoneMaterial
  }

  const currentPipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  currentPipeline.imageProcessingEnabled = true
  currentPipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  currentPipeline.imageProcessing.contrast = 1.05
  currentPipeline.imageProcessing.vignetteEnabled = true
  currentPipeline.imageProcessing.vignetteWeight = 2.2
  currentPipeline.bloomEnabled = false
  currentPipeline.fxaaEnabled = false

  pipeline.value = currentPipeline
  applySetting()

  return () => {
    currentPipeline.dispose()
    pipeline.value = undefined
  }
}

function applySetting() {
  const currentPipeline = pipeline.value
  if (!currentPipeline)
    return

  currentPipeline.imageProcessing.toneMappingEnabled = isToneMappingEnabled.value
  currentPipeline.imageProcessing.exposure = exposure.value
}

watch([isToneMappingEnabled, exposure], applySetting)
</script>
