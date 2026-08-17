<template>
  <demo-frame
    :setup="setupScene"
    title="材質外掛實作：大氣透視"
    caption="這個範例真的掛了一份 MaterialPluginBase，用正規式把霧那一行換掉。關掉時就是場景內建的單色霧，遠處的方塊會比背後的天空更淡；打開之後中距離往天色偏、遠距離才收進霧色，順便讓低處積一層濁氣。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.4"
    :camera-radius="26"
    :camera-target="[0, 2, -34]"
    :height="300"
  >
    <demo-toggle
      v-model="isPluginEnabled"
      label="大氣透視"
    />
    <demo-slider
      v-model="midStrength"
      label="中距離偏天色"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-slider
      v-model="groundBoost"
      label="低處加厚"
      :min="0"
      :max="1.5"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Material, UniformBuffer } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const isPluginEnabled = shallowRef(true)
const midStrength = shallowRef(0.75)
const groundBoost = shallowRef(0.6)

/** 天色與霧色，天邊那一段要接得起來所以用同一組數字 */
const SKY_MID_COLOR: [number, number, number] = [0.6, 0.78, 0.99]
const FOG_COLOR: [number, number, number] = [0.955, 0.95, 0.935]

/** 貼地那層濁氣的頂與厚度 */
const GROUND_HAZE_TOP = 9
const GROUND_HAZE_FALLOFF = 1 / 12

/**
 * 所有材質共讀這一份
 *
 * 與 Minespace 本體一樣的寫法，每一幀寫一次，
 * 材質綁定時自己來讀
 */
const airState = {
  red: FOG_COLOR[0],
  green: FOG_COLOR[1],
  blue: FOG_COLOR[2],
  groundBoost: 0.6,
}

/**
 * 外掛的類別要等 Babylon 載進來才能定義
 *
 * MaterialPluginBase 是它的匯出，動態 import 之前根本沒有那個基底類別
 */
function createPluginClass(babylon: BabylonModule) {
  return class DemoAerialPerspectivePlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      /** 第六個參數是「一律啟用」，這個外掛沒有開關屬性 */
      super(material, 'DemoAerialPerspective', 200, {}, true, true)
    }

    getClassName(): string {
      return 'DemoAerialPerspectivePlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'aerialMidColor', size: 3, type: 'vec3' },
          { name: 'aerialGround', size: 3, type: 'vec3' },
        ],
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      uniformBuffer.updateFloat3('aerialMidColor', airState.red, airState.green, airState.blue)
      uniformBuffer.updateFloat3(
        'aerialGround',
        GROUND_HAZE_TOP,
        GROUND_HAZE_FALLOFF,
        airState.groundBoost,
      )
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      /**
       * 把霧那一行換掉
       *
       * 原本是 color.rgb = mix(vFogColor, color.rgb, fog)
       * 找不到就靜靜地不做事，畫面退回單色霧
       */
      return {
        '!color\\.rgb\\s*=\\s*mix\\(\\s*vFogColor\\s*,\\s*color\\.rgb\\s*,\\s*fog\\s*\\);': `
          float aerialAmount = clamp(1.0 - fog, 0.0, 1.0);
          float aerialLow = clamp((aerialGround.x - vPositionW.y) * aerialGround.y, 0.0, 1.0);
          aerialAmount = clamp(aerialAmount * (1.0 + aerialLow * aerialGround.z), 0.0, 1.0);
          color.rgb = mix(color.rgb, mix(aerialMidColor, vFogColor, aerialAmount), aerialAmount);
        `,
      }
    }
  }
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

  /**
   * 背景直接用中空天色
   *
   * 「遠處的東西比背後的天空還淡」這個毛病，
   * 要有天空當背景才看得出來
   */
  scene.clearColor = new babylon.Color4(...SKY_MID_COLOR, 1)

  scene.fogMode = babylon.Scene.FOGMODE_LINEAR
  scene.fogColor = new Color3(...FOG_COLOR)
  scene.fogStart = 18
  scene.fogEnd = 90

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.62, -0.42), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const PluginClass = createPluginClass(babylon)

  function createMaterial(name: string, texture: ReturnType<typeof createStoneTexture>) {
    const material = new StandardMaterial(name, scene)
    material.diffuseTexture = texture
    material.specularColor = new Color3(0.02, 0.02, 0.02)
    material.ambientColor = new Color3(1, 1, 1)
    /**
     * 直接掛在這幾份材質上
     *
     * 本體是用 RegisterMaterialPlugin 讓所有材質自動接上，
     * 但那是全域的。文章頁只想影響自己這三份，就直接 new 一個
     */
    // eslint-disable-next-line no-new
    new PluginClass(material)

    return material
  }

  const sandMaterial = createMaterial('sand', createSandTexture({ babylon, scene, name: 'sand-texture' }))
  const stoneMaterial = createMaterial('stone', createStoneTexture({ babylon, scene, name: 'stone-texture' }))
  const woodMaterial = createMaterial('wood', createWoodTexture({ babylon, scene, name: 'wood-texture' }))

  const ground = MeshBuilder.CreateGround('ground', { width: 160, height: 200 }, scene)
  ground.position.z = -60
  ground.material = sandMaterial

  /**
   * 一路排到遠處的木座與石塔
   *
   * 大氣透視是「不同距離該是不同顏色」，
   * 所以場景一定要有深度，全部擠在眼前是比不出來的
   */
  const stone = MeshBuilder.CreateBox('stone-source', { size: 1 }, scene)
  stone.material = stoneMaterial
  stone.isVisible = false

  const wood = MeshBuilder.CreateBox('wood-source', { size: 1 }, scene)
  wood.material = woodMaterial
  wood.isVisible = false

  const stoneMatrixList: number[] = []
  const woodMatrixList: number[] = []

  let state = 20260819
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }

  for (let index = 0; index < 90; index++) {
    const x = Math.round((random() - 0.5) * 70)
    const z = -Math.round(random() * 130) - 4
    const height = 1 + Math.floor(random() * 6)
    const isWood = random() < 0.4

    for (let level = 0; level < height; level++) {
      const matrix = babylon.Matrix.Translation(x, level + 0.5, z)
      const target = isWood ? woodMatrixList : stoneMatrixList
      const buffer = new Float32Array(16)
      matrix.copyToArray(buffer, 0)
      target.push(...buffer)
    }
  }

  stone.isVisible = true
  stone.thinInstanceSetBuffer('matrix', new Float32Array(stoneMatrixList), 16, true)
  stone.alwaysSelectAsActiveMesh = true

  wood.isVisible = true
  wood.thinInstanceSetBuffer('matrix', new Float32Array(woodMatrixList), 16, true)
  wood.alwaysSelectAsActiveMesh = true

  applySetting()
}

function applySetting() {
  const strength = isPluginEnabled.value ? midStrength.value : 0

  airState.groundBoost = isPluginEnabled.value ? groundBoost.value : 0
  airState.red = FOG_COLOR[0] + (SKY_MID_COLOR[0] - FOG_COLOR[0]) * strength
  airState.green = FOG_COLOR[1] + (SKY_MID_COLOR[1] - FOG_COLOR[1]) * strength
  airState.blue = FOG_COLOR[2] + (SKY_MID_COLOR[2] - FOG_COLOR[2]) * strength
}

watch([isPluginEnabled, midStrength, groundBoost], applySetting)
</script>
