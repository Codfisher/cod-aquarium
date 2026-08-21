<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="解析度倍率也是抗鋸齒的一環"
    caption="倍率小於一代表畫比螢幕更多的像素，縮回去的時候每個螢幕像素等於收了好幾個樣本，邊緣自然就平了。代價是像素量按平方成長，所以專案裡把它壓在一點五，抗鋸齒交給便宜得多的多重取樣。"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 3.05"
    :camera-radius="12"
    :camera-target="[0, 1.5, 0]"
    :height="300"
  >
    <demo-slider
      v-model="pixelRatio"
      label="解析度倍率"
      :min="0.4"
      :max="2"
      :step="0.1"
      :digit="1"
      unit="×"
    />
    <demo-toggle
      v-model="hasMultiSample"
      label="多重取樣 ×4"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DefaultRenderingPipeline, Engine } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createWoodTexture } from '../demo/pixel-texture'

const pixelRatio = shallowRef(1)
const hasMultiSample = shallowRef(false)

const renderWidth = shallowRef(0)
const renderHeight = shallowRef(0)

const badge = computed(() => {
  const total = renderWidth.value * renderHeight.value
  return `${renderWidth.value} × ${renderHeight.value}，共 ${(total / 1000).toFixed(0)}k 像素`
})

const engineRef = shallowRef<Engine>()
const pipelineRef = shallowRef<DefaultRenderingPipeline>()

function setupScene({ babylon, scene, engine, camera }: BabylonDemoContext) {
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

  const sun = new DirectionalLight('sun', new Vector3(0.6, -0.66, -0.44), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0, 0, 0)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
  ground.material = sandMaterial

  /** 一排角度各異的細柱，斜邊越多越看得出解析度的影響 */
  for (const [index, angle] of [0.18, 0.55, -0.32, 0.86].entries()) {
    const post = MeshBuilder.CreateBox(`post-${index}`, { width: 0.42, height: 3.6, depth: 0.42 }, scene)
    post.position.set(index * 1.9 - 2.9, 1.8, index % 2 === 0 ? -1.2 : 1.4)
    post.rotation.y = angle
    post.rotation.z = angle * 0.16
    post.material = woodMaterial
  }

  const pipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = true
  pipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  pipeline.bloomEnabled = false
  pipeline.fxaaEnabled = false

  engineRef.value = engine
  pipelineRef.value = pipeline

  const observer = scene.onAfterRenderObservable.add(() => {
    renderWidth.value = engine.getRenderWidth()
    renderHeight.value = engine.getRenderHeight()
  })

  applySetting()

  return () => {
    scene.onAfterRenderObservable.remove(observer)
    pipeline.dispose()
    engineRef.value = undefined
    pipelineRef.value = undefined
  }
}

/**
 * 倍率與硬體縮放互為倒數
 *
 * 這與本體的 getHardwareScalingLevel 是同一條算式，
 * 那裡多做的只是「別超過裝置本身的像素比」
 */
function applySetting() {
  engineRef.value?.setHardwareScalingLevel(1 / pixelRatio.value)

  if (pipelineRef.value) {
    pipelineRef.value.samples = hasMultiSample.value ? 4 : 1
  }
}

watch([pixelRatio, hasMultiSample], applySetting)
</script>
