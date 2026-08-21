<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="只畫露得出來的那些面"
    caption="這片地形有四百多顆方塊。六面全畫是兩千六百多個面，只留鄰居是空氣的那些面之後剩下不到四分之一，而畫面看起來一模一樣。切開一半就知道為什麼，埋在土裡的那些面誰也看不到。"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 3"
    :camera-radius="24"
    :camera-target="[0, 1.5, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="cullingEnabled"
      label="面剔除"
    />
    <demo-toggle
      v-model="crossSectionEnabled"
      label="切開一半"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createStoneTexture } from '../demo/pixel-texture'

const cullingEnabled = shallowRef(true)
const crossSectionEnabled = shallowRef(false)

const quadCount = shallowRef(0)
const badge = computed(() => `畫出來的面 ${quadCount.value}`)

/** 地形的格數與最高高度 */
const GRID_SIZE = 12
const MIN_HEIGHT = 1
const MAX_HEIGHT = 5
/** 切開的位置，留下遠離鏡頭的那一半，剖面才朝著讀者 */
const CUT_LINE = GRID_SIZE / 2

/**
 * 這一欄疊幾格高
 *
 * 用兩道正弦疊出起伏，每次重畫都長得一模一樣。
 * 換成亂數的話，切開關時整片地形會跟著換一副樣子
 */
function measureHeight(x: number, z: number): number {
  const wave = 3 + 1.4 * (Math.sin(x * 0.62) + Math.cos(z * 0.55))

  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(wave)))
}

interface TerrainData {
  positionList: number[];
  normalList: number[];
  uvList: number[];
  indexList: number[];
  quadCount: number;
}

/**
 * 逐面產生地形的頂點資料
 *
 * 剔除打開時，只有鄰居是空氣的那一面才畫。
 * 關掉時每一格照樣吐出六個面，包括埋在土裡誰也看不到的那些
 */
function createTerrainData(hasCulling: boolean, hasCrossSection: boolean): TerrainData {
  const positionList: number[] = []
  const normalList: number[] = []
  const uvList: number[] = []
  const indexList: number[] = []
  let quadCount = 0

  const isFilled = (x: number, y: number, z: number): boolean => {
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE)
      return false
    if (hasCrossSection && z < CUT_LINE)
      return false

    return y >= 0 && y < measureHeight(x, z)
  }

  const addQuad = (
    cornerList: [number, number, number][],
    normal: [number, number, number],
  ) => {
    const baseIndex = positionList.length / 3

    /** 貼圖是無方向的顆粒，四個角固定照同一個順序給就夠了 */
    const cornerUvList: [number, number][] = [[0, 1], [0, 0], [1, 0], [1, 1]]

    cornerList.forEach((corner, cornerIndex) => {
      positionList.push(corner[0], corner[1], corner[2])
      normalList.push(normal[0], normal[1], normal[2])
      uvList.push(cornerUvList[cornerIndex]![0], cornerUvList[cornerIndex]![1])
    })

    indexList.push(
      baseIndex,
      baseIndex + 1,
      baseIndex + 2,
      baseIndex,
      baseIndex + 2,
      baseIndex + 3,
    )
    quadCount++
  }

  /** 整片地形挪到原點附近，轉起來才是繞著中心 */
  const offset = GRID_SIZE / 2

  for (let x = 0; x < GRID_SIZE; x++) {
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let y = 0; y < MAX_HEIGHT; y++) {
        if (!isFilled(x, y, z))
          continue

        const minX = x - offset
        const maxX = minX + 1
        const minY = y
        const maxY = y + 1
        const minZ = z - offset
        const maxZ = minZ + 1

        const shouldDraw = (
          neighborX: number,
          neighborY: number,
          neighborZ: number,
        ) => !hasCulling || !isFilled(neighborX, neighborY, neighborZ)

        if (shouldDraw(x, y + 1, z)) {
          addQuad([
            [minX, maxY, minZ],
            [minX, maxY, maxZ],
            [maxX, maxY, maxZ],
            [maxX, maxY, minZ],
          ], [0, 1, 0])
        }
        if (shouldDraw(x, y - 1, z)) {
          addQuad([
            [minX, minY, maxZ],
            [minX, minY, minZ],
            [maxX, minY, minZ],
            [maxX, minY, maxZ],
          ], [0, -1, 0])
        }
        if (shouldDraw(x - 1, y, z)) {
          addQuad([
            [minX, maxY, minZ],
            [minX, minY, minZ],
            [minX, minY, maxZ],
            [minX, maxY, maxZ],
          ], [-1, 0, 0])
        }
        if (shouldDraw(x + 1, y, z)) {
          addQuad([
            [maxX, maxY, maxZ],
            [maxX, minY, maxZ],
            [maxX, minY, minZ],
            [maxX, maxY, minZ],
          ], [1, 0, 0])
        }
        if (shouldDraw(x, y, z - 1)) {
          addQuad([
            [maxX, maxY, minZ],
            [maxX, minY, minZ],
            [minX, minY, minZ],
            [minX, maxY, minZ],
          ], [0, 0, -1])
        }
        if (shouldDraw(x, y, z + 1)) {
          addQuad([
            [minX, maxY, maxZ],
            [minX, minY, maxZ],
            [maxX, minY, maxZ],
            [maxX, maxY, maxZ],
          ], [0, 0, 1])
        }
      }
    }
  }

  return { positionList, normalList, uvList, indexList, quadCount }
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { Color3, Color4, DirectionalLight, HemisphericLight, StandardMaterial, Vector3 } = babylon

  scene.clearColor = new Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.72, -0.45), scene)
  sun.intensity = 1.15
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const material = new StandardMaterial('stone', scene)
  material.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  material.specularColor = new Color3(0.02, 0.02, 0.02)
  /** 剖面要看得到內壁，背面不能剔掉 */
  material.backFaceCulling = false

  let terrainMesh: Mesh | undefined

  function rebuildTerrain() {
    terrainMesh?.dispose()

    const terrainData = createTerrainData(cullingEnabled.value, crossSectionEnabled.value)

    const mesh = new babylon.Mesh('terrain', scene)
    const vertexData = new babylon.VertexData()
    vertexData.positions = terrainData.positionList
    vertexData.normals = terrainData.normalList
    vertexData.uvs = terrainData.uvList
    vertexData.indices = terrainData.indexList
    vertexData.applyToMesh(mesh)

    mesh.material = material
    mesh.isPickable = false
    terrainMesh = mesh

    quadCount.value = terrainData.quadCount
  }

  const stopWatch = watch(
    [cullingEnabled, crossSectionEnabled],
    rebuildTerrain,
    { immediate: true },
  )

  return () => {
    stopWatch()
    terrainMesh?.dispose()
  }
}
</script>
