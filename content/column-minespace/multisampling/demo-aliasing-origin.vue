<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="一個像素只取一個樣本"
    caption="把像素放大，斜邊上那排階梯就是鋸齒本身。多重取樣不會讓像素變小，它是在同一個像素裡多問幾個位置，再把答案平均起來。"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 2.9"
    :camera-radius="11"
    :camera-target="[0, 1.2, 0]"
    :height="300"
  >
    <demo-slider
      v-model="scalingLevel"
      label="像素放大"
      :min="1"
      :max="8"
      :step="1"
      :digit="0"
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

const scalingLevel = shallowRef(4)
const hasMultiSample = shallowRef(false)

const renderWidth = shallowRef(0)
const renderHeight = shallowRef(0)

const badge = computed(() => `實際畫布 ${renderWidth.value} × ${renderHeight.value}`)

const engineRef = shallowRef<Engine>()
const pipelineRef = shallowRef<DefaultRenderingPipeline>()

function setupScene({ babylon, scene, engine, camera }: BabylonDemoContext) {
  const { Color3, Color4, MeshBuilder, StandardMaterial } = babylon

  scene.clearColor = new Color4(0.9, 0.93, 0.96, 1)

  /**
   * 一塊不吃光的深色板子
   *
   * 鋸齒是「邊界兩側的顏色差多少」的問題，與光照無關。
   * 關掉光照之後整塊都是同一個深色，斜邊上那排階梯才乾淨得看得清楚
   */
  const material = new StandardMaterial('slab', scene)
  material.disableLighting = true
  material.emissiveColor = new Color3(0.16, 0.18, 0.24)
  material.specularColor = new Color3(0, 0, 0)

  const slab = MeshBuilder.CreateBox('slab', { width: 1.1, height: 4.4, depth: 1.1 }, scene)
  slab.position.y = 1.6
  slab.material = material

  /** 一根斜柱，只有斜邊才顯得出階梯，正的邊剛好落在像素格上 */
  const post = MeshBuilder.CreateBox('post', { width: 0.7, height: 3.4, depth: 0.7 }, scene)
  post.position.set(2.6, 1.2, 0.6)
  post.rotation.z = 0.28
  post.rotation.y = 0.5
  post.material = material

  const bar = MeshBuilder.CreateBox('bar', { width: 5.4, height: 0.45, depth: 0.45 }, scene)
  bar.position.set(-1.2, 3.2, -1)
  bar.rotation.z = -0.12
  bar.material = material

  /**
   * 場景畫進管線的離屏貼圖，抗鋸齒也就由管線負責
   *
   * 這與本體的做法一致：canvas 自己那份多重取樣接不到幾何邊緣，
   * 真正在做事的是管線上的 samples
   */
  const pipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  pipeline.bloomEnabled = false
  pipeline.fxaaEnabled = false

  engineRef.value = engine
  pipelineRef.value = pipeline

  /** 慢慢轉，階梯會沿著邊緣爬，靜止的截圖看不出這件事 */
  const observer = scene.onBeforeRenderObservable.add(() => {
    slab.rotation.y += engine.getDeltaTime() / 8000
  })

  const sizeObserver = scene.onAfterRenderObservable.add(() => {
    renderWidth.value = engine.getRenderWidth()
    renderHeight.value = engine.getRenderHeight()
  })

  applySetting()

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    scene.onAfterRenderObservable.remove(sizeObserver)
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

<style scoped>
/**
 * 畫布放大時不要讓瀏覽器幫忙內插
 *
 * 內插等於替我們做了一次抗鋸齒，階梯會被抹平，那正是要看的東西
 */
:deep(.demo-canvas) {
  image-rendering: pixelated;
}
</style>
