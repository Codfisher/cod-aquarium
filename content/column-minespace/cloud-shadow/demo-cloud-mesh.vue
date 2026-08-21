<template>
  <demo-frame
    :setup="setup"
    :camera-radius="95"
    :camera-beta="2.05"
    :camera-alpha="-1.2"
    :camera-target="[0, 40, 0]"
    :height="320"
    title="方塊雲的網格與面剔除"
    caption="整片雲是一個網格，所以只花一次 draw call。關掉面剔除之後，相鄰兩格之間那兩片牆照樣畫出來，隔著半透明的雲面看過去就是一格一格的框線交錯在一起，看起來像用積木拼的。把不透明度往下拉最明顯。"
  >
    <demo-toggle
      v-model="isCulled"
      label="面剔除"
    />
    <demo-slider
      v-model="opacity"
      label="不透明度"
      :min="0.15"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { ref, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createCloudMesh, createCloudPattern, createSeededRandom } from './cloud-pattern'

const isCulled = ref(true)
const opacity = ref(0.5)

const PATTERN_COUNT = 20
const CELL_SIZE = 14
const THICKNESS = 5
const CLOUD_HEIGHT = 40

const cloudMeshList = shallowRef<Mesh[]>([])
const cloudMaterial = shallowRef<StandardMaterial>()

function setup({ babylon, scene }: BabylonDemoContext) {
  scene.clearColor = new babylon.Color4(0.42, 0.62, 0.86, 1)

  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.95
  ambient.diffuse = new babylon.Color3(0.9, 0.94, 1)
  ambient.groundColor = new babylon.Color3(0.72, 0.76, 0.84)
  ambient.specular = new babylon.Color3(0, 0, 0)

  const material = new babylon.StandardMaterial('cloud-material', scene)
  material.diffuseColor = new babylon.Color3(1, 1, 1)
  material.specularColor = new babylon.Color3(0, 0, 0)
  material.emissiveColor = new babylon.Color3(0.42, 0.45, 0.5)
  material.backFaceCulling = false

  const cellList = createCloudPattern(
    createSeededRandom(20260820),
    PATTERN_COUNT,
    0.22,
    [
      { density: 0.28, weight: 1 },
      { density: 0.7, weight: 0.35 },
    ],
  )

  /**
   * 兩份網格先做好，切換時只換顯示
   *
   * 每拉一次開關就重建一次網格的話，那一瞬間會卡住
   */
  const meshList = (['culled', 'full'] as const).map((kind) => {
    const mesh = createCloudMesh({
      babylon,
      scene,
      name: `cloud-${kind}`,
      cellList,
      patternCount: PATTERN_COUNT,
      cellSize: CELL_SIZE,
      thickness: THICKNESS,
      tileCount: 3,
      isCulled: kind === 'culled',
    })
    mesh.material = material
    mesh.position.y = CLOUD_HEIGHT

    return mesh
  })

  cloudMeshList.value = meshList
  cloudMaterial.value = material
  applySetting()

  return () => {
    cloudMeshList.value = []
    cloudMaterial.value = undefined
  }
}

function applySetting() {
  const material = cloudMaterial.value
  if (!material)
    return

  material.alpha = opacity.value

  for (const [index, mesh] of cloudMeshList.value.entries()) {
    mesh.setEnabled(index === 0 ? isCulled.value : !isCulled.value)
  }
}

watch([isCulled, opacity], applySetting)
</script>
