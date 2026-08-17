<template>
  <demo-frame
    :setup="setupScene"
    title="鏤空貼圖與 mipmap"
    caption="草是 alpha 全有全無的鏤空貼圖。開了 mipmap 之後，縮小時透明與不透明的邊界會被平均出 0.5 這種中間值，alpha test 判定要畫，於是遠處的草上方浮出一道細細的十字，那正是兩片交叉立板自己的輪廓。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.25"
    :camera-radius="15"
    :camera-target="[0, 1.2, -6]"
    :height="280"
  >
    <demo-toggle
      v-model="hasMipmap"
      label="開啟 mipmap"
    />
    <demo-toggle
      v-model="hasTwoSidedLighting"
      label="背面翻轉法線"
    />
    <demo-slider
      v-model="alphaCutOff"
      label="裁切門檻"
      :min="0.05"
      :max="0.95"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createPlantTexture, createSandTexture } from '../demo/pixel-texture'

const hasMipmap = shallowRef(true)
const alphaCutOff = shallowRef(0.5)
/**
 * 花草的法線已經統一改成朝上，再翻轉就會讓背面朝下而變暗
 *
 * 所以樹葉要開、花草要關，這一項與法線是一組的
 */
const hasTwoSidedLighting = shallowRef(false)

const plantMaterial = shallowRef<StandardMaterial>()
/** 兩張貼圖先做好，切換時只換掛上去的那一張 */
const mipmapTexture = shallowRef<DynamicTexture>()
const plainTexture = shallowRef<DynamicTexture>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    Material,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.4, -0.8, -0.45), scene)
  sun.intensity = 1.05
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.85
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene)
  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = sandMaterial

  const withMipmap = createPlantTexture({ babylon, scene, name: 'plant-mipmap', hasMipmap: true })
  withMipmap.hasAlpha = true
  const withoutMipmap = createPlantTexture({ babylon, scene, name: 'plant-plain', hasMipmap: false })
  withoutMipmap.hasAlpha = true

  mipmapTexture.value = withMipmap
  plainTexture.value = withoutMipmap

  const material = new StandardMaterial('plant', scene)
  material.useAlphaFromDiffuseTexture = true
  material.transparencyMode = Material.MATERIAL_ALPHATEST
  material.backFaceCulling = false
  material.twoSidedLighting = false
  material.specularColor = new Color3(0, 0, 0)
  plantMaterial.value = material

  /**
   * 草要一路排到遠處
   *
   * mipmap 的問題只在縮小時出現，全部擠在鏡頭前面是看不出來的
   */
  const source = MeshBuilder.CreatePlane('plant-source', { size: 1 }, scene)
  source.material = material
  source.isVisible = false

  const secondSource = MeshBuilder.CreatePlane('plant-source-2', { size: 1 }, scene)
  secondSource.rotation.y = Math.PI / 2
  secondSource.bakeCurrentTransformIntoVertices()
  secondSource.material = material
  secondSource.isVisible = false

  for (const mesh of [source, secondSource]) {
    const normalList = mesh.getVerticesData('normal')
    if (normalList) {
      for (let index = 0; index < normalList.length; index += 3) {
        normalList[index] = 0
        normalList[index + 1] = 1
        normalList[index + 2] = 0
      }
      mesh.setVerticesData('normal', normalList)
    }
  }

  const columnCount = 24
  const rowCount = 30
  const matrixList = new Float32Array(columnCount * rowCount * 16)
  let offset = 0

  for (let row = 0; row < rowCount; row++) {
    for (let column = 0; column < columnCount; column++) {
      const x = (column - columnCount / 2) * 0.9
      const z = -row * 0.9
      babylon.Matrix.Translation(x, 0.5, z).copyToArray(matrixList, offset * 16)
      offset++
    }
  }

  for (const mesh of [source, secondSource]) {
    mesh.isVisible = true
    mesh.thinInstanceSetBuffer('matrix', matrixList, 16, true)
    mesh.alwaysSelectAsActiveMesh = true
  }

  applySetting()
}

function applySetting() {
  const material = plantMaterial.value
  if (!material)
    return

  material.diffuseTexture = hasMipmap.value
    ? mipmapTexture.value ?? null
    : plainTexture.value ?? null
  material.alphaCutOff = alphaCutOff.value
  material.twoSidedLighting = hasTwoSidedLighting.value
}

watch([hasMipmap, alphaCutOff, hasTwoSidedLighting], applySetting)
</script>
