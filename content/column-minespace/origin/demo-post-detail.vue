<template>
  <demo-frame
    :setup="setupScene"
    title="打散色階與泛光"
    caption="天空是一整片很長的漸層，重新量化成八位元之後會浮出一圈圈的等高線。加半個色階的雜訊就看不出來了，代價是肉眼看不見的顆粒。泛光則相反，門檻擺低整片地與霧都在發光、天地交界糊出一圈白暈；拉到場景最亮的東西以上，它就什麼都沒做卻每幀收費。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.15"
    :camera-radius="14"
    :camera-target="[0, 3, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasDithering"
      label="打散色階"
    />
    <demo-toggle
      v-model="hasBloom"
      label="泛光"
    />
    <demo-slider
      v-model="bloomThreshold"
      label="泛光門檻"
      :min="0.2"
      :max="2.4"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DefaultRenderingPipeline } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

const hasDithering = shallowRef(true)
const hasBloom = shallowRef(false)
/** 原本擺的那個位置，整片地與霧都會發光 */
const bloomThreshold = shallowRef(0.86)

const pipeline = shallowRef<DefaultRenderingPipeline>()

/**
 * 一整片很長的漸層
 *
 * 色階要有夠長的漸層才顯得出來。這裡不用貼圖，
 * 直接在著色器裡算，八位元的量化就只發生在最後輸出那一次
 */
const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDirection;

void main() {
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vDirection;

void main() {
  vec3 direction = normalize(vDirection);
  float upward = clamp(direction.y, 0.0, 1.0);

  /** 收得很慢的曲線，整片天都是漸層，色階無所遁形 */
  float blend = 1.0 - pow(1.0 - upward, 1.4);
  vec3 color = mix(vec3(0.955, 0.95, 0.935), vec3(0.26, 0.52, 0.98), blend);

  gl_FragColor = vec4(color, 1.0);
}
`

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    Effect,
    HemisphericLight,
    MeshBuilder,
    ShaderMaterial,
    StandardMaterial,
    Vector3,
  } = babylon

  Effect.ShadersStore.demoBandingVertexShader = VERTEX_SHADER
  Effect.ShadersStore.demoBandingFragmentShader = FRAGMENT_SHADER

  const skyMaterial = new ShaderMaterial('demo-banding-sky', scene, 'demoBanding', {
    attributes: ['position'],
    uniforms: ['worldViewProjection'],
  })
  skyMaterial.backFaceCulling = false
  skyMaterial.disableDepthWrite = true

  const dome = MeshBuilder.CreateBox('sky-dome', { size: 200 }, scene)
  dome.material = skyMaterial
  dome.infiniteDistance = true
  dome.isPickable = false

  const sun = new DirectionalLight('sun', new Vector3(0.6, -0.62, -0.44), scene)
  sun.intensity = 1.3
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  /**
   * 被曬到的白沙
   *
   * 這個場景的光是滿的，白沙算出來大約 1.9，
   * 泛光門檻擺在 0.86 等於整片地都在發光
   */
  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 80, height: 80 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  for (const [x, z, height] of [[-4, -3, 3], [4.2, 1.5, 2], [0.5, 4, 4]] as const) {
    for (let level = 0; level < height; level++) {
      const box = MeshBuilder.CreateBox(`block-${x}-${level}`, { size: 1 }, scene)
      box.position.set(x, level + 0.5, z)
      box.material = stoneMaterial
    }
  }

  const currentPipeline = new babylon.DefaultRenderingPipeline('demo-pipeline', false, scene, [camera])
  currentPipeline.imageProcessingEnabled = true
  currentPipeline.imageProcessing.toneMappingEnabled = true
  currentPipeline.imageProcessing.toneMappingType = babylon.ImageProcessingConfiguration.TONEMAPPING_ACES
  currentPipeline.imageProcessing.exposure = 1.06
  currentPipeline.imageProcessing.contrast = 1.05
  currentPipeline.fxaaEnabled = false
  currentPipeline.samples = 4

  pipeline.value = currentPipeline
  applySetting()

  return () => {
    currentPipeline.dispose()
    pipeline.value = undefined
  }
}

function applySetting() {
  const currentPipeline = pipeline.value
  if (!currentPipeline)
    return

  currentPipeline.imageProcessing.ditheringEnabled = hasDithering.value
  currentPipeline.bloomEnabled = hasBloom.value
  currentPipeline.bloomThreshold = bloomThreshold.value
  currentPipeline.bloomWeight = 0.6
  currentPipeline.bloomKernel = 48
}

watch([hasDithering, hasBloom, bloomThreshold], applySetting)
</script>
