<template>
  <demo-frame
    :setup="setupScene"
    title="把環境遮蔽烘進實例顏色"
    caption="Thin Instance 支援每個實例一個顏色，著色器會拿去乘上貼圖顏色。遮蔽由 Worker 算好之後直接烘進緩衝區，執行期沒有任何額外成本。關掉之後整片牆會平得像貼紙，角落與凹處的層次全部消失。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 3"
    :camera-radius="20"
    :camera-target="[0, 2, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasOcclusion"
      label="環境遮蔽"
    />
    <demo-slider
      v-model="occlusionDepth"
      label="遮蔽深度"
      :min="0"
      :max="0.8"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createStoneTexture } from '../demo/pixel-texture'

const hasOcclusion = shallowRef(true)
const occlusionDepth = shallowRef(0.45)

const blockMesh = shallowRef<Mesh>()
/** 每一顆方塊被鄰居擋住的程度，0 是全露、1 是埋得最深 */
const occlusionList = shallowRef<number[]>([])

/**
 * 一小段有凹凸的地景
 *
 * 遮蔽要有角落與凹處才看得出來，一片平地是量不出東西的
 */
function createBlockList(): [number, number, number][] {
  const blockList: [number, number, number][] = []

  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 6; z++) {
      /** 兩道交叉的低牆加中央一個凹坑，角落最多 */
      const distance = Math.hypot(x, z)
      const isWall = Math.abs(x) === 4 || Math.abs(z) === 4
      const height = isWall ? 3 : distance < 2 ? 0 : 1

      for (let y = 0; y < height; y++) {
        blockList.push([x, y, z])
      }
    }
  }

  return blockList
}

/**
 * 逐格數鄰居，鄰居越多越暗
 *
 * 這是最土法煉鋼的遮蔽，但道理與本體一樣：
 * 算好之後直接烘進顏色，執行期一毛錢都不用付
 */
function measureOcclusionList(blockList: [number, number, number][]): number[] {
  const filledSet = new Set(blockList.map(([x, y, z]) => `${x},${y},${z}`))

  return blockList.map(([x, y, z]) => {
    let neighborCount = 0

    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
          if (offsetX === 0 && offsetY === 0 && offsetZ === 0)
            continue
          if (filledSet.has(`${x + offsetX},${y + offsetY},${z + offsetZ}`))
            neighborCount++
        }
      }
    }

    return Math.min(1, neighborCount / 18)
  })
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.7, -0.45), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.85
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const material = new StandardMaterial('stone', scene)
  material.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  material.specularColor = new Color3(0.02, 0.02, 0.02)

  const box = MeshBuilder.CreateBox('block', { size: 1 }, scene)
  box.material = material
  box.alwaysSelectAsActiveMesh = true

  const blockList = createBlockList()
  const matrixBuffer = new Float32Array(blockList.length * 16)

  for (const [index, [x, y, z]] of blockList.entries()) {
    babylon.Matrix.Translation(x, y + 0.5, z).copyToArray(matrixBuffer, index * 16)
  }

  box.thinInstanceSetBuffer('matrix', matrixBuffer, 16, true)
  box.doNotSyncBoundingInfo = true

  blockMesh.value = box
  occlusionList.value = measureOcclusionList(blockList)

  applySetting()

  return () => {
    blockMesh.value = undefined
    occlusionList.value = []
  }
}

function applySetting() {
  const box = blockMesh.value
  const shadeList = occlusionList.value
  if (!box || shadeList.length === 0)
    return

  const colorBuffer = new Float32Array(shadeList.length * 4)
  const depth = hasOcclusion.value ? occlusionDepth.value : 0

  for (const [index, occlusion] of shadeList.entries()) {
    const shade = 1 - occlusion * depth
    colorBuffer[index * 4] = shade
    colorBuffer[index * 4 + 1] = shade
    colorBuffer[index * 4 + 2] = shade
    colorBuffer[index * 4 + 3] = 1
  }

  /** 每個實例一個顏色，著色器會拿去乘上貼圖顏色 */
  box.thinInstanceSetBuffer('color', colorBuffer, 4, true)
}

watch([hasOcclusion, occlusionDepth], applySetting)
</script>
