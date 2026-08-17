<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="夜裡的補光與方塊光"
    caption="方塊光是烘進實例顏色的，而實例顏色在著色器裡是乘在貼圖上，最終亮度等於「場景光照 × 貼圖 × 實例顏色」。白天光照是 1、看得出來；夜裡光照只剩四分之一，烘進去的燈光就跟著夜色一起被壓掉了。補光是加在光照上再乘上反照率的，所以它一進來，燈火照到的地方會照比例亮起來。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.9"
    :camera-radius="17"
    :camera-target="[0, 1.2, 0]"
    :height="300"
  >
    <demo-slider
      v-model="dayRatio"
      label="白晝程度"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-toggle
      v-model="hasNightFill"
      label="夜裡的補光"
    />
    <demo-toggle
      v-model="hasBlockLight"
      label="方塊光烘進實例顏色"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DirectionalLight, HemisphericLight, Mesh, Scene } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createStoneTexture } from '../demo/pixel-texture'

const dayRatio = shallowRef(0)
const hasNightFill = shallowRef(true)
const hasBlockLight = shallowRef(true)

/** 夜裡均勻加在所有表面上的補光，白天為全黑 */
const NIGHT_FILL_COLOR: [number, number, number] = [0.15, 0.18, 0.27]

/** 燈火把照到的那幾面放大到兩倍多的反照率 */
const BLOCK_LIGHT_GAIN = 2.4

const badge = computed(() => {
  const lightRatio = 0.25 + dayRatio.value * 0.75
  const fill = hasNightFill.value ? (1 - dayRatio.value) * 0.2 : 0

  return `場景光照約 ${lightRatio.toFixed(2)}，補光 ${fill.toFixed(2)}`
})

const sceneRef = shallowRef<Scene>()
const sunLight = shallowRef<DirectionalLight>()
const ambientLight = shallowRef<HemisphericLight>()
const blockMesh = shallowRef<Mesh>()
const babylonModule = shallowRef<BabylonModule>()
/** 每一顆方塊離燈有多近，一是貼著燈、零是照不到 */
const blockLightList = shallowRef<number[]>([])

interface BlockEntry {
  x: number;
  y: number;
  z: number;
  light: number;
}

/**
 * 一段圍著燈的矮牆
 *
 * 燈火照得出範圍這件事要有牆才看得到，
 * 一片平地上只會看到地板亮一圈
 */
function createBlockList(): BlockEntry[] {
  const lampPosition: [number, number, number] = [0, 1, 0]
  const entryList: BlockEntry[] = []

  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      const isWall = Math.abs(x) === 5 || Math.abs(z) === 5
      const height = isWall ? 3 : 1

      for (let y = 0; y < height; y++) {
        const distance = Math.hypot(x - lampPosition[0], y - lampPosition[1], z - lampPosition[2])
        /** 亮度隨距離掉，八格外就照不到了 */
        const light = Math.max(0, 1 - distance / 8)
        entryList.push({ x, y, z, light })
      }
    }
  }

  return entryList
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

  sceneRef.value = scene
  babylonModule.value = babylon

  const sun = new DirectionalLight('sun', new Vector3(0.6, -0.62, -0.45), scene)
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sunLight.value = sun

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)
  ambientLight.value = ambient

  const material = new StandardMaterial('stone', scene)
  material.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  material.specularColor = new Color3(0.02, 0.02, 0.02)
  /**
   * 材質的 ambientColor 要給白
   *
   * 不設的話它預設是黑的，場景那道補光完全進不來（見 EP03）
   */
  material.ambientColor = new Color3(1, 1, 1)

  const box = MeshBuilder.CreateBox('block', { size: 1 }, scene)
  box.material = material
  box.alwaysSelectAsActiveMesh = true
  blockMesh.value = box

  const entryList = createBlockList()
  const matrixBuffer = new Float32Array(entryList.length * 16)

  for (const [index, entry] of entryList.entries()) {
    babylon.Matrix.Translation(entry.x, entry.y + 0.5, entry.z).copyToArray(matrixBuffer, index * 16)
  }

  box.thinInstanceSetBuffer('matrix', matrixBuffer, 16, true)
  box.doNotSyncBoundingInfo = true
  blockLightList.value = entryList.map((entry) => entry.light)

  /** 中央那顆燈本身，自發光讓它看起來是亮的 */
  const lampMaterial = new StandardMaterial('lamp', scene)
  lampMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'lamp-texture' })
  lampMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  lampMaterial.emissiveColor = new Color3(0.95, 0.76, 0.42)
  lampMaterial.ambientColor = new Color3(1, 1, 1)

  const lamp = MeshBuilder.CreateBox('lamp', { size: 1 }, scene)
  lamp.position.set(0, 1.5, 0)
  lamp.material = lampMaterial

  applySetting()

  return () => {
    sceneRef.value = undefined
    sunLight.value = undefined
    ambientLight.value = undefined
    blockMesh.value = undefined
    babylonModule.value = undefined
    blockLightList.value = []
  }
}

function applySetting() {
  const scene = sceneRef.value
  const babylon = babylonModule.value
  if (!scene || !babylon)
    return

  const { Color3 } = babylon
  const ratio = dayRatio.value

  /** 白天是暖陽、夜裡是冷月，強度也差很多 */
  if (sunLight.value) {
    sunLight.value.intensity = 0.3 + ratio * 1.0
    sunLight.value.diffuse = new Color3(
      0.56 + ratio * 0.44,
      0.66 + ratio * 0.27,
      0.95 - ratio * 0.17,
    )
  }

  if (ambientLight.value) {
    ambientLight.value.intensity = 0.32 + ratio * 0.5
  }

  scene.clearColor = new babylon.Color4(
    0.055 + ratio * 0.9,
    0.07 + ratio * 0.88,
    0.115 + ratio * 0.82,
    1,
  )

  /**
   * 補光跟著夜色進場，天一亮就退乾淨
   *
   * 走的是場景的 ambientColor，也就是加在光照上、再乘上反照率的那一項
   */
  const fillRatio = hasNightFill.value ? 1 - ratio : 0
  scene.ambientColor = new Color3(
    NIGHT_FILL_COLOR[0] * fillRatio,
    NIGHT_FILL_COLOR[1] * fillRatio,
    NIGHT_FILL_COLOR[2] * fillRatio,
  )

  /** 方塊光烘進實例顏色，執行期沒有任何額外成本 */
  const box = blockMesh.value
  const lightList = blockLightList.value
  if (!box || lightList.length === 0)
    return

  const colorBuffer = new Float32Array(lightList.length * 4)
  for (const [index, light] of lightList.entries()) {
    const gain = hasBlockLight.value ? 1 + light * (BLOCK_LIGHT_GAIN - 1) : 1
    colorBuffer[index * 4] = gain
    colorBuffer[index * 4 + 1] = gain * 0.94
    colorBuffer[index * 4 + 2] = gain * 0.82
    colorBuffer[index * 4 + 3] = 1
  }

  box.thinInstanceSetBuffer('color', colorBuffer, 4, true)
}

watch([dayRatio, hasNightFill, hasBlockLight], applySetting)
</script>
