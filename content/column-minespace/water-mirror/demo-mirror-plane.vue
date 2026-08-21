<template>
  <demo-frame
    :setup="setupScene"
    title="鏡面方程式怎麼給"
    caption="法線朝下、位移等於水面高度，平面上的每一點滿足 -y + d = 0，也就是 y = d。把法線翻成朝上，整個倒影會映到水面上方去，鳥居會倒插在天上。位移給錯的話倒影會浮起來或沉下去，柱子與它的影子接不起來。"
    :camera-alpha="-Math.PI / 2.2"
    :camera-beta="Math.PI / 2.9"
    :camera-radius="18"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isNormalDown"
      label="法線朝下"
    />
    <demo-slider
      v-model="planeOffset"
      label="平面位移"
      :min="-2"
      :max="2"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { MirrorTexture } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import {
  createMirrorScene,
  POOL_HALF_DEPTH,
  POOL_HALF_WIDTH,
  SURFACE_LIFT,
  SURFACE_Y,
} from './mirror-scene'

const isNormalDown = shallowRef(true)
const planeOffset = shallowRef(SURFACE_Y)

const mirrorTexture = shallowRef<MirrorTexture>()
const babylonModule = shallowRef<BabylonModule>()

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const { skyMeshList, landmarkList } = createMirrorScene(context)

  const texture = new babylon.MirrorTexture('water-mirror', 512, scene, true)
  texture.renderList = [...skyMeshList, ...landmarkList]
  mirrorTexture.value = texture
  babylonModule.value = babylon

  const material = new babylon.StandardMaterial('water-mirror-material', scene)
  /** 只留倒影，其他通道全部關掉 */
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(0, 0, 0)
  material.disableLighting = true
  material.reflectionTexture = texture
  material.reflectionTexture.level = 1
  material.alpha = 0.6
  material.transparencyMode = babylon.Material.MATERIAL_ALPHABLEND
  material.backFaceCulling = true
  /** 倒影裡的東西已經各自吃過自己那一份霧，這裡再套一次會更灰 */
  material.fogEnabled = false

  const surface = babylon.MeshBuilder.CreateGround(
    'water-mirror-surface',
    { width: POOL_HALF_WIDTH * 2, height: POOL_HALF_DEPTH * 2 },
    scene,
  )
  surface.material = material
  surface.position.y = SURFACE_Y + SURFACE_LIFT
  surface.isPickable = false

  applySetting()

  return () => {
    mirrorTexture.value = undefined
    babylonModule.value = undefined
  }
}

function applySetting() {
  const texture = mirrorTexture.value
  const babylon = babylonModule.value
  if (!texture || !babylon)
    return

  texture.mirrorPlane = new babylon.Plane(
    0,
    isNormalDown.value ? -1 : 1,
    0,
    planeOffset.value,
  )
}

watch([isNormalDown, planeOffset], applySetting)
</script>
