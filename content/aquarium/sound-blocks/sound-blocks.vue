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
import type { Camera, IShadowLight, Light, Mesh, Scene } from '@babylonjs/core'
import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  PointerEventTypes,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { createTreeBlock } from './domains/blocks'
import { Hex, HexLayout } from './domains/hex-grid'
import { useBabylonScene } from './use-babylon-scene'

function createGround({ scene }: { scene: Scene }) {
  const ground = MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene)
  const mat = new StandardMaterial('groundMat', scene)
  mat.diffuseColor = new Color3(0.98, 0.98, 0.98)
  ground.material = mat
  ground.receiveShadows = true
  return ground
}

function offsetOddRToCube(col: number, row: number) {
  const q = col - ((row - (row & 1)) / 2)
  const r = row
  const s = -q - r
  return new Hex(q, r, s)
}

function hexKey(h: { q: number; r: number; s: number }) {
  return `${h.q},${h.r},${h.s}`
}

function generateHexagon(sideLength: number) {
  // sideLength=4 => radius=3（中心到角 3 格）
  const radius = sideLength - 1
  const results: Hex[] = []

  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius)
    const rMax = Math.min(radius, -q + radius)
    for (let r = rMin; r <= rMax; r++) {
      results.push(new Hex(q, r, -q - r))
    }
  }

  return results
}

function createHexTiles(scene: Scene, layout: HexLayout, sideLength = 4) {
  const base = MeshBuilder.CreateCylinder('hexTileBase', {
    diameter: layout.size * 2,
    height: 0.02,
    tessellation: 6,
  }, scene)

  base.rotation.y = Math.PI / 6
  base.isPickable = false
  base.isVisible = false

  const baseMat = new StandardMaterial('hexTileBaseMat', scene)
  baseMat.diffuseColor = new Color3(0.2, 0.6, 1.0)
  baseMat.emissiveColor = new Color3(0.2, 0.6, 1.0)
  baseMat.specularColor = new Color3(0, 0, 0)
  baseMat.backFaceCulling = false
  baseMat.needDepthPrePass = true
  base.material = baseMat

  const tileList: Mesh[] = []
  const materialList: StandardMaterial[] = []
  const targets = new Map<string, number>()

  const hexList = generateHexagon(sideLength)

  for (const hex of hexList) {
    const key = hexKey(hex)

    const tile = base.clone(`hex_${key}`) as Mesh
    tile.isVisible = true
    tile.isPickable = true
    tile.position.copyFrom(layout.hexToWorld(hex, 0.02))

    const material = baseMat.clone(`hexMat_${key}`) as StandardMaterial
    material.alpha = 1
    tile.material = material

    tile.metadata = { hexKey: key, hex }

    tileList.push(tile)
    materialList.push(material)
    targets.set(key, 0)
  }

  return { tileList, materialList, targets }
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

const HOVER_ALPHA = 0.6
const FADE_SPEED = 14

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene } = params

    createGround({ scene })
    const shadowGenerator = createShadowGenerator(scene)

    await createTreeBlock({ scene, shadowGenerator })

    const layout = new HexLayout(HexLayout.pointy, 0.5, new Vector3(0, 0, 0))

    const { tileList, materialList, targets } = createHexTiles(scene, layout, 3)

    let hoveredKey = ''

    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERMOVE)
        return

      const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        (mesh) => !!mesh.metadata?.hexKey,
      )

      let nextKey = ''
      if (pick?.hit && pick.pickedMesh) {
        nextKey = pick.pickedMesh.metadata.hexKey
      }

      if (nextKey === hoveredKey)
        return

      if (hoveredKey)
        targets.set(hoveredKey, 0)

      hoveredKey = nextKey

      if (hoveredKey) {
        targets.set(hoveredKey, HOVER_ALPHA)
        // console.log('hover:', hoveredKey)
      }
    })

    scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000
      const alpha = 1 - Math.exp(-FADE_SPEED * dt)

      for (let i = 0; i < tileList.length; i++) {
        const tile = tileList[i]
        const material = materialList[i]
        if (!tile || !material) {
          continue
        }

        const key = tile.metadata.hexKey
        const target = targets.get(key) ?? 0

        material.alpha = material.alpha + (target - material.alpha) * alpha
      }
    })
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
