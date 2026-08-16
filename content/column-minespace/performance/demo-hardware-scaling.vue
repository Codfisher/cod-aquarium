<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="硬體縮放與多重取樣"
    caption="硬體縮放決定實際要畫多少像素，數字越大畫得越少。在兩倍的螢幕上直接跟著裝置像素比走，代表要畫四倍的像素；壓在 1.5 以內畫質幾乎看不出差別，像素量卻少了將近一半。多重取樣則只對真正的幾何邊緣多取樣本。"
    :camera-alpha="-Math.PI / 2.5"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="15"
    :camera-target="[0, 1.4, 0]"
    :height="300"
  >
    <demo-slider
      v-model="scalingLevel"
      label="硬體縮放"
      :min="0.5"
      :max="4"
      :step="0.1"
      :digit="1"
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
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const scalingLevel = shallowRef(1)
const hasMultiSample = shallowRef(true)

const renderWidth = shallowRef(0)
const renderHeight = shallowRef(0)

const badge = computed(() => {
  const total = renderWidth.value * renderHeight.value
  return `${renderWidth.value} × ${renderHeight.value}  共 ${(total / 1000).toFixed(0)}k 像素`
})

const engineRef = shallowRef<Engine>()
const pipelineRef = shallowRef<DefaultRenderingPipeline>()

function setupScene({ babylon, scene, engine, camera }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

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
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 幾何邊緣與像素貼圖都要有，兩種鋸齒才比得出來 */
  for (const [x, z, angle] of [[-2.6, -1, 0.4], [2.4, 1.2, -0.3], [0.2, -3, 0.15]] as const) {
    const post = MeshBuilder.CreateBox(`post-${x}`, { width: 0.6, height: 3.4, depth: 0.6 }, scene)
    post.position.set(x, 1.7, z)
    post.rotation.y = angle
    post.material = woodMaterial

    const cap = MeshBuilder.CreateBox(`cap-${x}`, { width: 1.4, height: 0.4, depth: 1.4 }, scene)
    cap.position.set(x, 3.6, z)
    cap.rotation.y = angle
    cap.material = stoneMaterial
  }

  const pipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = true
  pipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  pipeline.imageProcessing.exposure = 1.06
  pipeline.bloomEnabled = false
  pipeline.fxaaEnabled = false

  engineRef.value = engine
  pipelineRef.value = pipeline

  /** 每一幀讀一次實際畫布大小，讀者才看得到像素量的變化 */
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

function applySetting() {
  engineRef.value?.setHardwareScalingLevel(scalingLevel.value)

  if (pipelineRef.value) {
    pipelineRef.value.samples = hasMultiSample.value ? 4 : 1
  }
}

watch([scalingLevel, hasMultiSample], applySetting)
</script>
