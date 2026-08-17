<template>
  <compare-grid
    :columns="3"
    title="材質 tint 與逐像素重新上色"
    caption="三邊的貼圖與光照完全一樣，差別只在染色的位置。中間那株是把材質的 diffuseColor 設成橘色，紅通道再怎麼開也只能停在貼圖本身的值，於是綠葉只是變暗；右邊在 Canvas 上逐像素重算，才真的變成秋天的顏色。"
  >
    <demo-frame
      :setup="setupOriginal"
      badge="原本的綠"
      compact
      v-bind="cameraParam"
    />
    <demo-frame
      :setup="setupMaterialTint"
      badge="材質 tint 橘色"
      compact
      v-bind="cameraParam"
    />
    <demo-frame
      :setup="setupPixelRecolor"
      badge="逐像素重新上色"
      compact
      v-bind="cameraParam"
    />
  </compare-grid>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import CompareGrid from '../demo/compare-grid.vue'
import DemoFrame from '../demo/demo-frame.vue'
import { createPlantTexture, createSandTexture, recolorTexture } from '../demo/pixel-texture'

/** 三個場景要用同一組鏡頭參數，不然比的會是角度 */
const cameraParam = {
  cameraAlpha: -Math.PI / 2,
  cameraBeta: Math.PI / 2.7,
  cameraRadius: 4,
  cameraTarget: [0, 0.5, 0] as [number, number, number],
  height: 220,
}

/** 秋天的橘黃，三種做法都用同一組數字才比得出差別 */
const AUTUMN_TINT: [number, number, number] = [1.35, 0.72, 0.16]

type RecolorMode = 'none' | 'materialTint' | 'pixelRecolor'

function createScene({ babylon, scene }: BabylonDemoContext, mode: RecolorMode) {
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

  const sun = new DirectionalLight('sun', new Vector3(0.4, -0.75, -0.5), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.8
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 12, height: 12 }, scene)
  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = sandMaterial

  const sourceTexture = createPlantTexture(
    { babylon, scene, name: 'plant-source', hasMipmap: false },
  )

  /**
   * 逐像素那一份要另外做一張貼圖
   *
   * 這正是 EP03 的重點：材質那一層做不到的事，
   * 只能在貼圖被送上 GPU 之前先算好
   */
  const texture = mode === 'pixelRecolor'
    ? recolorTexture(
        { babylon, scene, name: 'plant-recolored', hasMipmap: false },
        sourceTexture,
        AUTUMN_TINT,
        true,
      )
    : sourceTexture

  texture.hasAlpha = true

  const plantMaterial = new StandardMaterial('plant', scene)
  plantMaterial.diffuseTexture = texture
  plantMaterial.useAlphaFromDiffuseTexture = true
  plantMaterial.transparencyMode = Material.MATERIAL_ALPHATEST
  plantMaterial.alphaCutOff = 0.5
  plantMaterial.backFaceCulling = false
  plantMaterial.twoSidedLighting = false
  plantMaterial.specularColor = new Color3(0, 0, 0)

  /**
   * 材質這一層的染色
   *
   * 著色器先把「光照 × diffuseColor」夾在 1 以內，再乘上貼圖的顏色，
   * 所以某個通道最亮就是貼圖本身的值。綠葉的紅只有 0.26，
   * 這裡填 1.35 也還是 0.26
   */
  if (mode === 'materialTint') {
    plantMaterial.diffuseColor = new Color3(...AUTUMN_TINT)
  }

  const spotList: [number, number][] = [
    [0, 0],
    [-1.2, 0.5],
    [1.1, -0.4],
    [0.4, 1.2],
  ]

  for (const [x, z] of spotList) {
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const plane = MeshBuilder.CreatePlane(`plant-${x}-${z}-${angle}`, { size: 1 }, scene)
      plane.position.set(x, 0.5, z)
      plane.rotation.y = angle
      plane.material = plantMaterial

      /** 法線統一朝上，整株取同一個亮度（見 EP02） */
      const normalList = plane.getVerticesData('normal')
      if (normalList) {
        for (let index = 0; index < normalList.length; index += 3) {
          normalList[index] = 0
          normalList[index + 1] = 1
          normalList[index + 2] = 0
        }
        plane.setVerticesData('normal', normalList)
      }
    }
  }
}

function setupOriginal(context: BabylonDemoContext) {
  createScene(context, 'none')
}

function setupMaterialTint(context: BabylonDemoContext) {
  createScene(context, 'materialTint')
}

function setupPixelRecolor(context: BabylonDemoContext) {
  createScene(context, 'pixelRecolor')
}
</script>
