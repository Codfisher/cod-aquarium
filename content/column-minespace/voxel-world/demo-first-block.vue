<template>
  <demo-frame
    :setup="setupScene"
    title="一顆方塊與兩盞燈"
    caption="半球光由上往下一個顏色、由下往上另一個顏色，方塊的頂面、側面、底面因此分出三層亮度。把色溫差關掉之後層次一格都沒少，畫面卻立刻變成一張黑白照片。"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 2.5"
    :camera-radius="11"
    :camera-target="[0, 1.2, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="sunLightEnabled"
      label="平行光"
    />
    <demo-toggle
      v-model="ambientLightEnabled"
      label="半球光"
    />
    <demo-toggle
      v-model="colorTemperatureEnabled"
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

const sunLightEnabled = shallowRef(true)
const ambientLightEnabled = shallowRef(true)
const colorTemperatureEnabled = shallowRef(true)
const ambientIntensity = shallowRef(0.82)

/** 與 Minespace 本體同一組顏色 */
const SUN_COLOR: [number, number, number] = [1, 0.93, 0.78]
const SKY_COLOR: [number, number, number] = [0.78, 0.88, 1]
const GROUND_COLOR: [number, number, number] = [0.82, 0.77, 0.72]
const SUN_INTENSITY = 1.3

/**
 * 關掉色溫差時用的中性色
 *
 * 亮度要與原本那三組相當，否則比到的會是「變暗」。
 * 這裡取各自的人眼加權亮度，再攤成同一階的灰
 */
function toNeutralColor(color: [number, number, number]): [number, number, number] {
  const luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722

  return [luminance, luminance, luminance]
}

const sunLight = shallowRef<DirectionalLight>()
const ambientLight = shallowRef<HemisphericLight>()
const babylonModule = shallowRef<BabylonModule>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new Color4(0.84, 0.89, 0.94, 1)

  /**
   * 平行光
   *
   * 高光給滿，這個表面要反出多少交還給各自的材質決定。
   * 仰角壓低是午後的斜射光，三個面的亮度才拉得開
   */
  const sun = new DirectionalLight('sun', new Vector3(0.666, -0.62, -0.416), scene)
  sun.specular = new Color3(1, 1, 1)
  sunLight.value = sun

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.specular = new Color3(0, 0, 0)
  ambientLight.value = ambient

  babylonModule.value = babylon

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene)
  ground.material = sandMaterial

  /** 主角，一顆立在沙上的石頭方塊 */
  const block = MeshBuilder.CreateBox('block', { size: 1 }, scene)
  block.position.set(0, 0.5, 0)
  block.material = stoneMaterial

  /** 旁邊再疊兩顆，頂面與兩個側面的落差在它們身上最乾淨 */
  const extraPositionList: [number, number, number][] = [
    [-1, 0.5, 1],
    [-1, 1.5, 1],
  ]
  for (const [x, y, z] of extraPositionList) {
    const extraBlock = MeshBuilder.CreateBox(`block-${x}-${y}`, { size: 1 }, scene)
    extraBlock.position.set(x, y, z)
    extraBlock.material = stoneMaterial
  }

  /**
   * 一片懸空的木簷
   *
   * 三層亮度要三種面都看得到才成立。少了懸空的部分，
   * 「由下往上那道地面反射色」就沒有地方可以露臉
   */
  const eave = MeshBuilder.CreateBox('eave', { width: 5, height: 0.4, depth: 2.4 }, scene)
  eave.position.set(1, 2.8, -1.2)
  eave.material = woodMaterial

  const post = MeshBuilder.CreateBox('post', { width: 0.5, height: 3, depth: 0.5 }, scene)
  post.position.set(3, 1.5, -1.2)
  post.material = woodMaterial

  applySetting()
}

function applySetting() {
  const babylon = babylonModule.value
  const sun = sunLight.value
  const ambient = ambientLight.value
  if (!babylon || !sun || !ambient)
    return

  const { Color3 } = babylon

  sun.intensity = sunLightEnabled.value ? SUN_INTENSITY : 0
  ambient.intensity = ambientLightEnabled.value ? ambientIntensity.value : 0

  if (colorTemperatureEnabled.value) {
    sun.diffuse = new Color3(...SUN_COLOR)
    ambient.diffuse = new Color3(...SKY_COLOR)
    ambient.groundColor = new Color3(...GROUND_COLOR)
    return
  }

  sun.diffuse = new Color3(...toNeutralColor(SUN_COLOR))
  ambient.diffuse = new Color3(...toNeutralColor(SKY_COLOR))
  ambient.groundColor = new Color3(...toNeutralColor(GROUND_COLOR))
}

watch(
  [sunLightEnabled, ambientLightEnabled, colorTemperatureEnabled, ambientIntensity],
  applySetting,
)
</script>
