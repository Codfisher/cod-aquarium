<template>
  <demo-frame
    :setup="setup"
    :camera-alpha="Math.PI / 2"
    :camera-beta="1.33"
    :camera-radius="46"
    :camera-target="[0, 3, -38]"
    :height="320"
    title="單層與分層，差別在遠處"
    caption="單層陰影只罩得住鏡頭附近那一塊，走廊深處的柱子一根影子都沒有。把投影半徑拉大確實罩得到，代價是同一張貼圖要分給更大的一片地，近處的影子跟著糊掉。分層陰影把鏡頭前方依距離切成幾段，每一段各給一張貼圖，兩件事就同時成立了。"
  >
    <demo-toggle
      v-model="isCascaded"
      label="分層陰影"
    />
    <demo-slider
      v-model="halfExtent"
      label="單層投影半徑"
      :min="12"
      :max="70"
      :step="1"
      :digit="0"
      unit=" 格"
    />
    <demo-slider
      v-model="cascadeCount"
      label="層數"
      :min="2"
      :max="4"
      :step="1"
      :digit="0"
      unit=" 層"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh, Scene, ShadowGenerator } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import type { ShadowStage } from './shadow-stage'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createPillarRow, createShadowProps, createShadowStage } from './shadow-stage'

const isCascaded = ref(true)
const halfExtent = ref(22)
const cascadeCount = ref(4)

/** 兩種陰影用同一張貼圖尺寸，比的才是分層本身 */
const MAP_SIZE = 1024
const LIGHT_DISTANCE = 60
const SHADOW_DISTANCE = 150

const babylonModule = shallowRef<BabylonModule>()
const demoScene = shallowRef<Scene>()
const demoStage = shallowRef<ShadowStage>()
const shadowGenerator = shallowRef<ShadowGenerator>()

let casterList: Mesh[] = []

function setup({ babylon, scene }: BabylonDemoContext) {
  const stage = createShadowStage({
    babylon,
    scene,
    groundSize: 170,
    groundOffsetZ: -45,
  })

  stage.sun.shadowMinZ = 1
  stage.sun.shadowMaxZ = LIGHT_DISTANCE + 140

  casterList = [
    ...createShadowProps({ babylon, scene, stage }),
    ...createPillarRow({ babylon, scene, stage }),
  ]

  babylonModule.value = babylon
  demoScene.value = scene
  demoStage.value = stage
  rebuildGenerator()

  /**
   * 單層的投影範圍要跟著鏡頭走
   *
   * 分層那一邊要整個讓開。它依鏡頭的視錐自己算每一層的邊界，
   * 光源的位置對它沒有意義，照著單層的做法去挪只會把它的基準推走
   */
  const forward = new babylon.Vector3()
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (isCascaded.value || !scene.activeCamera)
      return

    forward.copyFrom(stage.sun.direction).normalize()
    stage.sun.position.copyFrom(scene.activeCamera.position)
      .subtractInPlace(forward.scale(LIGHT_DISTANCE))
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    casterList = []
    babylonModule.value = undefined
    demoScene.value = undefined
    demoStage.value = undefined
    shadowGenerator.value = undefined
  }
}

/**
 * 換陰影種類要整個重建
 *
 * 貼圖的邊長與分幾層都是建構時就決定的，事後改不了
 */
function rebuildGenerator() {
  const babylon = babylonModule.value
  const stage = demoStage.value
  if (!babylon || !stage)
    return

  shadowGenerator.value?.dispose()

  const generator = isCascaded.value
    ? new babylon.CascadedShadowGenerator(MAP_SIZE, stage.sun)
    : new babylon.ShadowGenerator(MAP_SIZE, stage.sun)

  generator.darkness = 0.05
  generator.bias = 0.0005
  generator.normalBias = 0.08
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = babylon.ShadowGenerator.QUALITY_MEDIUM
  generator.frustumEdgeFalloff = 0.2

  if (generator instanceof babylon.CascadedShadowGenerator) {
    generator.numCascades = cascadeCount.value
    /** 關著的話每一層的範圍會隨鏡頭轉動重貼視錐，邊緣跟著爬 */
    generator.stabilizeCascades = true
    /** 零是等距切，一是照對數切。零點八把像素往近處堆 */
    generator.lambda = 0.8
    generator.shadowMaxZ = SHADOW_DISTANCE
    generator.autoCalcDepthBounds = false
  }

  for (const mesh of casterList) {
    generator.addShadowCaster(mesh)
  }

  shadowGenerator.value = generator
  applyExtent()
}

/** 單層的正交範圍，分層那邊自己會算，設了也不會用到 */
function applyExtent() {
  const stage = demoStage.value
  if (!stage || isCascaded.value)
    return

  stage.sun.autoUpdateExtends = false
  stage.sun.orthoLeft = -halfExtent.value
  stage.sun.orthoRight = halfExtent.value
  stage.sun.orthoTop = halfExtent.value
  stage.sun.orthoBottom = -halfExtent.value
}

watch([isCascaded, cascadeCount], rebuildGenerator)
watch(halfExtent, applyExtent)
</script>
