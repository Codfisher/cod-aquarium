<template>
  <demo-frame
    :setup="setupScene"
    title="逆光時的葉片透光"
    caption="拉動太陽方位，把它轉到樹的後面去。關掉透光時，背光的樹冠只吃得到環境光，逆光反而是它最暗的一刻；打開之後邊緣會透出葉子自己的顏色，那才是一棵樹該有的樣子。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.5"
    :camera-radius="14"
    :camera-target="[0, 3.2, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isTranslucencyEnabled"
      label="葉片透光"
    />
    <demo-slider
      v-model="sunAzimuth"
      label="太陽方位"
      :min="0"
      :max="360"
      :step="1"
      :digit="0"
      unit="°"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DirectionalLight, Material, UniformBuffer } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createPlantTexture, createSandTexture, createWoodTexture } from '../demo/pixel-texture'

const isTranslucencyEnabled = shallowRef(true)
/** 預設就把太陽擺在樹的後面，一進來就看得到效果 */
const sunAzimuth = shallowRef(180)

/** 透光集中在多窄的角度裡，越高越要正對著太陽才看得到 */
const FORWARD_POWER = 3.5
/** 出射方向被法線扳開多少，讓亮區從一條線化開成一片 */
const NORMAL_DISTORTION = 0.35
const LEAF_TRANSLUCENCY = 0.8

const sunState = {
  directionX: 0,
  directionY: -1,
  directionZ: 0,
  red: 0,
  green: 0,
  blue: 0,
}

function createPluginClass(babylon: BabylonModule) {
  return class DemoLeafTranslucencyPlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      super(material, 'DemoLeafTranslucency', 220, {}, true, true)
    }

    getClassName(): string {
      return 'DemoLeafTranslucencyPlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'leafTranslucencyColor', size: 4, type: 'vec4' },
          { name: 'leafTranslucencySun', size: 4, type: 'vec4' },
        ],
        fragment: `
          uniform vec4 leafTranslucencyColor;
          uniform vec4 leafTranslucencySun;
        `,
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      uniformBuffer.updateFloat4(
        'leafTranslucencyColor',
        sunState.red * LEAF_TRANSLUCENCY,
        sunState.green * LEAF_TRANSLUCENCY,
        sunState.blue * LEAF_TRANSLUCENCY,
        NORMAL_DISTORTION,
      )
      uniformBuffer.updateFloat4(
        'leafTranslucencySun',
        sunState.directionX,
        sunState.directionY,
        sunState.directionZ,
        FORWARD_POWER,
      )
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          vec3 demoLeafTranslucency(vec3 viewDirection, vec3 surfaceNormal) {
            float backFacing = 1.0 - max(dot(surfaceNormal, -leafTranslucencySun.xyz), 0.0);

            vec3 throughDirection = normalize(
              leafTranslucencySun.xyz - surfaceNormal * leafTranslucencyColor.a
            );
            float forward = pow(
              max(dot(viewDirection, throughDirection), 0.0),
              leafTranslucencySun.w
            );

            return leafTranslucencyColor.rgb * forward * backFacing;
          }
        `,
        CUSTOM_FRAGMENT_BEFORE_FOG: `
          color.rgb += demoLeafTranslucency(viewDirectionW, normalW) * baseColor.rgb;
        `,
      }
    }
  }
}

const sunLight = shallowRef<DirectionalLight>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    Material,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0, -0.5, 1), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sunLight.value = sun

  /**
   * 環境光壓低一點
   *
   * 補太多的話背光面本來就夠亮，透光加上去看不出差別
   */
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.5
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = sandMaterial

  const trunkMaterial = new StandardMaterial('trunk', scene)
  trunkMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  trunkMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 葉子貼圖借用草的那一張，鏤空與顏色都剛好 */
  const leafTexture = createPlantTexture(
    { babylon, scene, name: 'leaf-texture', hasMipmap: false },
    [86, 148, 58],
  )
  leafTexture.hasAlpha = true

  const leafMaterial = new StandardMaterial('leaf', scene)
  leafMaterial.diffuseTexture = leafTexture
  leafMaterial.useAlphaFromDiffuseTexture = true
  leafMaterial.transparencyMode = Material.MATERIAL_ALPHATEST
  leafMaterial.alphaCutOff = 0.5
  leafMaterial.backFaceCulling = false
  /** 樹葉是有體積的，背面要用翻轉後的法線打光 */
  leafMaterial.twoSidedLighting = true
  leafMaterial.specularColor = new Color3(0, 0, 0)
  leafMaterial.ambientColor = new Color3(1, 1, 1)

  const PluginClass = createPluginClass(babylon)
  // eslint-disable-next-line no-new
  new PluginClass(leafMaterial)

  /** 樹幹 */
  for (let level = 0; level < 3; level++) {
    const log = MeshBuilder.CreateBox(`trunk-${level}`, { size: 1 }, scene)
    log.position.set(0, level + 0.5, 0)
    log.material = trunkMaterial
  }

  /**
   * 樹冠
   *
   * 一團互相緊貼的方塊，這是 Minecraft 那種樹的長法。
   * 透光要有厚度才看得出「邊緣亮、深處暗」
   */
  const leafSource = MeshBuilder.CreateBox('leaf-source', { size: 1 }, scene)
  leafSource.material = leafMaterial

  const matrixList: number[] = []
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      for (let y = 0; y < 3; y++) {
        const distance = Math.hypot(x, z, (y - 1) * 1.4)
        if (distance > 2.6)
          continue

        const buffer = new Float32Array(16)
        babylon.Matrix.Translation(x, 3.5 + y, z).copyToArray(buffer, 0)
        matrixList.push(...buffer)
      }
    }
  }

  leafSource.thinInstanceSetBuffer('matrix', new Float32Array(matrixList), 16, true)
  leafSource.alwaysSelectAsActiveMesh = true

  applySetting()
}

function applySetting() {
  const sun = sunLight.value
  if (!sun)
    return

  /** 方位轉成光線前進的方向，仰角固定壓低才是逆光 */
  const radian = (sunAzimuth.value * Math.PI) / 180
  const height = 0.42
  const horizontal = Math.sqrt(1 - height * height)
  const x = -Math.sin(radian) * horizontal
  const z = -Math.cos(radian) * horizontal

  sun.direction.set(x, -height, z)

  sunState.directionX = x
  sunState.directionY = -height
  sunState.directionZ = z

  const ratio = isTranslucencyEnabled.value ? 1 : 0
  sunState.red = sun.diffuse.r * ratio
  sunState.green = sun.diffuse.g * ratio
  sunState.blue = sun.diffuse.b * ratio
}

watch([isTranslucencyEnabled, sunAzimuth], applySetting)
</script>
