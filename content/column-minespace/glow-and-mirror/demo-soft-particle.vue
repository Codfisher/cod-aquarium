<template>
  <demo-frame
    :setup="setupScene"
    title="柔性粒子"
    caption="光暈不寫深度，卻要通過深度測試，所以只要這個平面切進實體，交線上就會出現一道邊。那道邊是筆直的，而暈是糊的，一團糊東西被直線切齊看起來就是穿模。解法是拿一張存著場景深度的圖比對「這個像素背後的實體有多遠」，越接近就越淡，交線因此不是被切斷而是化開。"
    :camera-alpha="-Math.PI / 2.2"
    :camera-beta="Math.PI / 2.12"
    :camera-radius="9"
    :camera-target="[0, 0.6, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasSoftFade"
      label="柔性淡出"
    />
    <demo-slider
      v-model="fadeDistance"
      label="從幾格外開始化開"
      :min="0.1"
      :max="2"
      :step="0.05"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type {
  AbstractEngine,
  BaseTexture,
  DepthRenderer,
  Material,
  Scene,
  StandardMaterial,
  UniformBuffer,
} from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

const hasSoftFade = shallowRef(true)
/**
 * 這是整個效果的唯一旋鈕，也是一組取捨
 *
 * 給得太小，交線只是變窄；給得太大，光暈連自己那顆方塊都會躲
 */
const fadeDistance = shallowRef(0.6)

/** 所有光暈材質共讀這一份，深度圖只有一張 */
const fadeState = {
  depthTexture: null as BaseTexture | null,
  isEnabled: false,
  distance: 0.6,
}

function createPluginClass(babylon: BabylonModule) {
  return class DemoHaloSoftFadePlugin extends babylon.MaterialPluginBase {
    constructor(material: Material) {
      /** 第六個參數是「一律啟用」，這個外掛沒有開關屬性 */
      super(material, 'DemoHaloSoftFade', 210, {}, true, true)
    }

    getClassName(): string {
      return 'DemoHaloSoftFadePlugin'
    }

    getSamplers(samplers: string[]): void {
      samplers.push('haloDepthSampler')
    }

    getUniforms() {
      return {
        ubo: [{ name: 'haloFade', size: 4, type: 'vec4' }],
      }
    }

    bindForSubMesh(
      uniformBuffer: UniformBuffer,
      _scene: Scene,
      engine: AbstractEngine,
    ): void {
      const texture = fadeState.depthTexture

      /**
       * 深度圖與場景畫在同一個尺寸上
       *
       * 像素座標除以畫面大小就是取樣用的座標，
       * 硬體縮放會同時改動兩邊，每幀重讀才不會錯開
       */
      uniformBuffer.updateFloat4(
        'haloFade',
        1 / engine.getRenderWidth(),
        1 / engine.getRenderHeight(),
        texture && fadeState.isEnabled ? fadeState.distance : 0,
        0,
      )

      /** 關掉時也照樣綁，取樣器沒綁上去的話驅動程式會抱怨 */
      if (texture) {
        uniformBuffer.setTexture('haloDepthSampler', texture)
      }
    }

    getCustomCode(shaderType: string): { [pointName: string]: string } | null {
      /**
       * 自己算一份視空間的 Z
       *
       * 不借用 vPositionW，那個 varying 要材質有霧或有光照才會存在，
       * 而光暈兩者都關掉了
       */
      if (shaderType === 'vertex') {
        return {
          CUSTOM_VERTEX_DEFINITIONS: 'varying float vHaloViewZ;',
          CUSTOM_VERTEX_MAIN_END: 'vHaloViewZ = (view * worldPos).z;',
        }
      }

      if (shaderType !== 'fragment')
        return null

      /**
       * 淡出寫在顏色上而不是透明度上
       *
       * 光暈走的是相加混合，透明度在那條路上不起作用
       */
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          uniform sampler2D haloDepthSampler;
          varying float vHaloViewZ;
        `,
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          if (haloFade.z > 0.0) {
            float haloSceneZ = texture2D(haloDepthSampler, gl_FragCoord.xy * haloFade.xy).r;
            color.rgb *= clamp((haloSceneZ - vHaloViewZ) / haloFade.z, 0.0, 1.0);
          }
        `,
      }
    }
  }
}

const depthRendererRef = shallowRef<DepthRenderer>()

const TEXTURE_SIZE = 128
const STOP_COUNT = 32

function measureFalloff(ratio: number): number {
  const base = Math.max(0, 1 - ratio * ratio)

  return 0.55 * base ** 8 + 0.45 * base ** 3
}

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const {
    Color3,
    Color4,
    Constants,
    DirectionalLight,
    DynamicTexture,
    HemisphericLight,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Texture,
    Vector3,
  } = babylon

  /** 夜色，營火才有戲 */
  scene.clearColor = new Color4(0.06, 0.08, 0.14, 1)

  const moon = new DirectionalLight('moon', new Vector3(0.4, -0.7, -0.5), scene)
  moon.intensity = 0.28
  moon.diffuse = new Color3(0.56, 0.66, 0.95)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.3
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

  /**
   * 一圈石頭圍著的營火
   *
   * 坐在地上的火每次都會遇到那道直邊，
   * 掛在半空中的燈籠反而遇不到
   */
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2
    const stone = MeshBuilder.CreateBox(`ring-${index}`, { size: 0.55 }, scene)
    stone.position.set(Math.cos(angle) * 1.15, 0.27, Math.sin(angle) * 1.15)
    stone.rotation.y = angle
    stone.material = stoneMaterial
  }

  const emberMaterial = new StandardMaterial('ember', scene)
  emberMaterial.diffuseColor = new Color3(0, 0, 0)
  emberMaterial.specularColor = new Color3(0, 0, 0)
  emberMaterial.emissiveColor = new Color3(1, 0.55, 0.18)
  emberMaterial.disableLighting = true

  const ember = MeshBuilder.CreateBox('ember', { width: 1.1, height: 0.3, depth: 1.1 }, scene)
  ember.position.set(0, 0.15, 0)
  ember.material = emberMaterial

  /** 一堵矮牆，光暈切進去的那道邊在這裡也看得到 */
  for (let x = -3; x <= -1; x++) {
    const box = MeshBuilder.CreateBox(`wall-${x}`, { size: 1 }, scene)
    box.position.set(x, 0.5, -2)
    box.material = stoneMaterial
  }

  /**
   * 開一張場景深度圖
   *
   * WebGL 拿不到主畫面正在用的那份深度緩衝區，只能自己再畫一趟。
   * 整個場景要多跑一次，這是低畫質不開它的理由
   */
  const depthRenderer = scene.enableDepthRenderer(
    camera,
    false,
    false,
    /** 浮點深度圖的雙線性取樣不是每張顯卡都支援 */
    Texture.NEAREST_SAMPLINGMODE,
    /** 直接存視空間的 Z，比對時一個字都不必換算 */
    true,
  )
  /**
   * 沒有東西的地方要當成無限遠
   *
   * 預設底色是零，那等於「實體就貼在鏡頭上」，
   * 天空前面的光暈會整團被自己淡掉
   */
  depthRenderer.clearColor = new Color4(camera.maxZ, 0, 0, 1)
  fadeState.depthTexture = depthRenderer.getDepthMap()
  depthRendererRef.value = depthRenderer

  /** 光暈的貼圖，衰減畫在顏色上 */
  const texture = new DynamicTexture(
    'halo-texture',
    { width: TEXTURE_SIZE, height: TEXTURE_SIZE },
    scene,
    false,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  const center = TEXTURE_SIZE / 2
  const gradient = context.createRadialGradient(center, center, 0, center, center, center)

  for (let index = 0; index <= STOP_COUNT; index++) {
    const ratio = index / STOP_COUNT
    const intensity = measureFalloff(ratio)
    gradient.addColorStop(
      ratio,
      `rgb(${Math.round(236 * intensity)}, ${Math.round(158 * intensity)}, ${Math.round(76 * intensity)})`,
    )
  }
  context.fillStyle = gradient
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  texture.update()

  const haloMaterial: StandardMaterial = new StandardMaterial('halo', scene)
  haloMaterial.diffuseTexture = texture
  haloMaterial.diffuseColor = new Color3(0, 0, 0)
  haloMaterial.specularColor = new Color3(0, 0, 0)
  haloMaterial.emissiveColor = new Color3(0.85, 0.85, 0.85)
  haloMaterial.disableLighting = true
  haloMaterial.fogEnabled = false
  haloMaterial.backFaceCulling = false
  haloMaterial.alphaMode = Constants.ALPHA_ADD
  haloMaterial.alpha = 0.999
  haloMaterial.disableDepthWrite = true

  const PluginClass = createPluginClass(babylon)
  // eslint-disable-next-line no-new
  new PluginClass(haloMaterial)

  const halo = MeshBuilder.CreateDisc('halo', { radius: 2.4, tessellation: 24 }, scene)
  halo.material = haloMaterial
  halo.billboardMode = Mesh.BILLBOARDMODE_ALL
  halo.position.set(0, 0.55, 0)
  halo.isPickable = false

  applySetting()

  return () => {
    fadeState.depthTexture = null
    fadeState.isEnabled = false
    scene.disableDepthRenderer(camera)
    depthRendererRef.value = undefined
  }
}

function applySetting() {
  fadeState.isEnabled = hasSoftFade.value
  fadeState.distance = fadeDistance.value

  if (depthRendererRef.value) {
    /** 關掉時深度圖也停止更新，那一趟重畫才真的省下來 */
    depthRendererRef.value.enabled = hasSoftFade.value
  }
}

watch([hasSoftFade, fadeDistance], applySetting)
</script>
