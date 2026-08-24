<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="霧的起點、終點，以及那個常常忘記改的背景色"
    caption="霧只管有東西的地方，天空是引擎的背景色，兩者不同步就會在地平線上留下一道生硬的接縫。把「背景色跟著霧色」關掉最看得出來，遠方的方塊化進霧裡，霧自己卻浮在另一個顏色的天上。"
    :camera-alpha="Math.PI / 2"
    :camera-beta="Math.PI / 2.35"
    :camera-radius="26"
    :camera-target="[0, 2, -18]"
    :height="300"
  >
    <demo-toggle
      v-model="fogEnabled"
      label="霧"
    />
    <demo-toggle
      v-model="backgroundFollowsFog"
      label="背景色跟著霧色"
    />
    <demo-slider
      v-model="fogStart"
      label="起點"
      :min="0"
      :max="60"
      :step="1"
      :digit="0"
      unit=" 格"
    />
    <demo-slider
      v-model="fogEnd"
      label="終點"
      :min="10"
      :max="140"
      :step="1"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

/** 與 Minespace 本體同一組霧色 */
const FOG_COLOR: [number, number, number] = [0.955, 0.95, 0.935]
/** 背景色不跟著霧走的時候，露出來的就是這個藍 */
const SKY_COLOR: [number, number, number] = [0.42, 0.62, 0.86]

const fogEnabled = shallowRef(true)
const backgroundFollowsFog = shallowRef(true)
const fogStart = shallowRef(12)
const fogEnd = shallowRef(72)

const sceneRef = shallowRef<Scene>()
const babylonModule = shallowRef<BabylonModule>()

/** 終點永遠要在起點之後，不然那條線性內插會整個翻過來，這個保護要跟 applySetting() 那邊一致 */
const appliedFogEnd = computed(() => Math.max(fogEnd.value, fogStart.value + 1))

const badge = computed(() => {
  if (!fogEnabled.value)
    return '沒有霧'

  return `${fogStart.value} ～ ${appliedFogEnd.value} 格`
})

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { Color3, DirectionalLight, HemisphericLight, MeshBuilder, StandardMaterial, Vector3 } = babylon

  sceneRef.value = scene
  babylonModule.value = babylon

  const sun = new DirectionalLight('sun', new Vector3(0.666, -0.62, -0.416), scene)
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.intensity = 1.2

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)
  ambient.intensity = 0.8

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'fog-sand' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'fog-stone' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /**
   * 一條往遠處退的柱列
   *
   * 霧是距離的函數，要看出那條曲線就得有東西站在各個距離上。
   * 兩側對稱排開，遠近的落差在中間那條走道上最清楚
   */
  const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 320 }, scene)
  ground.position.z = -140
  ground.material = sandMaterial

  for (let index = 0; index < 34; index++) {
    const distance = -4 - index * 4
    const height = 2 + (index % 3)

    for (const side of [-3.5, 3.5]) {
      const pillar = MeshBuilder.CreateBox(
        `pillar-${index}-${side}`,
        { width: 1, height, depth: 1 },
        scene,
      )
      pillar.position.set(side, height / 2, distance)
      pillar.material = stoneMaterial
    }
  }

  applySetting()
}

function applySetting() {
  const babylon = babylonModule.value
  const scene = sceneRef.value
  if (!babylon || !scene)
    return

  const { Color3, Color4, Scene: BabylonScene } = babylon

  scene.fogMode = fogEnabled.value ? BabylonScene.FOGMODE_LINEAR : BabylonScene.FOGMODE_NONE
  scene.fogColor = new Color3(...FOG_COLOR)
  scene.fogStart = fogStart.value
  scene.fogEnd = appliedFogEnd.value

  const background = fogEnabled.value && backgroundFollowsFog.value ? FOG_COLOR : SKY_COLOR
  scene.clearColor = new Color4(...background, 1)
}

watch([fogEnabled, backgroundFollowsFog, fogStart, fogEnd], applySetting)
</script>
