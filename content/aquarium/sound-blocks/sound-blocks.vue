<template>
  <div class="fixed w-dvw h-dvh p-0 m-0">
    <canvas
      v-once
      ref="canvasRef"
      class="canvas w-full h-full"
    />
  </div>
</template>

<script setup lang="ts">
import type { Scene } from '@babylonjs/core'
import {
  Color3,
  DirectionalLight,
  MeshBuilder,
  PointerEventTypes,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { onMounted, onUnmounted } from 'vue'
import { createTreeBlock } from './domains/blocks'
import { useBabylonScene } from './use-babylon-scene'
import { HexLayout, generateHexArea } from './domains/hex-grid'

function createGround({ scene }: {
  scene: Scene;
}) {
  const ground = MeshBuilder.CreateGround('ground', {
    width: 1000,
    height: 1000,
  }, scene)

  const groundMaterial = new StandardMaterial('groundMaterial', scene)
  groundMaterial.diffuseColor = new Color3(0.98, 0.98, 0.98)
  ground.material = groundMaterial

  ground.receiveShadows = true
  return ground
}

function createHoverHex(scene: Scene, layout: HexLayout) {
  const hover = MeshBuilder.CreateCylinder("hoverHex", {
    diameter: layout.size * 2,
    height: 0.02,
    tessellation: 6,
  }, scene)

  hover.isPickable = false
  hover.setEnabled(false)        // 沒指到格子時先隱藏
  hover.rotation.y = Math.PI / 6 // 常用：轉 30° 讓視覺對齊（依你的格子方向可調整）

  const mat = new StandardMaterial("hoverHexMat", scene)
  mat.diffuseColor = new Color3(0.2, 0.6, 1.0)
  mat.emissiveColor = new Color3(0.2, 0.6, 1.0) // 讓它更亮、更像 highlight
  mat.specularColor = new Color3(0, 0, 0)
  mat.alpha = 0.35
  mat.backFaceCulling = false

  // 透明物件有時會被深度遮住，用一點小技巧更穩：
  mat.needDepthPrePass = true

  hover.material = mat
  return hover
}

function createShadowGenerator(scene: Scene) {
  const light = new DirectionalLight('dir01', new Vector3(-5, -5, 0), scene)
  light.intensity = 0.7

  const shadowGenerator = new ShadowGenerator(1024, light)
  shadowGenerator.bias = 0.000001
  shadowGenerator.normalBias = 0.0001
  shadowGenerator.usePercentageCloserFiltering = true
  shadowGenerator.forceBackFacesOnly = true

  return shadowGenerator
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene } = params
    const shadowGenerator = createShadowGenerator(scene)

    const ground = createGround({ scene })

    // await createTreeBlock({ scene, shadowGenerator })

    const layout = new HexLayout(HexLayout.pointy, 0.5, new Vector3(0, 0, 0))
    const hexes = generateHexArea(20)

    const hoverHex = createHoverHex(scene, layout)

    let lastKey = ''

    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERMOVE) return

      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === ground)
      if (!pick?.hit || !pick.pickedPoint) {
        hoverHex.setEnabled(false)
        lastKey = ''
        return
      }

      const world = pick.pickedPoint
      const hex = layout.worldToHexRounded(world)

      const key = `${hex.q},${hex.r},${hex.s}`
      if (key === lastKey) return
      lastKey = key

      const pos = layout.hexToWorld(hex, 0.02) // 比 ground 再高一點
      hoverHex.position.copyFrom(pos)
      hoverHex.setEnabled(true)
    })
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
