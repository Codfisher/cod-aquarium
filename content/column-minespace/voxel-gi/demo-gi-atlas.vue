<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    :interactive="false"
    title="三維的格子攤平成二維的圖集"
    caption="每一層 Y 切片是一塊磚，磚並排成一張二維的圖。磚內的兩軸是 X 與 Z，跨磚才是 Y。排成一列也行，但那會做出一張又寬又扁的貼圖，容易撞上顯卡的單邊尺寸上限，所以磚數開平方根排成接近正方形。"
    :camera-alpha="Math.PI / 2"
    :camera-beta="Math.PI / 2"
    :camera-radius="11"
    :height="320"
  >
    <demo-slider
      v-model="sliceIndex"
      label="第幾層"
      :min="0"
      :max="7"
      :step="1"
      :digit="0"
      unit=" 層"
    />
    <demo-toggle
      v-model="squarePacking"
      label="磚排成接近正方形"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { DynamicTexture } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { bakeIndirectLight, buildGiAtlas, buildGiGrid, createDemoWorld, measureTilesPerRow } from './gi-world'

/** 一個紋素畫成幾個畫布像素，放大才看得出磚的邊界 */
const PIXEL_SCALE = 18
/** 畫布固定這麼大，圖集換排法時貼圖尺寸不必跟著換 */
const CANVAS_SIZE = 512

const sliceIndex = shallowRef(3)
const squarePacking = shallowRef(true)

const world = createDemoWorld()
const grid = buildGiGrid(world, 2, 1)
const indirectList = bakeIndirectLight(grid, {
  world,
  sunColor: [1, 0.96, 0.88],
  sunStrength: 1,
  bouncePassCount: 4,
  bounceStrength: 0.35,
  lampEnabled: true,
})

const tilesPerRow = computed(() => (
  squarePacking.value ? measureTilesPerRow(grid) : grid.gridY
))

const atlas = computed(() => buildGiAtlas(grid, indirectList, tilesPerRow.value))

const badge = computed(() => {
  const current = atlas.value
  return `圖集 ${current.width} × ${current.height}，一列 ${current.tilesPerRow} 塊`
})

const textureRef = shallowRef<DynamicTexture>()

function drawAtlas() {
  const texture = textureRef.value
  if (!texture)
    return

  const current = atlas.value
  const context = texture.getContext() as CanvasRenderingContext2D

  context.imageSmoothingEnabled = false
  context.fillStyle = '#0b1220'
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  /** 整張圖集置中，換排法時不會從角落長出去 */
  const originX = Math.round((CANVAS_SIZE - current.width * PIXEL_SCALE) / 2)
  const originY = Math.round((CANVAS_SIZE - current.height * PIXEL_SCALE) / 2)

  for (let y = 0; y < current.height; y++) {
    for (let x = 0; x < current.width; x++) {
      const pixel = (y * current.width + x) * 4
      /** 間接光很淡，畫出來要放大，不然整張圖集接近全黑 */
      const red = Math.min(255, (current.data[pixel] ?? 0) * 3.2)
      const green = Math.min(255, (current.data[pixel + 1] ?? 0) * 3.2)
      const blue = Math.min(255, (current.data[pixel + 2] ?? 0) * 3.2)

      context.fillStyle = `rgb(${red}, ${green}, ${blue})`
      context.fillRect(
        originX + x * PIXEL_SCALE,
        originY + y * PIXEL_SCALE,
        PIXEL_SCALE,
        PIXEL_SCALE,
      )
    }
  }

  /** 磚的邊界與層號，跨磚才是 Y 這件事得畫出來才看得懂 */
  const tileWidth = grid.gridX * PIXEL_SCALE
  const tileHeight = grid.gridZ * PIXEL_SCALE
  const tileRowCount = Math.ceil(grid.gridY / current.tilesPerRow)

  context.font = '13px sans-serif'
  context.textBaseline = 'top'

  for (let tileY = 0; tileY < tileRowCount; tileY++) {
    for (let tileX = 0; tileX < current.tilesPerRow; tileX++) {
      const slice = tileY * current.tilesPerRow + tileX
      const left = originX + tileX * tileWidth
      const top = originY + tileY * tileHeight
      const isSelected = slice === sliceIndex.value

      context.strokeStyle = isSelected ? '#818cf8' : 'rgba(148, 163, 184, 0.45)'
      context.lineWidth = isSelected ? 3 : 1
      context.strokeRect(left, top, tileWidth, tileHeight)

      if (slice >= grid.gridY)
        continue

      context.fillStyle = isSelected ? '#c7d2fe' : 'rgba(148, 163, 184, 0.75)'
      context.fillText(`Y=${slice}`, left + 5, top + 4)
    }
  }

  texture.update()
}

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { DynamicTexture, MeshBuilder, StandardMaterial, Color3, Texture } = babylon

  scene.clearColor = new babylon.Color4(0.04, 0.05, 0.08, 1)

  const texture = new DynamicTexture(
    'atlas-preview',
    { width: CANVAS_SIZE, height: CANVAS_SIZE },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  textureRef.value = texture

  const material = new StandardMaterial('atlas-material', scene)
  material.diffuseTexture = texture
  material.diffuseColor = new Color3(0, 0, 0)
  material.emissiveColor = new Color3(1, 1, 1)
  material.specularColor = new Color3(0, 0, 0)
  material.disableLighting = true
  material.backFaceCulling = false

  const plane = MeshBuilder.CreatePlane('atlas-plane', { size: 9 }, scene)
  plane.material = material
  plane.isPickable = false

  drawAtlas()

  return () => {
    material.dispose()
    texture.dispose()
    plane.dispose()
    textureRef.value = undefined
  }
}

watch([sliceIndex, squarePacking], drawAtlas)
</script>
