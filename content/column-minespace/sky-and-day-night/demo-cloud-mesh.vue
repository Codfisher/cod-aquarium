<template>
  <demo-frame
    :setup="setupScene"
    title="雲的圖樣與面剔除"
    caption="覆蓋率決定天空被蓋掉幾成，說幾成就是幾成；細節權重是高頻那一層噪音的份量，給零每朵雲都圓滾滾的像水滴，加上去才咬得出缺口。關掉面剔除之後，相鄰兩格之間那兩片牆照樣會畫出來，隔著半透明的雲面看過去就是一格一格的框線。"
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
      v-model="coverage"
      label="覆蓋率"
      :min="0.05"
      :max="0.45"
      :step="0.01"
      :digit="2"
    />
    <demo-slider
      v-model="detailWeight"
      label="細節權重"
      :min="0"
      :max="0.8"
      :step="0.05"
      :digit="2"
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
const coverage = shallowRef(0.14)
const detailWeight = shallowRef(0.35)

/** 與本體同一組規格，格數乘上格寬剛好等於世界寬度（20 × 14 = 280） */
const PATTERN_COUNT = 20
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

/** 兩端斜率都是零，格點之間才看不出直線的痕跡 */
function smoothRatio(ratio: number): number {
  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 可平鋪的值噪音
 *
 * 讀格點時座標繞回去，放大出來就是無縫的。
 * simplex 那類函式沒有週期，接縫上兩側的值對不起來
 */
function createTileableNoise(
  random: () => number,
  pointCount: number,
): number[] {
  const pointList = Array.from({ length: pointCount * pointCount }, () => random())
  const readPoint = (x: number, z: number) => {
    const wrappedX = ((x % pointCount) + pointCount) % pointCount
    const wrappedZ = ((z % pointCount) + pointCount) % pointCount
    return pointList[wrappedZ * pointCount + wrappedX] ?? 0
  }

  const scale = pointCount / PATTERN_COUNT
  return Array.from({ length: PATTERN_COUNT * PATTERN_COUNT }, (_, index) => {
    const x = (index % PATTERN_COUNT) * scale
    const z = Math.floor(index / PATTERN_COUNT) * scale
    const baseX = Math.floor(x)
    const baseZ = Math.floor(z)
    const ratioX = smoothRatio(x - baseX)
    const ratioZ = smoothRatio(z - baseZ)

    const top = readPoint(baseX, baseZ) * (1 - ratioX)
      + readPoint(baseX + 1, baseZ) * ratioX
    const bottom = readPoint(baseX, baseZ + 1) * (1 - ratioX)
      + readPoint(baseX + 1, baseZ + 1) * ratioX

    return top * (1 - ratioZ) + bottom * ratioZ
  })
}

function buildPattern(targetCoverage: number, detail: number): boolean[] {
  const random = createSeededRandom(20260821)

  /** 低頻決定一朵雲多大，高頻負責在邊緣咬出缺口 */
  const baseList = createTileableNoise(random, PATTERN_COUNT / 2)
  const detailList = createTileableNoise(random, PATTERN_COUNT)
  const fieldList = baseList.map(
    (value, index) => value + (detailList[index] ?? 0) * detail,
  )

  /**
   * 門檻取分位數而不是給定值
   *
   * 排完序取第 N 名，說覆蓋幾成就真的是幾成
   */
  const sortedList = fieldList.slice().sort((a, b) => b - a)
  const threshold = sortedList[Math.floor(sortedList.length * targetCoverage)] ?? Infinity

  return fieldList.map((value) => value > threshold)
}

function buildMesh() {
  const current = context.value
  if (!current)
    return

  const { babylon, mesh } = current
  const cellList = buildPattern(coverage.value, detailWeight.value)

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

watch([hasFaceCulling, coverage, detailWeight], buildMesh)
</script>
