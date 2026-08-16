<template>
  <compare-grid
    title="光暈的衰減曲線"
    caption="兩團光暈的峰值與半徑完全一樣，差別只在衰減曲線。左邊是線性，走到底突然變成零，即使兩側只差 1/255，人眼還是會沿著那圈界線看到一道邊，這叫馬赫帶效應。右邊用 (1 - t²)^n，值與斜率在邊緣同時為零，光暈是化開的而不是切斷的。"
  >
    <demo-frame
      :setup="setupLinear"
      badge="線性衰減"
      compact
      v-bind="cameraParam"
    />
    <demo-frame
      :setup="setupSmooth"
      badge="(1 - t²)^n"
      compact
      v-bind="cameraParam"
    />
  </compare-grid>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import CompareGrid from '../demo/compare-grid.vue'
import DemoFrame from '../demo/demo-frame.vue'

const cameraParam = {
  cameraAlpha: -Math.PI / 2,
  cameraBeta: Math.PI / 2,
  cameraRadius: 10,
  cameraTarget: [0, 0, 0] as [number, number, number],
  height: 240,
  interactive: false,
}

const TEXTURE_SIZE = 128
const STOP_COUNT = 32

/** 這一族曲線在 t = 1 時值與斜率同時為零 */
function measureSmoothFalloff(ratio: number): number {
  const base = Math.max(0, 1 - ratio * ratio)

  return 0.55 * base ** 8 + 0.45 * base ** 3
}

/** 線性衰減，走到底斜率仍然是負的，那個轉折就是問題所在 */
function measureLinearFalloff(ratio: number): number {
  return Math.max(0, 1 - ratio)
}

function createScene(
  { babylon, scene }: BabylonDemoContext,
  measureFalloff: (ratio: number) => number,
) {
  const { Color3, Constants, DynamicTexture, Mesh, MeshBuilder, StandardMaterial } = babylon

  /**
   * 背景要是平滑的漸層
   *
   * 馬赫帶只有在「亮度變化本來很連續」的地方才看得出來，
   * 背景給純色的話那道邊反而不明顯
   */
  scene.clearColor = new babylon.Color4(0.09, 0.11, 0.18, 1)

  const backdrop = MeshBuilder.CreatePlane('backdrop', { width: 40, height: 26 }, scene)
  backdrop.position.z = 6

  const backdropTexture = new DynamicTexture(
    'backdrop-texture',
    { width: 256, height: 256 },
    scene,
    true,
  )
  const backdropContext = backdropTexture.getContext() as CanvasRenderingContext2D
  const backdropGradient = backdropContext.createLinearGradient(0, 0, 0, 256)
  backdropGradient.addColorStop(0, 'rgb(14, 20, 44)')
  backdropGradient.addColorStop(1, 'rgb(48, 56, 88)')
  backdropContext.fillStyle = backdropGradient
  backdropContext.fillRect(0, 0, 256, 256)
  backdropTexture.update()

  const backdropMaterial = new StandardMaterial('backdrop-material', scene)
  backdropMaterial.diffuseTexture = backdropTexture
  backdropMaterial.diffuseColor = new Color3(0, 0, 0)
  backdropMaterial.specularColor = new Color3(0, 0, 0)
  backdropMaterial.emissiveColor = new Color3(1, 1, 1)
  backdropMaterial.disableLighting = true
  backdrop.material = backdropMaterial

  /**
   * 衰減畫在顏色上而不是透明度上
   *
   * 光暈走的是相加混合，透明度在那條路上不起作用。
   * 把該有的透明度先乘進顏色裡，一路收到全黑就好
   */
  const texture = new DynamicTexture(
    'glow-texture',
    { width: TEXTURE_SIZE, height: TEXTURE_SIZE },
    scene,
    false,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  const center = TEXTURE_SIZE / 2
  const gradient = context.createRadialGradient(center, center, 0, center, center, center)

  const peakColor: [number, number, number] = [230, 200, 140]
  for (let index = 0; index <= STOP_COUNT; index++) {
    const ratio = index / STOP_COUNT
    const intensity = measureFalloff(ratio)
    gradient.addColorStop(
      ratio,
      `rgb(${Math.round(peakColor[0] * intensity)}, ${Math.round(peakColor[1] * intensity)}, ${Math.round(peakColor[2] * intensity)})`,
    )
  }

  context.fillStyle = gradient
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  texture.update()

  const material = new StandardMaterial('glow-material', scene)
  material.diffuseTexture = texture
  material.diffuseColor = new Color3(0, 0, 0)
  material.specularColor = new Color3(0, 0, 0)
  material.emissiveColor = new Color3(1, 1, 1)
  material.disableLighting = true
  material.backFaceCulling = false
  material.alphaMode = Constants.ALPHA_ADD
  /** 相加混合要走半透明那條路才生效 */
  material.alpha = 0.999
  material.disableDepthWrite = true

  /**
   * 用圓盤不用方片
   *
   * 一旦邊界上還剩下任何一點亮度，方片露出來的會是一個方形
   */
  const glow = MeshBuilder.CreateDisc('glow', { radius: 4, tessellation: 48 }, scene)
  glow.material = material
  glow.billboardMode = Mesh.BILLBOARDMODE_ALL
}

function setupLinear(context: BabylonDemoContext) {
  createScene(context, measureLinearFalloff)
}

function setupSmooth(context: BabylonDemoContext) {
  createScene(context, measureSmoothFalloff)
}
</script>
