<template>
  <demo-frame
    :setup="setupScene"
    title="效能探針"
    caption="幀率只告訴你「慢」，不告訴你「慢在哪」。同樣是三十幀，卡在 CPU 送繪製呼叫、卡在 GPU 填畫素、卡在自己每幀跑的 JS，是三件完全不同的事，處方也完全相反。所以不挑重點量，是全部都量。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 3.2"
    :camera-radius="36"
    :height="300"
  >
    <demo-toggle
      v-model="isInstanced"
      label="用 Thin Instance"
    />
    <demo-slider
      v-model="blockCount"
      label="方塊數"
      :min="100"
      :max="1600"
      :step="100"
      :digit="0"
    />
  </demo-frame>

  <div class="probe-table not-prose">
    <div
      v-for="item in readingList"
      :key="item.label"
      class="probe-cell"
    >
      <span class="probe-label">{{ item.label }}</span>
      <span class="probe-value">{{ item.value }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Mesh, SceneInstrumentation } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createStoneTexture } from '../demo/pixel-texture'

const isInstanced = shallowRef(true)
const blockCount = shallowRef(600)

const MAX_BLOCK_COUNT = 1600

const reading = shallowRef({
  drawCallCount: 0,
  activeMeshCount: 0,
  triangleCount: 0,
  frameMs: 0,
  gpuMs: 0,
  meshSelectionMs: 0,
})

const readingList = computed(() => [
  { label: '繪製呼叫', value: `${reading.value.drawCallCount}` },
  { label: '作用中網格', value: `${reading.value.activeMeshCount}` },
  { label: '三角形', value: `${(reading.value.triangleCount / 1000).toFixed(1)}k` },
  { label: 'CPU 幀時間', value: `${reading.value.frameMs.toFixed(2)} ms` },
  {
    label: 'GPU 幀時間',
    /** 讀不到時是 0，這需要 EXT_disjoint_timer_query */
    value: reading.value.gpuMs > 0 ? `${reading.value.gpuMs.toFixed(2)} ms` : '讀不到',
  },
  { label: '挑選網格', value: `${reading.value.meshSelectionMs.toFixed(2)} ms` },
])

const meshList = shallowRef<Mesh[]>([])
const instancedMesh = shallowRef<Mesh>()

/** 每一顆方塊擺在哪，兩種畫法共用同一組座標 */
const positionList = createPositionList()

function createPositionList(): [number, number, number][] {
  let state = 20260825
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }

  return Array.from({ length: MAX_BLOCK_COUNT }, () => {
    const x = Math.round((random() - 0.5) * 44)
    const z = Math.round((random() - 0.5) * 44)
    const height = Math.round(random() * 3)

    return [x, height, z] as [number, number, number]
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

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.72, -0.45), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const material = new StandardMaterial('stone', scene)
  material.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  material.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 一顆一個網格的那一路 */
  meshList.value = positionList.map(([x, y, z], index) => {
    const box = MeshBuilder.CreateBox(`block-${index}`, { size: 1 }, scene)
    box.position.set(x, y + 0.5, z)
    box.material = material
    box.freezeWorldMatrix()
    box.setEnabled(false)

    return box
  })

  /** 全部共用一個網格的那一路 */
  const instanced = MeshBuilder.CreateBox('instanced', { size: 1 }, scene)
  instanced.material = material
  instanced.alwaysSelectAsActiveMesh = true
  instanced.setEnabled(false)
  instancedMesh.value = instanced

  /**
   * 這些量測本身也要花時間
   *
   * 平常完全不啟用，不看的時候不該讓它跑
   */
  const instrumentation: SceneInstrumentation = new babylon.SceneInstrumentation(scene)
  instrumentation.captureFrameTime = true
  instrumentation.captureActiveMeshesEvaluationTime = true

  const engineInstrumentation = new babylon.EngineInstrumentation(scene.getEngine())
  engineInstrumentation.captureGPUFrameTime = true

  /** 讀數更新間隔，每幀更新只是白白觸發重繪 */
  let elapsed = 0
  const observer = scene.onAfterRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    if (elapsed < 0.5)
      return

    elapsed = 0
    reading.value = {
      drawCallCount: instrumentation.drawCallsCounter.current,
      activeMeshCount: scene.getActiveMeshes().length,
      triangleCount: scene.getActiveIndices() / 3,
      frameMs: instrumentation.frameTimeCounter.lastSecAverage,
      gpuMs: engineInstrumentation.gpuFrameTimeCounter.lastSecAverage / 1e6,
      meshSelectionMs: instrumentation.activeMeshesEvaluationTimeCounter.lastSecAverage,
    }
  })

  applySetting()

  return () => {
    scene.onAfterRenderObservable.remove(observer)
    instrumentation.dispose()
    engineInstrumentation.dispose()
    meshList.value = []
    instancedMesh.value = undefined
  }
}

function applySetting() {
  const instanced = instancedMesh.value
  if (!instanced)
    return

  const count = blockCount.value

  if (isInstanced.value) {
    for (const mesh of meshList.value) {
      mesh.setEnabled(false)
    }

    const matrixBuffer = new Float32Array(count * 16)
    for (let index = 0; index < count; index++) {
      const [x, y, z] = positionList[index]!
      writeTranslation(matrixBuffer, index, x, y + 0.5, z)
    }

    /** 第四個參數是「這份緩衝區是靜態的」 */
    instanced.thinInstanceSetBuffer('matrix', matrixBuffer, 16, true)
    instanced.doNotSyncBoundingInfo = true
    instanced.setEnabled(true)
    return
  }

  instanced.setEnabled(false)
  meshList.value.forEach((mesh, index) => mesh.setEnabled(index < count))
}

/**
 * 就地寫一個平移矩陣
 *
 * 只是為了不必為了這件事把 Babylon 的 Matrix 一路傳下來，
 * 平移矩陣的內容本來就只有最後一行不是單位矩陣
 */
function writeTranslation(
  buffer: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
): void {
  const offset = index * 16
  buffer[offset] = 1
  buffer[offset + 5] = 1
  buffer[offset + 10] = 1
  buffer[offset + 12] = x
  buffer[offset + 13] = y
  buffer[offset + 14] = z
  buffer[offset + 15] = 1
}

watch([isInstanced, blockCount], applySetting)
</script>

<style scoped>
.probe-table {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.4rem 1rem;
  margin: -0.6rem 0 1.5rem;
  font-size: 13px;
}

@media (min-width: 640px) {
  .probe-table {
    grid-template-columns: repeat(3, 1fr);
  }
}

.probe-cell {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 4px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
}

.probe-label {
  color: #6b7280;
}

.probe-value {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  color: #374151;
  font-weight: 600;
}

:global(html.dark) .probe-cell {
  background: rgba(31, 41, 55, 0.5);
  border-color: #374151;
}

:global(html.dark) .probe-label { color: #9ca3af; }
:global(html.dark) .probe-value { color: #e5e7eb; }
</style>
