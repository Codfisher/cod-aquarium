<template>
  <demo-frame
    :setup="setupScene"
    title="光暈為什麼要往鏡頭的方向挪"
    caption="光暈是一片朝著鏡頭的圓盤，它自己不寫深度，卻照樣要通過深度測試。擺在光源座標上時，整團暈最亮的核心永遠被它自己那顆燈籠方塊擋住，畫面上等於什麼都沒有。往鏡頭的方向挪 0.95 格就繞得出來了。"
    :camera-alpha="-Math.PI / 2.4"
    :camera-beta="Math.PI / 2.6"
    :camera-radius="11"
    :camera-target="[0, 2, 0]"
    :height="300"
  >
    <demo-slider
      v-model="haloLift"
      label="往鏡頭挪"
      :min="0"
      :max="1.6"
      :step="0.05"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

/**
 * 一開始擺在零
 *
 * 讓讀者先看到「什麼都沒有」，再自己拉出來，
 * 比先看到成品有說服力得多
 */
const haloLift = shallowRef(0)

const TEXTURE_SIZE = 128
const STOP_COUNT = 32

function measureFalloff(ratio: number): number {
  const base = Math.max(0, 1 - ratio * ratio)

  return 0.55 * base ** 8 + 0.45 * base ** 3
}

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const {
    Color3,
    Constants,
    DirectionalLight,
    DynamicTexture,
    HemisphericLight,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Vector3: BabylonVector3,
  } = babylon

  /** 夜色，燈才有戲 */
  scene.clearColor = new babylon.Color4(0.06, 0.08, 0.14, 1)

  const moon = new DirectionalLight('moon', new BabylonVector3(0.4, -0.7, -0.5), scene)
  moon.intensity = 0.3
  moon.diffuse = new Color3(0.56, 0.66, 0.95)

  const ambient = new HemisphericLight('ambient', new BabylonVector3(0, 1, 0), scene)
  ambient.intensity = 0.32
  ambient.diffuse = new Color3(0.3, 0.4, 0.62)
  ambient.groundColor = new Color3(0.16, 0.18, 0.26)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 一座石燈籠，燈火那一格自己會發亮 */
  const base = MeshBuilder.CreateBox('base', { width: 1.2, height: 1, depth: 1.2 }, scene)
  base.position.set(0, 0.5, 0)
  base.material = stoneMaterial

  const post = MeshBuilder.CreateBox('post', { width: 0.4, height: 1.6, depth: 0.4 }, scene)
  post.position.set(0, 1.8, 0)
  post.material = woodMaterial

  /**
   * 燈火方塊
   *
   * 自發光只讓它自己看起來是亮的，光並沒有溢出它的邊界，
   * 那正是需要光暈的理由
   */
  const lampMaterial = new StandardMaterial('lamp', scene)
  lampMaterial.diffuseColor = new Color3(0, 0, 0)
  lampMaterial.specularColor = new Color3(0, 0, 0)
  lampMaterial.emissiveColor = new Color3(1, 0.86, 0.58)
  lampMaterial.disableLighting = true

  const lamp = MeshBuilder.CreateBox('lamp', { size: 1 }, scene)
  lamp.position.set(0, 3.1, 0)
  lamp.material = lampMaterial

  const roof = MeshBuilder.CreateBox('roof', { width: 1.6, height: 0.3, depth: 1.6 }, scene)
  roof.position.set(0, 3.75, 0)
  roof.material = stoneMaterial

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
      `rgb(${Math.round(230 * intensity)}, ${Math.round(196 * intensity)}, ${Math.round(132 * intensity)})`,
    )
  }
  context.fillStyle = gradient
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  texture.update()

  const haloMaterial = new StandardMaterial('halo', scene)
  haloMaterial.diffuseTexture = texture
  haloMaterial.diffuseColor = new Color3(0, 0, 0)
  haloMaterial.specularColor = new Color3(0, 0, 0)
  haloMaterial.emissiveColor = new Color3(0.85, 0.85, 0.85)
  haloMaterial.disableLighting = true
  haloMaterial.fogEnabled = false
  haloMaterial.backFaceCulling = false
  haloMaterial.alphaMode = Constants.ALPHA_ADD
  haloMaterial.alpha = 0.999
  /** 暈是空氣裡的一團光，不是一塊擋得住東西的板子 */
  haloMaterial.disableDepthWrite = true

  const halo: Mesh = MeshBuilder.CreateDisc('halo', { radius: 1.6, tessellation: 24 }, scene)
  halo.material = haloMaterial
  halo.billboardMode = Mesh.BILLBOARDMODE_ALL
  halo.isPickable = false

  /** 燈本身在哪，每一幀從這裡往鏡頭的方向挪 */
  const origin = new BabylonVector3(0, 3.1, 0)
  const toCamera = new BabylonVector3()

  const observer = scene.onBeforeRenderObservable.add(() => {
    toCamera.copyFrom(camera.position).subtractInPlace(origin)
    const distance = toCamera.length()

    if (distance < 0.001) {
      halo.position.copyFrom(origin)
      return
    }

    /** 貼得很近時要收手，不然圓盤會被送到鏡頭背後 */
    const lift = Math.min(haloLift.value, distance * 0.5)
    halo.position.copyFrom(origin).addInPlace(toCamera.scaleInPlace(lift / distance))
  })

  return () => scene.onBeforeRenderObservable.remove(observer)
}
</script>
