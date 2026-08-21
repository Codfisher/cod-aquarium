<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="光一輪一輪傳出去"
    caption="每一輪做兩件事，實心格先收集開放鄰居手上的光，接著開放格再把實心鄰居反射回來的光收回去。輪數為零時空氣裡什麼都沒有；跑個三四輪，貼著紅牆的空氣就泛紅、貼著綠牆的泛綠了。畫出來的亮度有放大，實際疊進畫面時只佔兩成二。"
    :camera-alpha="-Math.PI / 4"
    :camera-beta="Math.PI / 3.2"
    :camera-radius="34"
    :camera-target="WORLD_CENTER"
    :height="320"
  >
    <demo-slider
      v-model="bouncePassCount"
      label="反彈輪數"
      :min="0"
      :max="6"
      :step="1"
      :digit="0"
      unit=" 輪"
    />
    <demo-slider
      v-model="bounceStrength"
      label="每輪保留"
      :min="0.05"
      :max="0.6"
      :step="0.05"
      :digit="2"
    />
    <demo-toggle
      v-model="lampEnabled"
      label="燈火種子"
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
import { bakeIndirectLight, buildGiGrid, createDemoWorld } from './gi-world'

/** 間接光本來就很淡，畫成方塊時放大幾倍才看得出顏色 */
const DISPLAY_GAIN = 3.2
/** 低於這個亮度的格子不畫，不然整個空間會塞滿幾乎全黑的方塊 */
const VISIBLE_THRESHOLD = 0.012

const bouncePassCount = shallowRef(4)
const bounceStrength = shallowRef(0.35)
const lampEnabled = shallowRef(true)

const world = createDemoWorld()
const grid = buildGiGrid(world, 2, 2)

const indirectList = computed(() => bakeIndirectLight(grid, {
  world,
  sunColor: [1, 0.96, 0.88],
  sunStrength: 1,
  bouncePassCount: bouncePassCount.value,
  bounceStrength: bounceStrength.value,
  lampEnabled: lampEnabled.value,
}))

const badge = computed(() => {
  const list = indirectList.value
  let count = 0
  for (let index = 0; index < list.length; index += 3) {
    if (Math.max(list[index]!, list[index + 1]!, list[index + 2]!) > VISIBLE_THRESHOLD) {
      count++
    }
  }

  return `${count} 格帶著間接光`
})

const babylonRef = shallowRef<BabylonModule>()
const sceneRef = shallowRef<Scene>()
const blockViewRef = shallowRef<DemoView>()
const lightViewRef = shallowRef<DemoView>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  addDemoLighting(babylon, scene)

  babylonRef.value = babylon
  sceneRef.value = scene
  blockViewRef.value = createBlockView(babylon, scene, world)

  rebuildLightView()

  return () => {
    lightViewRef.value?.dispose()
    blockViewRef.value?.dispose()
    lightViewRef.value = undefined
    blockViewRef.value = undefined
    babylonRef.value = undefined
    sceneRef.value = undefined
  }
}

function rebuildLightView() {
  const babylon = babylonRef.value
  const scene = sceneRef.value
  if (!babylon || !scene)
    return

  lightViewRef.value?.dispose()

  const list = indirectList.value

  lightViewRef.value = createCellView(babylon, scene, grid, {
    fillRatio: 0.55,
    alpha: 0.75,
    measureColor: (cellIndex) => {
      /** 只有開放格存光，實心格在這套算式裡只負責反射 */
      if (grid.solidList[cellIndex] === 1)
        return null

      const red = list[cellIndex * 3] ?? 0
      const green = list[cellIndex * 3 + 1] ?? 0
      const blue = list[cellIndex * 3 + 2] ?? 0
      if (Math.max(red, green, blue) <= VISIBLE_THRESHOLD)
        return null

      return [red * DISPLAY_GAIN, green * DISPLAY_GAIN, blue * DISPLAY_GAIN]
    },
  })
}

watch(indirectList, rebuildLightView)
</script>
