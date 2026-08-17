<template>
  <demo-frame
    :setup="setupScene"
    title="像素對齊的陰影"
    caption="整套美術是十六格見方的像素畫，唯獨陰影是連續的柔邊。把陰影的取樣點量化到貼圖的像素格上之後，影子的邊界只能沿著格線走，長出來的是階梯而不是曲線，與貼圖上那些方方正正的像素同一個節奏。"
    :camera-alpha="-Math.PI / 2.35"
    :camera-beta="Math.PI / 3.4"
    :camera-radius="14"
    :camera-target="[0, 1, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isPixelShadowEnabled"
      label="像素對齊"
    />
    <demo-slider
      v-model="texelScale"
      label="一格幾像素"
      :min="4"
      :max="32"
      :step="2"
      :digit="0"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type {
  Camera,
  Material,
  StandardMaterial,
  UniformBuffer,
} from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

const isPixelShadowEnabled = shallowRef(true)
const texelScale = shallowRef(16)

/** 這一刻的量化參數，每一幀寫一次，材質綁定時自己來讀 */
const pixelShadowState = {
  matrix: null as unknown,
  texelScale: 16,
  depthScale: 0.5,
  enabled: 0,
}

function createPluginClass(babylon: BabylonModule) {
  return class DemoPixelShadowPlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      super(material, 'DemoPixelShadow', 230, {}, true, true)
    }

    getClassName(): string {
      return 'DemoPixelShadowPlugin'
    }

    getUniforms() {
      return {
        ubo: [
          { name: 'pixelShadowMatrix', size: 16, type: 'mat4' },
          { name: 'pixelShadowParam', size: 4, type: 'vec4' },
        ],
        fragment: `
          uniform mat4 pixelShadowMatrix;
          uniform vec4 pixelShadowParam;
        `,
      }
    }

    bindForSubMesh(uniformBuffer: UniformBuffer): void {
      const matrix = pixelShadowState.matrix as Parameters<UniformBuffer['updateMatrix']>[1] | null
      if (matrix) {
        uniformBuffer.updateMatrix('pixelShadowMatrix', matrix)
      }

      uniformBuffer.updateFloat4(
        'pixelShadowParam',
        pixelShadowState.texelScale,
        pixelShadowState.depthScale,
        pixelShadowState.enabled,
        0,
      )
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      if (shaderType !== 'fragment')
        return null

      return {
        /**
         * 算好這一格的位移，光照那一段每一盞燈都拿它去用
         *
         * faceMask 讓法線指向的那一軸不動，取樣點因此永遠留在
         * 原本那個平面上，只在面內移動
         */
        'CUSTOM_FRAGMENT_BEFORE_LIGHTS': `
          vec4 demoPixelShadowDelta = vec4(0.0);
          #ifdef NORMAL
            {
              vec3 faceMask = 1.0 - step(0.5, abs(normalize(vNormalW)));
              vec3 snapped = (floor(vPositionW * pixelShadowParam.x) + 0.5) / pixelShadowParam.x;
              vec3 worldDelta = (snapped - vPositionW) * faceMask * pixelShadowParam.z;
              demoPixelShadowDelta = pixelShadowMatrix * vec4(worldDelta, 0.0);
            }
          #endif
        `,

        /**
         * 位置與深度要一起挪
         *
         * 每個 $n 只准出現一次，所以取樣點、深度連同編號各自獨立成群
         */
        '!shadow=(computeShadow[A-Za-z0-9]*)\\((vPositionFromLight(\\d+)),(vDepthMetric\\3),([^;]*)\\);': `
          {
            vec4 demoShadowPosition = $2;
            float demoShadowDepth = $4;

            #ifdef DIRLIGHT$3
              demoShadowPosition += demoPixelShadowDelta;
              demoShadowDepth += demoPixelShadowDelta.z * pixelShadowParam.y;
            #endif

            shadow = $1(demoShadowPosition, demoShadowDepth, $5);
          }
        `,
      }
    }
  }
}

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    MeshBuilder,
    HemisphericLight,
    ShadowGenerator,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.62, -0.66, -0.42), scene)
  sun.intensity = 1.3
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.position = new Vector3(-18, 22, 12)
  sun.autoUpdateExtends = false
  sun.orthoLeft = -14
  sun.orthoRight = 14
  sun.orthoTop = 14
  sun.orthoBottom = -14
  sun.shadowMinZ = 1
  sun.shadowMaxZ = 60

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.62
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const generator = new ShadowGenerator(1024, sun)
  generator.usePercentageCloserFiltering = true
  generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
  generator.bias = 0.0005
  generator.normalBias = 0.08
  /** 影子要全擋，理由見同一章的 clamp 那一段 */
  generator.darkness = 0.05

  const PluginClass = createPluginClass(babylon)

  function createMaterial(name: string, texture: ReturnType<typeof createStoneTexture>) {
    const material: StandardMaterial = new StandardMaterial(name, scene)
    material.diffuseTexture = texture
    material.specularColor = new Color3(0.02, 0.02, 0.02)
    material.ambientColor = new Color3(1, 1, 1)
    // eslint-disable-next-line no-new
    new PluginClass(material)

    return material
  }

  const sandMaterial = createMaterial('sand', createSandTexture({ babylon, scene, name: 'sand-texture' }))
  const stoneMaterial = createMaterial('stone', createStoneTexture({ babylon, scene, name: 'stone-texture' }))
  const woodMaterial = createMaterial('wood', createWoodTexture({ babylon, scene, name: 'wood-texture' }))

  const ground = MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene)
  ground.material = sandMaterial
  ground.receiveShadows = true

  /**
   * 幾根細柱
   *
   * 細長的東西投出來的影子邊緣最長，階梯與曲線的差別才看得清楚
   */
  const casterList = [
    { position: [-2.4, 1.6, -1.2], size: [0.5, 3.2, 0.5], material: woodMaterial },
    { position: [1.6, 1.2, 1.4], size: [0.5, 2.4, 0.5], material: woodMaterial },
    { position: [0, 2.6, -0.4], size: [5.4, 0.45, 0.5], material: woodMaterial },
    { position: [3.4, 0.8, -2.6], size: [1.4, 1.6, 1.4], material: stoneMaterial },
    { position: [-4.2, 0.5, 2.4], size: [1, 1, 1], material: stoneMaterial },
  ] as const

  for (const [index, caster] of casterList.entries()) {
    const [width, height, depth] = caster.size
    const box = MeshBuilder.CreateBox(`caster-${index}`, { width, height, depth }, scene)
    box.position.set(...caster.position)
    box.material = caster.material
    box.receiveShadows = true
    generator.addShadowCaster(box)
  }

  /**
   * 每一幀把量化參數寫進去
   *
   * 陰影矩陣就是產生器那一份，深度換算的分母則從光源自己身上算，
   * 日後換成別種投影也不會錯
   */
  const observer = scene.onBeforeRenderObservable.add(() => {
    pixelShadowState.matrix = generator.getTransformMatrix()

    const depthSpan = sun.getDepthMinZ(camera as Camera) + sun.getDepthMaxZ(camera as Camera)
    pixelShadowState.depthScale = depthSpan === 0 ? 0 : 1 / depthSpan
  })

  applySetting()

  return () => scene.onBeforeRenderObservable.remove(observer)
}

function applySetting() {
  pixelShadowState.enabled = isPixelShadowEnabled.value ? 1 : 0
  pixelShadowState.texelScale = texelScale.value
}

watch([isPixelShadowEnabled, texelScale], applySetting)
</script>
