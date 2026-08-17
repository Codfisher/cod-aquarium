<template>
  <demo-frame
    :setup="setupScene"
    title="雲的細胞自動機與面剔除"
    caption="平滑輪數決定零散的格子聚不聚得成一朵雲，剝團上限則負責把黏成一片的大塊削開。關掉面剔除之後，相鄰兩格之間那兩片牆照樣會畫出來，隔著半透明的雲面看過去就是一格一格的框線。"
    :camera-alpha="-Math.PI / 2.3"
    :camera-beta="Math.PI / 3.4"
    :camera-radius="170"
    :camera-target="[0, 0, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasFaceCulling"
      label="只畫露在外面的面"
    />
    <demo-slider
      v-model="smoothPass"
      label="平滑輪數"
      :min="0"
      :max="6"
      :step="1"
      :digit="0"
    />
    <demo-slider
      v-model="maxCellCount"
      label="單朵上限"
      :min="4"
      :max="60"
      :step="2"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh, Scene } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'

const hasFaceCulling = shallowRef(true)
const smoothPass = shallowRef(4)
const maxCellCount = shallowRef(10)

/** 與本體同一組規格，格數乘上格寬剛好等於世界寬度 */
const PATTERN_COUNT = 18
const CLOUD_CELL_SIZE = 14
const CLOUD_THICKNESS = 5

const context = shallowRef<{
  babylon: BabylonModule;
  scene: Scene;
  mesh: Mesh;
}>()

function createSeededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function readCell(grid: boolean[], x: number, z: number): boolean {
  /** 座標繞回去，圖樣才能無縫平鋪 */
  const wrappedX = ((x % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
  const wrappedZ = ((z % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
  return grid[wrappedZ * PATTERN_COUNT + wrappedX] === true
}

/** 標記每一團的大小，剝團時要靠它決定誰該瘦身 */
function labelComponentSizeList(grid: boolean[]): number[] {
  const labelList = Array.from({ length: grid.length }, () => -1)
  const sizeList: number[] = []

  for (let index = 0; index < grid.length; index++) {
    if (!grid[index] || labelList[index] !== -1)
      continue

    const label = sizeList.length
    const queue = [index]
    labelList[index] = label
    let size = 0

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]!
      size++
      const x = current % PATTERN_COUNT
      const z = Math.floor(current / PATTERN_COUNT)

      for (const step of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextX = ((x + step[0]!) % PATTERN_COUNT + PATTERN_COUNT) % PATTERN_COUNT
        const nextZ = ((z + step[1]!) % PATTERN_COUNT + PATTERN_COUNT) % PATTERN_COUNT
        const nextIndex = nextZ * PATTERN_COUNT + nextX
        if (!grid[nextIndex] || labelList[nextIndex] !== -1)
          continue

        labelList[nextIndex] = label
        queue.push(nextIndex)
      }
    }

    sizeList.push(size)
  }

  return labelList.map((label) => (label === -1 ? 0 : sizeList[label]!))
}

function buildPattern(passCount: number, cellLimit: number): boolean[] {
  const random = createSeededRandom(20260821)
  let cellList = Array.from(
    { length: PATTERN_COUNT * PATTERN_COUNT },
    () => random() < 0.34,
  )

  /** 平滑幾輪，讓零散的格子聚成一朵一朵的雲 */
  for (let pass = 0; pass < passCount; pass++) {
    const nextList = cellList.slice()
    for (let x = 0; x < PATTERN_COUNT; x++) {
      for (let z = 0; z < PATTERN_COUNT; z++) {
        let neighborCount = 0
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
            if (offsetX === 0 && offsetZ === 0)
              continue
            if (readCell(cellList, x + offsetX, z + offsetZ))
              neighborCount++
          }
        }
        nextList[z * PATTERN_COUNT + x] = neighborCount > 4
          || (neighborCount === 4 && readCell(cellList, x, z))
      }
    }
    cellList = nextList
  }

  /** 把過大的雲團由外往內剝一圈，剝到符合上限為止 */
  for (let pass = 0; pass < 6; pass++) {
    const sizeList = labelComponentSizeList(cellList)
    if (sizeList.every((size) => size <= cellLimit))
      break

    const nextList = cellList.slice()
    for (let x = 0; x < PATTERN_COUNT; x++) {
      for (let z = 0; z < PATTERN_COUNT; z++) {
        const index = z * PATTERN_COUNT + x
        if (sizeList[index]! <= cellLimit)
          continue

        const isEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some((step) => !readCell(cellList, x + step[0]!, z + step[1]!))
        if (isEdge) {
          nextList[index] = false
        }
      }
    }
    cellList = nextList
  }

  return cellList
}

function buildMesh() {
  const current = context.value
  if (!current)
    return

  const { babylon, mesh } = current
  const cellList = buildPattern(smoothPass.value, maxCellCount.value)

  const positionList: number[] = []
  const normalList: number[] = []
  const indexList: number[] = []

  const addQuad = (
    cornerList: [number, number, number][],
    normal: [number, number, number],
  ) => {
    const baseIndex = positionList.length / 3
    for (const corner of cornerList) {
      positionList.push(corner[0], corner[1], corner[2])
      normalList.push(normal[0], normal[1], normal[2])
    }
    indexList.push(
      baseIndex,
      baseIndex + 1,
      baseIndex + 2,
      baseIndex,
      baseIndex + 2,
      baseIndex + 3,
    )
  }

  const half = PATTERN_COUNT / 2
  const isFilled = (x: number, z: number) => {
    if (x < -half || x >= half || z < -half || z >= half)
      return false
    return readCell(cellList, x, z)
  }

  const halfThickness = CLOUD_THICKNESS / 2

  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      if (!isFilled(x, z))
        continue

      const minX = x * CLOUD_CELL_SIZE
      const maxX = minX + CLOUD_CELL_SIZE
      const minZ = z * CLOUD_CELL_SIZE
      const maxZ = minZ + CLOUD_CELL_SIZE

      addQuad([
        [minX, halfThickness, minZ],
        [minX, halfThickness, maxZ],
        [maxX, halfThickness, maxZ],
        [maxX, halfThickness, minZ],
      ], [0, 1, 0])

      addQuad([
        [minX, -halfThickness, maxZ],
        [minX, -halfThickness, minZ],
        [maxX, -halfThickness, minZ],
        [maxX, -halfThickness, maxZ],
      ], [0, -1, 0])

      /**
       * 面剔除
       *
       * 關掉時四個側面一律畫，那正是「看起來像用積木拼的」的原因
       */
      const shouldSkip = (neighborX: number, neighborZ: number) =>
        hasFaceCulling.value && isFilled(neighborX, neighborZ)

      if (!shouldSkip(x - 1, z)) {
        addQuad([
          [minX, halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, -halfThickness, maxZ],
          [minX, halfThickness, maxZ],
        ], [-1, 0, 0])
      }
      if (!shouldSkip(x + 1, z)) {
        addQuad([
          [maxX, halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, -halfThickness, minZ],
          [maxX, halfThickness, minZ],
        ], [1, 0, 0])
      }
      if (!shouldSkip(x, z - 1)) {
        addQuad([
          [maxX, halfThickness, minZ],
          [maxX, -halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, halfThickness, minZ],
        ], [0, 0, -1])
      }
      if (!shouldSkip(x, z + 1)) {
        addQuad([
          [minX, halfThickness, maxZ],
          [minX, -halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, halfThickness, maxZ],
        ], [0, 0, 1])
      }
    }
  }

  const vertexData = new babylon.VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.indices = indexList
  vertexData.applyToMesh(mesh, true)
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { Color3, HemisphericLight, Mesh, StandardMaterial, Vector3 } = babylon

  scene.clearColor = new babylon.Color4(0.42, 0.62, 0.9, 1)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.95
  ambient.diffuse = new Color3(1, 1, 1)
  ambient.groundColor = new Color3(0.7, 0.74, 0.82)
  ambient.specular = new Color3(0, 0, 0)

  const material = new StandardMaterial('cloud', scene)
  material.diffuseColor = new Color3(1, 1, 1)
  material.specularColor = new Color3(0, 0, 0)
  material.backFaceCulling = true
  material.alpha = 0.72
  /** 少了深度預寫，同一片雲自己的前後面會互相疊色 */
  material.needDepthPrePass = true

  const mesh = new Mesh('cloud-layer', scene)
  mesh.material = material

  context.value = { babylon, scene, mesh }
  buildMesh()
}

watch([hasFaceCulling, smoothPass, maxCellCount], buildMesh)
</script>
