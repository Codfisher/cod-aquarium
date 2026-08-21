<template>
  <demo-frame
    :setup="setup"
    :camera-radius="10"
    :camera-beta="1.35"
    :camera-alpha="1.9"
    :clear-color="[0.05, 0.06, 0.09, 1]"
    title="貼著牆的那條直邊，用深度圖化開"
    caption="化開距離拖到零，圓盤與地面、與後面那道牆各交出一條筆直的線。空氣裡的一團光不該有直邊。往右拖，靠近實體的那一圈會先淡掉，交線就散了。"
  >
    <demo-slider
      v-model="softDistance"
      label="化開距離"
      :min="0"
      :max="3"
      :step="0.05"
      unit=" 格"
    />
    <demo-toggle
      v-model="depthVisible"
      label="改看深度圖"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { ref } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createGlowTexture } from '../demo/glow-texture'

const SHADER_NAME = 'demoGlowSoftFade'

const softDistance = ref(0)
const depthVisible = ref(false)

function registerShader(babylon: BabylonModule) {
  if (babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`])
    return

  /**
   * 這支頂點著色器比一般的多算兩件事
   *
   * 一是視空間的 Z，也就是「這個片元離鏡頭多遠」。
   * 二是裁切座標本身要往下傳，片元那邊要拿它換算自己落在畫面的哪個位置，
   * 才知道該去深度圖的哪一格取樣
   */
  babylon.Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = `
    precision highp float;

    attribute vec3 position;
    attribute vec2 uv;

    uniform mat4 world;
    uniform mat4 view;
    uniform mat4 viewProjection;

    varying vec2 vGlowUv;
    varying float vGlowViewZ;
    varying vec4 vGlowClip;

    void main(void) {
      vec4 worldPosition = world * vec4(position, 1.0);

      vGlowUv = uv;
      vGlowViewZ = (view * worldPosition).z;
      vGlowClip = viewProjection * worldPosition;

      gl_Position = vGlowClip;
    }
  `

  babylon.Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = `
    precision highp float;

    varying vec2 vGlowUv;
    varying float vGlowViewZ;
    varying vec4 vGlowClip;

    uniform sampler2D glowTexture;
    uniform sampler2D depthTexture;
    uniform float softDistance;
    uniform float depthVisible;
    uniform float depthScale;

    void main(void) {
      vec3 glow = texture2D(glowTexture, vGlowUv).rgb;

      /**
       * 裁切座標除以 w 得到正規化裝置座標，範圍是負一到一，
       * 再換算成貼圖用的零到一
       */
      vec2 screenUv = (vGlowClip.xy / vGlowClip.w) * 0.5 + 0.5;
      float sceneZ = texture2D(depthTexture, screenUv).r;

      /**
       * 這個片元與它背後那塊實體之間還隔多遠
       *
       * 夾在零以上是因為深度圖裡不含光暈自己，
       * 沒有東西的地方存的是遠平面，差值本來就該是正的
       */
      float gap = max(sceneZ - vGlowViewZ, 0.0);
      float fade = softDistance > 0.0
        ? smoothstep(0.0, softDistance, gap)
        : 1.0;

      if (depthVisible > 0.5) {
        gl_FragColor = vec4(vec3(gap * depthScale), 1.0);
        return;
      }

      gl_FragColor = vec4(glow * fade, 1.0);
    }
  `
}

function setup({ babylon, scene, camera }: BabylonDemoContext) {
  registerShader(babylon)

  const ambient = new babylon.HemisphericLight('ambient', new babylon.Vector3(0, 1, 0), scene)
  ambient.intensity = 0.32
  ambient.diffuse = new babylon.Color3(0.6, 0.68, 0.85)

  const ground = babylon.MeshBuilder.CreateGround('ground', { width: 16, height: 16 }, scene)
  const groundMaterial = new babylon.StandardMaterial('ground-material', scene)
  groundMaterial.diffuseColor = new babylon.Color3(0.3, 0.29, 0.27)
  groundMaterial.specularColor = new babylon.Color3(0, 0, 0)
  ground.material = groundMaterial

  /** 一道牆，光暈會貼著它，那條直邊才看得出來 */
  const wall = babylon.MeshBuilder.CreateBox('wall', { width: 8, height: 5, depth: 1 }, scene)
  wall.position.set(0, 2.5, 2.2)
  const wallMaterial = new babylon.StandardMaterial('wall-material', scene)
  wallMaterial.diffuseColor = new babylon.Color3(0.34, 0.32, 0.3)
  wallMaterial.specularColor = new babylon.Color3(0, 0, 0)
  wall.material = wallMaterial

  const lamp = babylon.MeshBuilder.CreateBox('lamp', { size: 1 }, scene)
  lamp.position.set(0, 2, 1.2)
  const lampMaterial = new babylon.StandardMaterial('lamp-material', scene)
  lampMaterial.diffuseColor = new babylon.Color3(0, 0, 0)
  lampMaterial.specularColor = new babylon.Color3(0, 0, 0)
  lampMaterial.emissiveColor = new babylon.Color3(1, 0.86, 0.62)
  lamp.material = lampMaterial

  /**
   * 場景深度圖，存視空間的 Z
   *
   * 底色要給遠平面。給零的話等於「實體就貼在鏡頭上」，
   * 對著天空的那半圈光暈會整團被自己淡掉
   */
  const depthRenderer = scene.enableDepthRenderer(
    camera,
    false,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
    true,
  )
  depthRenderer.clearColor = new babylon.Color4(camera.maxZ, 0, 0, 1)
  const depthMap = depthRenderer.getDepthMap()

  const engine = scene.getEngine()
  const resizeObserver = engine.onResizeObservable.add(() => {
    depthMap.resize({
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
    })
  })

  const glowTexture = createGlowTexture(babylon, scene, 'glow', [255, 220, 160])

  const material = new babylon.ShaderMaterial(
    'demo-glow-soft-material',
    scene,
    SHADER_NAME,
    {
      attributes: ['position', 'uv'],
      uniforms: ['world', 'view', 'viewProjection', 'softDistance', 'depthVisible', 'depthScale'],
      samplers: ['glowTexture', 'depthTexture'],
      needAlphaBlending: true,
    },
  )
  material.setTexture('glowTexture', glowTexture)
  material.setTexture('depthTexture', depthMap)
  material.backFaceCulling = false
  material.alphaMode = babylon.Constants.ALPHA_ADD
  material.alpha = 0.999
  material.disableDepthWrite = true

  const halo = babylon.MeshBuilder.CreateDisc('halo', { radius: 2.2, tessellation: 48 }, scene)
  halo.material = material
  halo.billboardMode = babylon.Mesh.BILLBOARDMODE_ALL
  halo.position.copyFrom(lamp.position)
  halo.isPickable = false

  const observer = scene.onBeforeRenderObservable.add(() => {
    material.setFloat('softDistance', softDistance.value)
    material.setFloat('depthVisible', depthVisible.value ? 1 : 0)
    /** 除錯檢視要把幾格的差距拉到看得見的灰階 */
    material.setFloat('depthScale', 0.35)
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    engine.onResizeObservable.remove(resizeObserver)
    scene.disableDepthRenderer(camera)
  }
}
</script>
