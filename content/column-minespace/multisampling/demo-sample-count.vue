<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="取樣數要給到幾"
    caption="一到二的那一階差最多，二到四還看得出來，四以上就只剩下帳單。專案裡最高的兩級都停在四倍。"
    :camera-alpha="-Math.PI / 2.45"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="13"
    :camera-target="[0, 1.6, 0]"
    :height="300"
  >
    <demo-slider
      v-model="sampleIndex"
      label="取樣數"
      :min="0"
      :max="3"
      :step="1"
      :digit="0"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DefaultRenderingPipeline } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

/** 多重取樣的樣本數走二的次方，滑桿給的是這串的第幾項 */
const SAMPLE_COUNT_LIST = [1, 2, 4, 8]

const sampleIndex = shallowRef(0)

const sampleCount = computed(() => SAMPLE_COUNT_LIST[sampleIndex.value] ?? 1)
const badge = computed(() => (
  sampleCount.value === 1
    ? '沒有多重取樣'
    : `每個像素 ${sampleCount.value} 個樣本`
))

const pipelineRef = shallowRef<DefaultRenderingPipeline>()

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.62, -0.64, -0.45), scene)
  sun.intensity = 1.25
  sun.diffuse = new Color3(1, 0.94, 0.8)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 26, height: 26 }, scene)
  ground.material = stoneMaterial

  /**
   * 一座轉過角度的鳥居
   *
   * 幾何邊緣要斜的才看得出多重取樣做了什麼。
   * 正對鏡頭的邊剛好貼齊像素格，取樣幾次結果都一樣
   */
  const angle = 0.42
  for (const offset of [-2.2, 2.2]) {
    const pillar = MeshBuilder.CreateBox(`pillar-${offset}`, { width: 0.6, height: 5, depth: 0.6 }, scene)
    pillar.position.set(Math.cos(angle) * offset, 2.5, Math.sin(angle) * offset)
    pillar.rotation.y = angle
    pillar.material = woodMaterial
  }

  const beam = MeshBuilder.CreateBox('beam', { width: 6.4, height: 0.5, depth: 0.5 }, scene)
  beam.position.set(0, 4.6, 0)
  beam.rotation.y = angle
  beam.material = woodMaterial

  const roof = MeshBuilder.CreateBox('roof', { width: 7.6, height: 0.42, depth: 0.9 }, scene)
  roof.position.set(0, 5.3, 0)
  roof.rotation.y = angle
  roof.rotation.z = 0.06
  roof.material = woodMaterial

  const pipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = true
  pipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  pipeline.bloomEnabled = false
  pipeline.fxaaEnabled = false

  pipelineRef.value = pipeline

  applySetting()

  return () => {
    pipeline.dispose()
    pipelineRef.value = undefined
  }
}

function applySetting() {
  if (pipelineRef.value) {
    pipelineRef.value.samples = sampleCount.value
  }
}

watch(sampleCount, applySetting)
</script>
