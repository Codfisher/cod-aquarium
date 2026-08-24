<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="每個實例配一個顏色，把亮度直接烘進去"
    caption="thin instance 除了矩陣還可以配一份顏色，著色器會拿它去乘上貼圖。縫隙深處本來就該暗一點，這件事不必等到有全局光才做得到，建網格的時候順手算出來就好，執行時一毛錢都不用付。"
    :camera-alpha="-Math.PI / 2.7"
    :camera-beta="Math.PI / 2.7"
    :camera-radius="17"
    :camera-target="[0, 1.6, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="bakedEnabled"
      label="烘進去的亮度"
    />
    <demo-slider
      v-model="occlusionDepth"
      label="縫隙壓多暗"
      :min="0"
      :max="0.75"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createStoneTexture } from '../demo/pixel-texture'

const bakedEnabled = shallowRef(true)
const occlusionDepth = shallowRef(0.45)

const badge = computed(() =>
  bakedEnabled.value ? `縫隙 −${(occlusionDepth.value * 100).toFixed(0)}%` : '一律同一個亮度')

/** 縫隙挖在牆面正中央，眼睛高度那一列 */
const CREVICE_X = 0
const CREVICE_Y = 2

/**
 * 一座牆面挖了縫隙的矮牆
 *
 * 要看得出烘焙的效果就得有夠深的縫隙。單層牆不管直牆段還是轉角，
 * 每一格鄰居數都一樣多，算出來的亮度也一樣；只有前後左右真的被
 * 實心量體包住的縫隙深處才會比較暗，所以牆面中央特地挖了一道，
 * 背後再補一塊量體，做出這種格局
 */
const BLOCK_LIST: [number, number, number][] = []
for (let x = -4; x <= 4; x++) {
  for (let z = -4; z <= 4; z++) {
    /** 地板 */
    BLOCK_LIST.push([x, 0, z])
  }
}
for (let y = 1; y <= 3; y++) {
  for (let x = -4; x <= 4; x++) {
    if (x === CREVICE_X && y === CREVICE_Y)
      continue // 縫隙入口，這一格挖空

    BLOCK_LIST.push([x, y, -4])
  }
  for (let z = -3; z <= 4; z++) {
    BLOCK_LIST.push([-4, y, z])
  }
}
for (let x = CREVICE_X - 1; x <= CREVICE_X + 1; x++) {
  for (let y = 1; y <= 3; y++) {
    for (let z = -3; z <= -2; z++) {
      /** 縫隙旁邊補的量體，讓縫隙底那格前後左右都有鄰居 */
      BLOCK_LIST.push([x, y, z])
    }
  }
}

const blockSet = new Set(BLOCK_LIST.map(([x, y, z]) => `${x},${y},${z}`))

/**
 * 這一格被幾個鄰居圍著
 *
 * 最土法的環境光遮蔽，數六個方向裡有幾格是實心，藉此估計方塊埋得多深。
 * 單層牆的轉角其實跟直牆段鄰居數一樣多，只是換了兩個軸而已，不會比較暗；
 * 真正暗的是前後左右都被包住的縫隙深處，上面牆面中央那道縫隙就是
 * 特地做出這種格局
 */
function measureOcclusion(x: number, y: number, z: number): number {
  const offsetList: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]

  let count = 0
  for (const [dx, dy, dz] of offsetList) {
    if (blockSet.has(`${x + dx},${y + dy},${z + dz}`))
      count++
  }

  return count / offsetList.length
}

const blockMesh = shallowRef<Mesh>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { Color3, Color4, DirectionalLight, HemisphericLight, MeshBuilder, Matrix, StandardMaterial, Vector3 } = babylon

  scene.clearColor = new Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.666, -0.62, -0.416), scene)
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.intensity = 1.1

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)
  ambient.intensity = 0.85

  const material = new StandardMaterial('stone', scene)
  material.diffuseTexture = createStoneTexture({ babylon, scene, name: 'ao-stone' })
  material.specularColor = new Color3(0.02, 0.02, 0.02)

  const source = MeshBuilder.CreateBox('block', { size: 1 }, scene)
  source.material = material
  source.isPickable = false

  const matrixList = new Float32Array(BLOCK_LIST.length * 16)
  BLOCK_LIST.forEach(([x, y, z], index) => {
    Matrix.Translation(x, y, z).copyToArray(matrixList, index * 16)
  })

  /** 第三個參數是「這份緩衝區之後不會再改」，見前面那一節 */
  source.thinInstanceSetBuffer('matrix', matrixList, 16, true)

  blockMesh.value = source

  applyColor()
}

function applyColor() {
  const mesh = blockMesh.value
  if (!mesh)
    return

  const colorList = new Float32Array(BLOCK_LIST.length * 4)

  BLOCK_LIST.forEach(([x, y, z], index) => {
    const shade = bakedEnabled.value
      ? 1 - measureOcclusion(x, y, z) * occlusionDepth.value
      : 1

    colorList[index * 4] = shade
    colorList[index * 4 + 1] = shade
    colorList[index * 4 + 2] = shade
    colorList[index * 4 + 3] = 1
  })

  /**
   * 顏色這份要給 false
   *
   * 這個參數不是能不能更新的開關，thinInstanceSetBuffer 每次呼叫都會整批
   * 換一份新緩衝區，static 與否照樣會更新畫面。它只是告訴 WebGL 這塊
   * 記憶體會不會常常換資料，顏色在這裡會被開關頻繁重寫，給 false
   * 才是誠實的用量提示
   */
  mesh.thinInstanceSetBuffer('color', colorList, 4, false)
}

watch([bakedEnabled, occlusionDepth], applyColor)
</script>
