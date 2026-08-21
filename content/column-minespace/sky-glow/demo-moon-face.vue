<template>
  <demo-frame
    :setup="setup"
    :camera-radius="13"
    :camera-beta="1.5708"
    :camera-alpha="-1.5708"
    :interactive="false"
    :clear-color="[0.04, 0.05, 0.1, 1]"
    title="月面的三階明暗，以及取樣模式"
    caption="三階全關就是一塊沒有表情的白方塊。月海撐出大塊的斑，坑補上第三層深度，暗角讓平的方塊看起來有一點球的錯覺。取樣模式換成雙線性之後，十六格的貼圖被拉大三十倍，硬邊整個化掉。"
  >
    <demo-toggle
      v-model="seaVisible"
      label="月海"
    />
    <demo-toggle
      v-model="craterVisible"
      label="坑"
    />
    <demo-toggle
      v-model="shadeVisible"
      label="暗角"
    />
    <demo-toggle
      v-model="isNearest"
      label="最近鄰取樣"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createMoonTexture, createSkyBodyMaterial } from './sky-texture'

const seaVisible = ref(true)
const craterVisible = ref(true)
const shadeVisible = ref(true)
const isNearest = ref(true)

const moonMaterial = shallowRef<StandardMaterial>()
const moonScene = shallowRef<Scene>()
const babylonModule = shallowRef<BabylonModule>()

/** 換設定就重畫一張，舊的那張要收掉，不然每拉一次開關就多留一張貼圖 */
let currentTexture: DynamicTexture | undefined

function applyFace() {
  const material = moonMaterial.value
  const scene = moonScene.value
  const babylon = babylonModule.value
  if (!material || !scene || !babylon)
    return

  const texture = createMoonTexture(babylon, scene, `moon-${Date.now()}`, {
    seaVisible: seaVisible.value,
    craterVisible: craterVisible.value,
    shadeVisible: shadeVisible.value,
    isNearest: isNearest.value,
  })

  material.diffuseTexture = texture
  currentTexture?.dispose()
  currentTexture = texture
}

function setup({ babylon, scene }: BabylonDemoContext) {
  const texture = createMoonTexture(babylon, scene, 'moon-face')
  const material = createSkyBodyMaterial(babylon, scene, 'moon-face-material', texture)

  const disc = babylon.MeshBuilder.CreatePlane('moon-face', { size: 8 }, scene)
  disc.material = material
  disc.isPickable = false

  currentTexture = texture
  moonMaterial.value = material
  moonScene.value = scene
  babylonModule.value = babylon

  return () => {
    moonMaterial.value = undefined
    moonScene.value = undefined
    babylonModule.value = undefined
    currentTexture = undefined
  }
}

watch([seaVisible, craterVisible, shadeVisible, isNearest], applyFace)
</script>
