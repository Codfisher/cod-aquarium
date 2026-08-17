<template>
  <compare-grid
    title="一顆一個網格，還是全部共用一個網格"
    caption="兩邊畫出來的方塊數量完全一樣，差別只在左邊每一顆是獨立的網格、右邊全部是同一個網格的 thin instance。把數量拉上去，看左邊的繪製呼叫怎麼跟著爆炸。"
  >
    <demo-frame
      :setup="setupMeshScene"
      :badge="meshBadge"
      compact
      :camera-alpha="-Math.PI / 2.6"
      :camera-beta="Math.PI / 3.2"
      :camera-radius="34"
      :height="240"
    />
    <demo-frame
      :setup="setupInstanceScene"
      :badge="instanceBadge"
      compact
      :camera-alpha="-Math.PI / 2.6"
      :camera-beta="Math.PI / 3.2"
      :camera-radius="34"
      :height="240"
    />
  </compare-grid>

  <div class="demo-shared-controls not-prose">
    <demo-slider
      v-model="blockCount"
      label="方塊數"
      :min="50"
      :max="1200"
      :step="50"
      :digit="0"
    />
  </div>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import CompareGrid from '../demo/compare-grid.vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createStoneTexture } from '../demo/pixel-texture'

/** 上限先全部建好，滑桿只是決定顯示前幾顆，才不必每次重建場景 */
const MAX_BLOCK_COUNT = 1200

const blockCount = shallowRef(400)

const meshDrawCall = shallowRef(0)
const instanceDrawCall = shallowRef(0)

const meshBadge = computed(() => `獨立網格  繪製呼叫 ${meshDrawCall.value}`)
const instanceBadge = computed(() => `Thin Instance  繪製呼叫 ${instanceDrawCall.value}`)

/**
 * 每一顆方塊擺在哪
 *
 * 兩邊要用同一組座標，不然比的就不只是繪製方式了。
 * 固定亂數在模組層算一次，兩個場景共用
 */
const positionList = createPositionList()

function createPositionList(): [number, number, number][] {
  let state = 20260817
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }

  return Array.from({ length: MAX_BLOCK_COUNT }, () => {
    /** 排成一片起伏的地景，看起來才像方塊世界而不是一團亂點 */
    const x = Math.round((random() - 0.5) * 40)
    const z = Math.round((random() - 0.5) * 40)
    const height = Math.round(random() * 3)

    return [x, height, z] as [number, number, number]
  })
}

function createCommonScene({ babylon, scene }: BabylonDemoContext) {
  const { Color3, DirectionalLight, HemisphericLight, StandardMaterial, Vector3 } = babylon

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

  return material
}

/**
 * 讀繪製呼叫
 *
 * SceneInstrumentation 本身也要花時間，但這裡量的就是它，
 * 而且只有這兩個範例在用
 */
function trackDrawCall(
  { babylon, scene }: BabylonDemoContext,
  target: { value: number },
) {
  const instrumentation = new babylon.SceneInstrumentation(scene)
  instrumentation.captureFrameTime = false

  let elapsed = 0
  const observer = scene.onAfterRenderObservable.add(() => {
    elapsed += scene.getEngine().getDeltaTime() / 1000
    if (elapsed < 0.4)
      return

    elapsed = 0
    target.value = instrumentation.drawCallsCounter.current
  })

  return () => {
    scene.onAfterRenderObservable.remove(observer)
    instrumentation.dispose()
  }
}

function setupMeshScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const material = createCommonScene(context)

  /** 一顆方塊一個網格，這正是要示範的「別這樣做」 */
  const meshList: Mesh[] = positionList.map(([x, y, z], index) => {
    const box = babylon.MeshBuilder.CreateBox(`block-${index}`, { size: 1 }, scene)
    box.position.set(x, y, z)
    box.material = material
    box.freezeWorldMatrix()

    return box
  })

  const stopTracking = trackDrawCall(context, meshDrawCall)

  const stopWatch = watch(blockCount, applyCount, { immediate: true })

  function applyCount(count: number) {
    meshList.forEach((mesh, index) => mesh.setEnabled(index < count))
  }

  return () => {
    stopWatch()
    stopTracking()
  }
}

function setupInstanceScene(context: BabylonDemoContext) {
  const { babylon, scene } = context
  const material = createCommonScene(context)

  const box = babylon.MeshBuilder.CreateBox('block', { size: 1 }, scene)
  box.material = material
  /** 邊界盒是所有實例的聯集，在方塊世界裡永遠剔不掉，乾脆別測 */
  box.alwaysSelectAsActiveMesh = true

  const stopTracking = trackDrawCall(context, instanceDrawCall)

  const stopWatch = watch(blockCount, applyCount, { immediate: true })

  function applyCount(count: number) {
    const matrixBuffer = new Float32Array(count * 16)

    for (let index = 0; index < count; index++) {
      const [x, y, z] = positionList[index]!
      babylon.Matrix.Translation(x, y, z).copyToArray(matrixBuffer, index * 16)
    }

    /** 第四個參數是「這份緩衝區是靜態的」，文章裡那個差四倍的旗標 */
    box.thinInstanceSetBuffer('matrix', matrixBuffer, 16, true)
    box.doNotSyncBoundingInfo = true
  }

  return () => {
    stopWatch()
    stopTracking()
  }
}
</script>

<style scoped>
.demo-shared-controls {
  display: flex;
  justify-content: center;
  margin: -0.6rem 0 1.5rem;
}
</style>
