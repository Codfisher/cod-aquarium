<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="FXAA 分不出邊緣是誰的"
    caption="牆面是十六格見方的像素貼圖，格與格之間本來就該有硬邊。FXAA 拿畫好的成品去找亮度落差，那些硬邊也算落差，於是整片圖案被抹糊一層。多重取樣只動幾何邊緣，貼圖一個像素都沒被碰到。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.35"
    :camera-radius="5.4"
    :camera-target="[0, 1.4, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasFxaa"
      label="FXAA"
    />
    <demo-toggle
      v-model="hasMultiSample"
      label="多重取樣 ×4"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DefaultRenderingPipeline } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const hasFxaa = shallowRef(true)
const hasMultiSample = shallowRef(false)

const badge = computed(() => {
  if (hasFxaa.value && hasMultiSample.value)
    return '兩個一起開'
  if (hasFxaa.value)
    return 'FXAA：貼圖也跟著糊'
  if (hasMultiSample.value)
    return '多重取樣：只動幾何邊緣'

  return '什麼都不開'
})

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

  const sun = new DirectionalLight('sun', new Vector3(0.3, -0.5, -0.8), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.95, 0.85)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.9
  ambient.diffuse = new Color3(0.85, 0.9, 1)
  ambient.specular = new Color3(0, 0, 0)

  /**
   * 貼圖不做 mipmap
   *
   * 鏡頭貼得很近，本來就用不到縮小過的層級。
   * 留著只會讓「貼圖到底糊在哪一步」多一個變數
   */
  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({
    babylon,
    scene,
    name: 'stone-texture',
    hasMipmap: false,
  })
  stoneMaterial.specularColor = new Color3(0, 0, 0)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({
    babylon,
    scene,
    name: 'wood-texture',
    hasMipmap: false,
  })
  woodMaterial.specularColor = new Color3(0, 0, 0)

  /** 一面貼滿像素貼圖的牆，佔滿大半個畫面才看得出圖案被抹掉多少 */
  const wall = MeshBuilder.CreateBox('wall', { width: 6, height: 4, depth: 0.4 }, scene)
  wall.position.set(0, 1.6, -1.4)
  wall.material = stoneMaterial

  /** 一根斜柱擺在牆前面，同一張畫面上同時有幾何邊緣可以比 */
  const post = MeshBuilder.CreateBox('post', { width: 0.5, height: 4.2, depth: 0.5 }, scene)
  post.position.set(1.5, 1.7, 0.4)
  post.rotation.z = 0.2
  post.rotation.y = 0.4
  post.material = woodMaterial

  const pipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = true
  pipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  pipeline.bloomEnabled = false

  pipelineRef.value = pipeline

  applySetting()

  return () => {
    pipeline.dispose()
    pipelineRef.value = undefined
  }
}

function applySetting() {
  if (!pipelineRef.value)
    return

  pipelineRef.value.fxaaEnabled = hasFxaa.value
  pipelineRef.value.samples = hasMultiSample.value ? 4 : 1
}

watch([hasFxaa, hasMultiSample], applySetting)
</script>
