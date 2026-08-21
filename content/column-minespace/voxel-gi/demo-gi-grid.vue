<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="把世界降採樣成粗網格"
    caption="一格粗格記兩件事，這裡大致是實心的還是開放的、以及這裡的反照色大致是什麼。切到天空可見度可以看到「上面壓了幾層實心」怎麼把天光收掉，懸空那塊石板底下那幾格明顯暗了一階。"
    :camera-alpha="-Math.PI / 4"
    :camera-beta="Math.PI / 3.2"
    :camera-radius="34"
    :camera-target="WORLD_CENTER"
    :height="320"
  >
    <demo-toggle
      v-model="cellVisible"
      label="顯示粗網格"
    />
    <demo-toggle
      v-model="skyVisibilityVisible"
      label="改看天空可見度"
    />
    <demo-slider
      v-model="cellSizeXZ"
      label="水平格距"
      :min="2"
      :max="8"
      :step="2"
      :digit="0"
      unit=" 格"
    />
    <demo-slider
      v-model="cellSizeY"
      label="垂直格距"
      :min="1"
      :max="4"
      :step="1"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import type { DemoView } from './gi-view'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { addDemoLighting, createBlockView, createCellView, WORLD_CENTER } from './gi-view'
import { buildGiGrid, createDemoWorld } from './gi-world'

const cellVisible = shallowRef(true)
const skyVisibilityVisible = shallowRef(false)
const cellSizeXZ = shallowRef(4)
const cellSizeY = shallowRef(2)

const world = createDemoWorld()

const grid = computed(() => buildGiGrid(world, cellSizeXZ.value, cellSizeY.value))

const badge = computed(() => {
  const current = grid.value
  return `${current.gridX} × ${current.gridY} × ${current.gridZ}，共 ${current.gridX * current.gridY * current.gridZ} 格`
})

const babylonRef = shallowRef<BabylonModule>()
const sceneRef = shallowRef<Scene>()
const blockViewRef = shallowRef<DemoView>()
const cellViewRef = shallowRef<DemoView>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  addDemoLighting(babylon, scene)

  babylonRef.value = babylon
  sceneRef.value = scene
  blockViewRef.value = createBlockView(babylon, scene, world)

  rebuildCellView()

  return () => {
    cellViewRef.value?.dispose()
    blockViewRef.value?.dispose()
    cellViewRef.value = undefined
    blockViewRef.value = undefined
    babylonRef.value = undefined
    sceneRef.value = undefined
  }
}

/**
 * 粗網格換了就整份重建
 *
 * 格距一改，格數與每一格的內容全都不一樣了，沒有東西可以沿用。
 * 這在本體是啟動時才付得起的成本，所以那邊換畫質並不會重建網格
 */
function rebuildCellView() {
  const babylon = babylonRef.value
  const scene = sceneRef.value
  if (!babylon || !scene)
    return

  cellViewRef.value?.dispose()
  cellViewRef.value = undefined

  /** 方塊本體在看粗網格時要讓開，不然外面那層會整個擋住 */
  for (const mesh of blockViewRef.value?.meshList ?? []) {
    mesh.setEnabled(!cellVisible.value)
  }

  if (!cellVisible.value)
    return

  const current = grid.value

  cellViewRef.value = createCellView(babylon, scene, current, {
    alpha: 0.9,
    measureColor: (cellIndex) => {
      if (skyVisibilityVisible.value) {
        /** 開放格才有天空可見度，實心格不畫 */
        if (current.solidList[cellIndex] === 1)
          return null

        const visibility = current.skyVisibilityList[cellIndex] ?? 0
        return [visibility, visibility * 0.94, visibility * 0.7]
      }

      /** 反照色只有實心格記得住，開放格沒有表面可以反光 */
      if (current.solidList[cellIndex] !== 1)
        return null

      return [
        current.albedoList[cellIndex * 3] ?? 0,
        current.albedoList[cellIndex * 3 + 1] ?? 0,
        current.albedoList[cellIndex * 3 + 2] ?? 0,
      ]
    },
  })
}

watch([cellVisible, skyVisibilityVisible, cellSizeXZ, cellSizeY], rebuildCellView)
</script>
