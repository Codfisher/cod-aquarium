<template>
  <demo-frame
    :setup="setupScene"
    title="方形的太陽、月亮與星空"
    caption="天體的貼圖必須掛在 diffuseTexture 並關掉光照，自發光的顏色才是一個乾淨的乘數，淡入淡出與染色都靠它。掛在 emissiveTexture 上的話，顏色調成黑色貼圖照樣全亮，白天也會看到滿天星星。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.3"
    :camera-radius="10"
    :camera-target="[0, 0, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isDiffuseMode"
      label="貼圖掛在 diffuseTexture"
    />
    <demo-slider
      v-model="bodyVisibility"
      label="天體亮度"
      :min="0"
      :max="1"
      :step="0.05"
    />
    <demo-slider
      v-model="starVisibility"
      label="星空亮度"
      :min="0"
      :max="1"
      :step="0.05"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'

const isDiffuseMode = shallowRef(true)
const bodyVisibility = shallowRef(1)
const starVisibility = shallowRef(0.6)

interface SkyBody {
  material: StandardMaterial;
  texture: DynamicTexture;
  /** 這一顆的基準色，亮度乘上去才是最終的自發光 */
  baseColor: [number, number, number];
}

const bodyList = shallowRef<SkyBody[]>([])
const starBody = shallowRef<SkyBody>()
const babylonModule = shallowRef<BabylonModule>()

/** Minecraft 風格的方形太陽，一張純白的方形貼圖 */
function createSunTexture(babylon: BabylonModule, scene: Scene) {
  const size = 16
  const texture = new babylon.DynamicTexture(
    'sun-disc',
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = 'rgba(255, 250, 230, 1)'
  context.fillRect(0, 0, size, size)
  texture.update()

  return texture
}

/**
 * 月亮
 *
 * 與太陽一樣是填滿的方形，差別在表面。
 * 月海位置刻意不規則也刻意不對稱，排整齊會變成一顆骰子
 */
function createMoonTexture(babylon: BabylonModule, scene: Scene) {
  const size = 16
  const texture = new babylon.DynamicTexture(
    'moon-disc',
    { width: size, height: size },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false

  context.fillStyle = 'rgb(226, 233, 250)'
  context.fillRect(0, 0, size, size)

  context.fillStyle = 'rgb(196, 206, 231)'
  for (const [x, y, width, height] of [[2, 3, 5, 4], [8, 2, 3, 3], [10, 7, 4, 5], [1, 9, 3, 3], [5, 11, 4, 3], [12, 1, 2, 2]]) {
    context.fillRect(x!, y!, width!, height!)
  }

  /** 再暗一階的坑，落在月海裡面，表面才有第三層深度 */
  context.fillStyle = 'rgb(170, 181, 209)'
  for (const [x, y, width, height] of [[3, 4, 2, 2], [11, 9, 2, 2], [6, 12, 2, 1], [2, 10, 1, 1]]) {
    context.fillRect(x!, y!, width!, height!)
  }

  /** 右下角壓暗一層，月亮才有一點球的錯覺 */
  context.fillStyle = 'rgba(120, 132, 164, 0.32)'
  context.fillRect(9, 12, 7, 4)
  context.fillRect(13, 8, 3, 4)

  texture.update()

  return texture
}

/** 一張隨機點上星點的貼圖，黑色的底加上去等於沒加 */
function createStarTexture(babylon: BabylonModule, scene: Scene) {
  const size = 512
  const texture = new babylon.DynamicTexture(
    'star-field',
    { width: size, height: size },
    scene,
    true,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = '#000000'
  context.fillRect(0, 0, size, size)

  let state = 20260821
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }

  for (let index = 0; index < 460; index++) {
    const x = Math.floor(random() * size)
    const y = Math.floor(random() * size)
    /** 大部分是暗的小星，偶爾幾顆亮而大的，疏密才有層次 */
    const isBright = random() < 0.1
    const brightness = isBright ? 0.85 + random() * 0.15 : 0.25 + random() * 0.45
    const pixelSize = isBright ? 2 : 1
    context.fillStyle = `rgba(255, 252, 242, ${brightness})`
    context.fillRect(x, y, pixelSize, pixelSize)
  }
  texture.update()

  return texture
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { Color3, Constants, Mesh, MeshBuilder, StandardMaterial } = babylon

  /** 黃昏的天，太陽與星星可以同時出現在畫面上 */
  scene.clearColor = new babylon.Color4(0.32, 0.42, 0.68, 1)
  babylonModule.value = babylon

  /**
   * 天體共用的材質
   *
   * 貼圖不在這裡掛，由 applySkyBody 依模式決定要掛在
   * diffuseTexture 還是 emissiveTexture，那正是要示範的差別
   */
  function createSkyBodyMaterial(name: string): StandardMaterial {
    const material = new StandardMaterial(name, scene)
    material.specularColor = new Color3(0, 0, 0)
    /** 不吃光照，畫面上的顏色就只剩自發光乘上貼圖 */
    material.disableLighting = true
    material.fogEnabled = false
    material.backFaceCulling = false
    material.alphaMode = Constants.ALPHA_ADD
    /** 相加混合要走半透明那條路才生效 */
    material.alpha = 0.999
    material.disableDepthWrite = true

    return material
  }

  const sunTexture = createSunTexture(babylon, scene)
  const sunMaterial = createSkyBodyMaterial('sun-material')
  const sunDisc = MeshBuilder.CreatePlane('sun-disc', { size: 3 }, scene)
  sunDisc.material = sunMaterial
  sunDisc.position.set(-3.2, 1.6, -8)
  sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL

  const moonTexture = createMoonTexture(babylon, scene)
  const moonMaterial = createSkyBodyMaterial('moon-material')
  const moonDisc = MeshBuilder.CreatePlane('moon-disc', { size: 2.4 }, scene)
  moonDisc.material = moonMaterial
  moonDisc.position.set(3.2, 1.8, -8)
  moonDisc.billboardMode = Mesh.BILLBOARDMODE_ALL

  const starTexture = createStarTexture(babylon, scene)
  const starMaterial = createSkyBodyMaterial('star-material')
  const starDome = MeshBuilder.CreateBox('star-field', { size: 40 }, scene)
  starDome.material = starMaterial
  starDome.infiniteDistance = true
  starDome.isPickable = false

  bodyList.value = [
    { material: sunMaterial, texture: sunTexture, baseColor: [1, 1, 1] },
    /** 月亮比太陽暗一階，它是反射的光不是自己在燒 */
    { material: moonMaterial, texture: moonTexture, baseColor: [0.86, 0.88, 0.95] },
  ]
  starBody.value = { material: starMaterial, texture: starTexture, baseColor: [1, 1, 1] }

  applySetting()

  return () => {
    bodyList.value = []
    starBody.value = undefined
    babylonModule.value = undefined
  }
}

function applySkyBody(body: SkyBody, visibility: number) {
  const babylon = babylonModule.value
  if (!babylon)
    return

  const { Color3 } = babylon
  const [red, green, blue] = body.baseColor

  if (isDiffuseMode.value) {
    /**
     * 掛在 diffuse 那條路
     *
     * 關掉光照之後最終顏色是 clamp(emissiveColor) × 貼圖，
     * 自發光的顏色就成了一個乾淨的乘數
     */
    body.material.diffuseTexture = body.texture
    body.material.emissiveTexture = null
    body.material.diffuseColor = new Color3(0, 0, 0)
    body.material.emissiveColor = new Color3(
      red * visibility,
      green * visibility,
      blue * visibility,
    )
    return
  }

  /**
   * 掛在 emissive 那條路
   *
   * 著色器裡自發光是「顏色加上貼圖」，
   * 所以顏色調成黑色貼圖照樣全亮
   */
  body.material.diffuseTexture = null
  body.material.emissiveTexture = body.texture
  body.material.diffuseColor = new Color3(0, 0, 0)
  body.material.emissiveColor = new Color3(0, 0, 0)
}

function applySetting() {
  for (const body of bodyList.value) {
    applySkyBody(body, bodyVisibility.value)
  }

  if (starBody.value) {
    applySkyBody(starBody.value, starVisibility.value)
  }
}

watch([isDiffuseMode, bodyVisibility, starVisibility], applySetting)
</script>
