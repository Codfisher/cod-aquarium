<template>
  <demo-frame
    :setup="setupScene"
    title="邊緣淡出與解析度"
    caption="關掉遮罩，倒影面那四個角就露出筆直的邊，水池像鋪了一塊玻璃。遮罩內圈往內收，淡出的那一圈就變寬。解析度那一項可以放心往下砍，倒影本來就不該比實景銳利，一方水池用二五六看不太出差別，但範圍一大就得跟著加回去。"
    :camera-alpha="-Math.PI / 2.2"
    :camera-beta="Math.PI / 3.4"
    :camera-radius="17"
    :camera-target="[0, 0.5, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="fadeEnabled"
      label="邊緣遮罩"
    />
    <demo-slider
      v-model="innerRatio"
      label="遮罩內圈"
      :min="0.1"
      :max="0.95"
      :step="0.05"
    />
    <demo-slider
      v-model="textureSize"
      label="倒影解析度"
      :min="32"
      :max="512"
      :step="32"
      :digit="0"
      unit=" px"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { AbstractMesh, DynamicTexture, MirrorTexture, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import {
  createFadeTexture,
  createMirrorScene,
  POOL_HALF_DEPTH,
  POOL_HALF_WIDTH,
  SURFACE_LIFT,
  SURFACE_Y,
} from './mirror-scene'

const fadeEnabled = shallowRef(true)
const innerRatio = shallowRef(0.62)
const textureSize = shallowRef(256)

const babylonModule = shallowRef<BabylonModule>()
const sceneRef = shallowRef<Scene>()
const mirrorMaterial = shallowRef<StandardMaterial>()
const mirrorTexture = shallowRef<MirrorTexture>()
const fadeTexture = shallowRef<DynamicTexture>()
const renderList = shallowRef<AbstractMesh[]>([])

/** 換解析度就得重開一張，算繪目標的邊長是建立時決定的 */
function rebuildMirrorTexture() {
  const babylon = babylonModule.value
  const scene = sceneRef.value
  const material = mirrorMaterial.value
  if (!babylon || !scene || !material)
    return

  mirrorTexture.value?.dispose()

  const texture = new babylon.MirrorTexture(
    'water-mirror',
    Math.round(textureSize.value),
    scene,
    true,
  )
  texture.mirrorPlane = new babylon.Plane(0, -1, 0, SURFACE_Y)
  texture.renderList = renderList.value

  material.reflectionTexture = texture
  material.reflectionTexture.level = 1
  mirrorTexture.value = texture
}

function rebuildFadeTexture() {
  const babylon = babylonModule.value
  const scene = sceneRef.value
  const material = mirrorMaterial.value
  if (!babylon || !scene || !material)
    return

  fadeTexture.value?.dispose()

  if (!fadeEnabled.value) {
    material.opacityTexture = null
    fadeTexture.value = undefined
    return
  }

  const texture = createFadeTexture(babylon, scene, innerRatio.value)
  material.opacityTexture = texture
  fadeTexture.value = texture
}

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const scenery = createMirrorScene(context)

  babylonModule.value = babylon
  sceneRef.value = scene
  renderList.value = [...scenery.skyMeshList, ...scenery.landmarkList]

  const material = new babylon.StandardMaterial('water-mirror-material', scene)
  material.diffuseColor = new babylon.Color3(0, 0, 0)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(0, 0, 0)
  material.disableLighting = true
  material.alpha = 0.55
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

  rebuildMirrorTexture()
  rebuildFadeTexture()

  return () => {
    babylonModule.value = undefined
    sceneRef.value = undefined
    mirrorMaterial.value = undefined
    mirrorTexture.value = undefined
    fadeTexture.value = undefined
    renderList.value = []
  }
}

watch(textureSize, rebuildMirrorTexture)
watch([fadeEnabled, innerRatio], rebuildFadeTexture)
</script>
