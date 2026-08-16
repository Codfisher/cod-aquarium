<template>
  <demo-frame
    :setup="setupScene"
    title="兩個容易被忽略的預設值，加上水面反日光"
    caption="開了 useEmissiveAsIllumination 之後自發光會跳過貼圖直接加在最後，燈石被洗成一塊死白、圖案整個看不見。材質的 ambientColor 預設是黑的，不設成白色就完全吃不到場景補光，夜裡那道補光進不來。水面的高光則是加在漫射 clamp 外面的，全場唯一能超過純白的通道。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.7"
    :camera-radius="12"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasEmissiveAsIllumination"
      label="useEmissiveAsIllumination"
    />
    <demo-toggle
      v-model="hasAmbientColor"
      label="材質 ambientColor 給白"
    />
    <demo-toggle
      v-model="hasWaterGlint"
      label="水面反日光"
    />
    <demo-slider
      v-model="sceneAmbient"
      label="場景補光"
      :min="0"
      :max="0.6"
      :step="0.02"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

const hasEmissiveAsIllumination = shallowRef(false)
const hasAmbientColor = shallowRef(true)
const hasWaterGlint = shallowRef(true)
/** 夜裡那道均勻加在所有表面上的補光 */
const sceneAmbient = shallowRef(0.24)

const lampMaterialList = shallowRef<StandardMaterial[]>([])
const blockMaterialList = shallowRef<StandardMaterial[]>([])
const waterMaterial = shallowRef<StandardMaterial>()
const sceneRef = shallowRef<Scene>()
const babylonModule = shallowRef<BabylonModule>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  /** 夜色，燈石與補光才有戲 */
  scene.clearColor = new babylon.Color4(0.055, 0.07, 0.115, 1)
  sceneRef.value = scene
  babylonModule.value = babylon

  const moon = new DirectionalLight('moon', new Vector3(0.62, -0.55, -0.5), scene)
  moon.intensity = 0.34
  moon.diffuse = new Color3(0.56, 0.66, 0.95)
  /** 高光給滿，讓材質自己決定要反射多少 */
  moon.specular = new Color3(1, 1, 1)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.32
  ambient.diffuse = new Color3(0.3, 0.4, 0.62)
  ambient.groundColor = new Color3(0.16, 0.18, 0.26)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  blockMaterialList.value = [sandMaterial, stoneMaterial]

  /**
   * 燈石
   *
   * 自發光當成「這顆方塊自帶亮度」，貼圖的圖案要留得住
   */
  const lampList: StandardMaterial[] = []
  for (const [index, x] of [-3.5, 0, 3.5].entries()) {
    const lamp = new StandardMaterial(`lamp-${index}`, scene)
    lamp.diffuseTexture = createStoneTexture({ babylon, scene, name: `lamp-texture-${index}` })
    lamp.specularColor = new Color3(0.02, 0.02, 0.02)
    lamp.emissiveColor = new Color3(0.9, 0.72, 0.42)
    lampList.push(lamp)

    const box = MeshBuilder.CreateBox(`lamp-block-${index}`, { size: 1 }, scene)
    box.position.set(x, 0.5, -2)
    box.material = lamp
  }
  lampMaterialList.value = lampList

  /** 幾顆普通方塊，補光有沒有進來看它們最準 */
  for (const [x, z] of [[-2, 1.5], [2, 2], [0, 3.5]] as const) {
    for (let level = 0; level < 2; level++) {
      const box = MeshBuilder.CreateBox(`block-${x}-${level}`, { size: 1 }, scene)
      box.position.set(x, level + 0.5, z)
      box.material = stoneMaterial
    }
  }

  /**
   * 一池水
   *
   * 法線統一朝上，整池水因此是一個光學上的平面。
   * 太陽在上面只會反出一個點，人一走那個點就跟著移
   */
  const water = new StandardMaterial('water', scene)
  water.diffuseColor = new Color3(0.12, 0.22, 0.3)
  water.specularPower = 160
  waterMaterial.value = water

  const pool = MeshBuilder.CreateGround('pool', { width: 8, height: 5 }, scene)
  pool.position.set(0, 0.02, 6)
  pool.material = water

  applySetting()

  return () => {
    lampMaterialList.value = []
    blockMaterialList.value = []
    waterMaterial.value = undefined
    sceneRef.value = undefined
    babylonModule.value = undefined
  }
}

function applySetting() {
  const scene = sceneRef.value
  const babylon = babylonModule.value
  if (!scene || !babylon)
    return

  const { Color3 } = babylon

  for (const lamp of lampMaterialList.value) {
    /**
     * 開了它自發光會跳過貼圖直接加在最後
     *
     * 而且最終顏色仍然夾在 1 以內，燈石因此被洗成一塊死白
     */
    lamp.useEmissiveAsIllumination = hasEmissiveAsIllumination.value
    lamp.ambientColor = hasAmbientColor.value ? new Color3(1, 1, 1) : new Color3(0, 0, 0)
  }

  for (const material of blockMaterialList.value) {
    /**
     * Babylon 的環境光是「場景的 × 材質的」
     *
     * 材質這一項預設是黑的，也就是預設完全不吃場景補光
     */
    material.ambientColor = hasAmbientColor.value ? new Color3(1, 1, 1) : new Color3(0, 0, 0)
  }

  const water = waterMaterial.value
  if (water) {
    water.ambientColor = hasAmbientColor.value ? new Color3(1, 1, 1) : new Color3(0, 0, 0)
    /** 關掉之後水面回到與別的方塊一樣的霧面 */
    water.specularColor = hasWaterGlint.value
      ? new Color3(0.8, 0.82, 0.85)
      : new Color3(0.02, 0.02, 0.02)
  }

  /** 場景的 ambientColor 就是夜裡那道均勻加在所有表面上的補光 */
  scene.ambientColor = new Color3(
    sceneAmbient.value * 0.62,
    sceneAmbient.value * 0.75,
    sceneAmbient.value * 1.12,
  )
}

watch(
  [hasEmissiveAsIllumination, hasAmbientColor, hasWaterGlint, sceneAmbient],
  applySetting,
)
</script>
