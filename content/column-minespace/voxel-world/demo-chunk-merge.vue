<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="區塊算完之後接成一條"
    caption="世界切成十六個區塊，是為了讓十六份計算能分頭跑。算完之後區塊就沒有用處了，把矩陣接成一條，全世界共用一個網格，繪製呼叫從十六掉到一。打開上色可以看出哪一塊是哪一塊。"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 3.1"
    :camera-radius="30"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="mergeEnabled"
      label="接成一條"
    />
    <demo-toggle
      v-model="chunkColorEnabled"
      label="區塊上色"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createStoneTexture } from '../demo/pixel-texture'

/** 一個區塊幾格見方、一共幾個區塊 */
const CHUNK_SIZE = 4
const CHUNKS_PER_AXIS = 4
const CHUNK_TOTAL = CHUNKS_PER_AXIS * CHUNKS_PER_AXIS
const GRID_SIZE = CHUNK_SIZE * CHUNKS_PER_AXIS
/** 每一欄疊幾層，只鋪表面那幾格就看得出地形 */
const LAYER_COUNT = 2

const mergeEnabled = shallowRef(true)
const chunkColorEnabled = shallowRef(true)

const drawCall = shallowRef(0)
const meshCount = computed(() => (mergeEnabled.value ? 1 : CHUNK_TOTAL))
const badge = computed(() => `網格 ${meshCount.value}  繪製呼叫 ${drawCall.value}`)

function measureHeight(x: number, z: number): number {
  const wave = 2 + 1.3 * (Math.sin(x * 0.55) + Math.cos(z * 0.48))

  return Math.max(1, Math.round(wave))
}

/**
 * 區塊的代表色
 *
 * 直接由色相算 RGB，再往白色靠一點。飽和度給滿的話，
 * 十六塊排在一起會像調色盤而不像地形
 */
function measureChunkColor(chunkIndex: number): [number, number, number] {
  const hue = (chunkIndex * 0.618) % 1
  const toChannel = (offset: number) => {
    const value = Math.abs(((hue * 6 + offset) % 6) - 3) - 1

    return Math.min(1, Math.max(0, value))
  }

  return [
    0.55 + 0.45 * toChannel(0),
    0.55 + 0.45 * toChannel(4),
    0.55 + 0.45 * toChannel(2),
  ]
}

interface ChunkData {
  positionList: [number, number, number][];
  color: [number, number, number];
}

/**
 * 分區塊算好每一顆方塊的座標
 *
 * 這一步在 Minespace 裡是打工仔的工作，每個區塊各算各的、互不相干。
 * 這裡的地形小到不必開執行緒，計算的切法是一樣的
 */
function createChunkDataList(): ChunkData[] {
  const offset = GRID_SIZE / 2

  return Array.from({ length: CHUNK_TOTAL }, (_unused, chunkIndex) => {
    const chunkX = Math.floor(chunkIndex / CHUNKS_PER_AXIS)
    const chunkZ = chunkIndex % CHUNKS_PER_AXIS
    const positionList: [number, number, number][] = []

    for (let stepX = 0; stepX < CHUNK_SIZE; stepX++) {
      for (let stepZ = 0; stepZ < CHUNK_SIZE; stepZ++) {
        const x = chunkX * CHUNK_SIZE + stepX
        const z = chunkZ * CHUNK_SIZE + stepZ
        const height = measureHeight(x, z)

        for (let layer = 0; layer < LAYER_COUNT; layer++) {
          positionList.push([x - offset, height - layer, z - offset])
        }
      }
    }

    return { positionList, color: measureChunkColor(chunkIndex) }
  })
}

const chunkDataList = createChunkDataList()

function createMatrixBuffer(
  babylon: BabylonModule,
  positionList: [number, number, number][],
): Float32Array {
  const buffer = new Float32Array(positionList.length * 16)

  positionList.forEach(([x, y, z], index) => {
    babylon.Matrix.Translation(x, y, z).copyToArray(buffer, index * 16)
  })

  return buffer
}

/** 每個實例一個顏色，著色器會拿去乘上貼圖 */
function createColorBuffer(
  instanceCount: number,
  color: [number, number, number],
): Float32Array {
  const buffer = new Float32Array(instanceCount * 4)

  for (let index = 0; index < instanceCount; index++) {
    buffer[index * 4] = color[0]
    buffer[index * 4 + 1] = color[1]
    buffer[index * 4 + 2] = color[2]
    buffer[index * 4 + 3] = 1
  }

  return buffer
}

function setupScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const { Color3, Color4, DirectionalLight, HemisphericLight, StandardMaterial, Vector3 } = babylon

  scene.clearColor = new Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.72, -0.45), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const material = new StandardMaterial('stone', scene)
  material.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  material.specularColor = new Color3(0.02, 0.02, 0.02)

  const createBlockMesh = (name: string): Mesh => {
    const mesh = babylon.MeshBuilder.CreateBox(name, { size: 1 }, scene)
    mesh.material = material
    mesh.isPickable = false
    mesh.freezeWorldMatrix()

    return mesh
  }

  /** 每個區塊各建一個網格，這是接成一條之前的樣子 */
  const chunkMeshList = chunkDataList.map((chunkData, chunkIndex) => {
    const mesh = createBlockMesh(`chunk-${chunkIndex}`)
    mesh.thinInstanceSetBuffer('matrix', createMatrixBuffer(babylon, chunkData.positionList), 16, true)
    mesh.doNotSyncBoundingInfo = true
    mesh.alwaysSelectAsActiveMesh = true

    return mesh
  })

  /** 全世界一個網格，各區塊的矩陣直接接在一起 */
  const mergedPositionList = chunkDataList.flatMap((chunkData) => chunkData.positionList)
  const mergedMesh = createBlockMesh('merged')
  mergedMesh.thinInstanceSetBuffer('matrix', createMatrixBuffer(babylon, mergedPositionList), 16, true)
  mergedMesh.doNotSyncBoundingInfo = true
  mergedMesh.alwaysSelectAsActiveMesh = true

  const instrumentation = new babylon.SceneInstrumentation(scene)
  instrumentation.captureFrameTime = false

  let elapsed = 0
  const observer = scene.onAfterRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    if (elapsed < 0.4)
      return

    elapsed = 0
    drawCall.value = instrumentation.drawCallsCounter.current
  })

  function applyColor(hasChunkColor: boolean) {
    chunkMeshList.forEach((mesh, chunkIndex) => {
      const chunkData = chunkDataList[chunkIndex]!
      mesh.thinInstanceSetBuffer(
        'color',
        createColorBuffer(
          chunkData.positionList.length,
          hasChunkColor ? chunkData.color : [1, 1, 1],
        ),
        4,
        true,
      )
    })

    const mergedColorList = chunkDataList.flatMap((chunkData) => {
      const color = hasChunkColor ? chunkData.color : ([1, 1, 1] as [number, number, number])

      return [...createColorBuffer(chunkData.positionList.length, color)]
    })
    mergedMesh.thinInstanceSetBuffer('color', new Float32Array(mergedColorList), 4, true)
  }

  const stopColorWatch = watch(chunkColorEnabled, applyColor, { immediate: true })

  const stopMergeWatch = watch(mergeEnabled, (isMerged) => {
    mergedMesh.setEnabled(isMerged)
    for (const mesh of chunkMeshList) {
      mesh.setEnabled(!isMerged)
    }
  }, { immediate: true })

  return () => {
    stopColorWatch()
    stopMergeWatch()
    scene.onAfterRenderObservable.remove(observer)
    instrumentation.dispose()
  }
}
</script>
