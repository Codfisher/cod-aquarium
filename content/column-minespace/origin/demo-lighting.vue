<template>
  <demo-frame
    :setup="setupScene"
    title="半球光的三層亮度與色溫差"
    caption="半球光是由上往下一個顏色、由下往上另一個顏色，方塊的頂面、側面、底面因此有三層不同的亮度。把色溫差關掉之後亮度層次還在，但整個畫面只剩灰階的濃淡，那正是「多層次不等於好看」的意思。"
    :camera-alpha="-Math.PI / 2.55"
    :camera-beta="Math.PI / 2.35"
    :camera-radius="15"
    :camera-target="[0, 2.2, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasSunLight"
      label="平行光"
    />
    <demo-toggle
      v-model="hasAmbientLight"
      label="半球光"
    />
    <demo-toggle
      v-model="hasColorTemperature"
      label="冷暖色溫差"
    />
    <demo-slider
      v-model="ambientIntensity"
      label="環境光"
      :min="0"
      :max="1.4"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DirectionalLight, HemisphericLight } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const hasSunLight = shallowRef(true)
const hasAmbientLight = shallowRef(true)
const hasColorTemperature = shallowRef(true)
const ambientIntensity = shallowRef(0.82)

/** 與本體同一組顏色 */
const SUN_COLOR: [number, number, number] = [1, 0.93, 0.78]
const SKY_COLOR: [number, number, number] = [0.78, 0.88, 1]
const GROUND_COLOR: [number, number, number] = [0.82, 0.77, 0.72]

/**
 * 關掉色溫差時用的中性色
 *
 * 亮度要與原本那三組相當，否則比到的會是「變暗」而不是「沒有色溫差」。
 * 這裡直接取各自的人眼加權亮度，再攤成灰
 */
function toNeutral(color: [number, number, number]): [number, number, number] {
  const luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722

  return [luminance, luminance, luminance]
}

const sunLight = shallowRef<DirectionalLight>()
const ambientLight = shallowRef<HemisphericLight>()
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

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.666, -0.62, -0.416), scene)
  sun.intensity = 1.3
  sun.specular = new Color3(1, 1, 1)
  sunLight.value = sun

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.specular = new Color3(0, 0, 0)
  ambientLight.value = ambient

  babylonModule.value = babylon

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /**
   * 一座有懸空頂蓋的木架
   *
   * 三層亮度要三種面都看得到才成立：
   * 頂面朝天、側面吃斜射的陽光、底面只剩由下往上那道地面反射色。
   * 沒有懸空的部分就看不到第三層，整個示範少一半
   */
  for (const x of [-3, 3]) {
    const post = MeshBuilder.CreateBox(`post-${x}`, { width: 0.8, height: 4, depth: 0.8 }, scene)
    post.position.set(x, 2, 0)
    post.material = woodMaterial
  }

  const roof = MeshBuilder.CreateBox('roof', { width: 8.4, height: 0.7, depth: 3.2 }, scene)
  roof.position.set(0, 4.35, 0)
  roof.material = woodMaterial

  const beam = MeshBuilder.CreateBox('beam', { width: 7, height: 0.5, depth: 0.6 }, scene)
  beam.position.set(0, 3.5, 0)
  beam.material = woodMaterial

  /** 幾顆單純的方塊，頂面與兩個側面的差別在它們身上最乾淨 */
  const blockList: [number, number, number][] = [
    [-1.4, 0.5, 2.6],
    [-1.4, 1.5, 2.6],
    [0.6, 0.5, 3.2],
    [2.6, 0.5, 2.2],
  ]

  for (const [x, y, z] of blockList) {
    const box = MeshBuilder.CreateBox(`block-${x}-${y}`, { size: 1 }, scene)
    box.position.set(x, y, z)
    box.material = stoneMaterial
  }

  applySetting()
}

function applySetting() {
  const babylon = babylonModule.value
  const sun = sunLight.value
  const ambient = ambientLight.value
  if (!babylon || !sun || !ambient)
    return

  const { Color3 } = babylon

  sun.intensity = hasSunLight.value ? 1.3 : 0
  ambient.intensity = hasAmbientLight.value ? ambientIntensity.value : 0

  if (hasColorTemperature.value) {
    sun.diffuse = new Color3(...SUN_COLOR)
    ambient.diffuse = new Color3(...SKY_COLOR)
    ambient.groundColor = new Color3(...GROUND_COLOR)
    return
  }

  /**
   * 全部換成同一種白光
   *
   * 陽光是暖的、補光是冷的，兩者的色溫差就是畫面活起來的關鍵。
   * 這裡把三組顏色都攤成等亮度的灰，亮度層次一格都沒少，
   * 但畫面立刻變成一張黑白照片
   */
  sun.diffuse = new Color3(...toNeutral(SUN_COLOR))
  ambient.diffuse = new Color3(...toNeutral(SKY_COLOR))
  ambient.groundColor = new Color3(...toNeutral(GROUND_COLOR))
}

watch(
  [hasSunLight, hasAmbientLight, hasColorTemperature, ambientIntensity],
  applySetting,
)
</script>
