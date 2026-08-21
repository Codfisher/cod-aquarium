<template>
  <demo-frame
    :setup="setupScene"
    title="反射清單要放哪些東西"
    caption="把天空從清單裡拿掉，池面上就只剩岸邊的石燈籠；把地景拿掉則變成一塊開在地上的天窗，雲飄過去了，鳥居卻不在水裡。兩邊都要進來才是一面鏡子。倒影濃度決定水自己的顏色還留多少，給到滿就成了一面真的鏡子，水的存在感反而不見了。"
    :camera-alpha="-Math.PI / 2.2"
    :camera-beta="Math.PI / 2.9"
    :camera-radius="18"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="skyEnabled"
      label="映天空"
    />
    <demo-toggle
      v-model="landmarkEnabled"
      label="映地景"
    />
    <demo-slider
      v-model="mirrorStrength"
      label="倒影濃度"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { AbstractMesh, MirrorTexture, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
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

const skyEnabled = shallowRef(true)
const landmarkEnabled = shallowRef(true)
const mirrorStrength = shallowRef(0.5)

const mirrorTexture = shallowRef<MirrorTexture>()
const mirrorMaterial = shallowRef<StandardMaterial>()
const skyMeshList = shallowRef<AbstractMesh[]>([])
const landmarkList = shallowRef<AbstractMesh[]>([])

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const scenery = createMirrorScene(context)

  skyMeshList.value = scenery.skyMeshList
  landmarkList.value = scenery.landmarkList

  const texture = new babylon.MirrorTexture('water-mirror', 512, scene, true)
  /** 法線朝下、位移等於水面高度 */
  texture.mirrorPlane = new babylon.Plane(0, -1, 0, SURFACE_Y)
  mirrorTexture.value = texture

  const material = new babylon.StandardMaterial('water-mirror-material', scene)
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(0, 0, 0)
  material.disableLighting = true
  material.reflectionTexture = texture
  material.reflectionTexture.level = 1
  material.transparencyMode = babylon.Material.MATERIAL_ALPHABLEND
  material.backFaceCulling = true
  material.fogEnabled = false
  mirrorMaterial.value = material

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
    mirrorMaterial.value = undefined
    skyMeshList.value = []
    landmarkList.value = []
  }
}

function applySetting() {
  const texture = mirrorTexture.value
  const material = mirrorMaterial.value
  if (!texture || !material)
    return

  texture.renderList = [
    ...(skyEnabled.value ? skyMeshList.value : []),
    ...(landmarkEnabled.value ? landmarkList.value : []),
  ]
  material.alpha = mirrorStrength.value
}

watch([skyEnabled, landmarkEnabled, mirrorStrength], applySetting)
</script>
