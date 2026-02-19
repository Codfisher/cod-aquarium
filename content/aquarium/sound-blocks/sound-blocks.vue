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
import type { Mesh, Scene } from '@babylonjs/core'
import {
  Color3,
  MeshBuilder,
  PointerEventTypes,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
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

function createHexTiles(scene: Scene, layout: HexLayout) {
  // 模板 mesh（不顯示）
  const base = MeshBuilder.CreateCylinder('hexTileBase', {
    diameter: layout.size * 2,
    height: 0.02,
    tessellation: 6,
  }, scene)

  base.rotation.y = Math.PI / 6 // 覺得方向不對可改 0 或 Math.PI/6
  base.isPickable = false
  base.isVisible = false

  const baseMat = new StandardMaterial('hexTileBaseMat', scene)
  baseMat.diffuseColor = new Color3(0.2, 0.6, 1.0)
  baseMat.emissiveColor = new Color3(0.2, 0.6, 1.0)
  baseMat.specularColor = new Color3(0, 0, 0)
  baseMat.backFaceCulling = false
  baseMat.needDepthPrePass = true
  base.material = baseMat

  const tiles: Mesh[] = []
  const materials: StandardMaterial[] = []
  const targets = new Map<string, number>() // key -> target alpha

  const rows = 4
  const cols = 4

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const h = offsetOddRToCube(col, row)
      const key = hexKey(h)

      const tile = base.clone(`hex_${col}_${row}`) as Mesh
      tile.isVisible = true
      tile.isPickable = true
      tile.position.copyFrom(layout.hexToWorld(h, 0.02)) // 抬高一點避免 z-fighting

      const material = baseMat.clone(`hexMat_${col}_${row}`) as StandardMaterial
      material.alpha = 0
      tile.material = material

      tile.metadata = { hexKey: key, hex: h }

      tiles.push(tile)
      materials.push(material)
      targets.set(key, 0)
    }
  }

  return { tiles, materials, targets }
}

const {
  canvasRef,
} = useBabylonScene({
  async init(params) {
    const { scene } = params

    createGround({ scene })

    const layout = new HexLayout(HexLayout.pointy, 1, new Vector3(0, 0, 0))

    const {
      tiles,
      materials,
      targets,
    } = createHexTiles(scene, layout)

    let hoveredKey = ''
    const hoverAlpha = 0.6
    const fadeSpeed = 14

    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERMOVE)
        return

      const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        (m) => !!(m as any)?.metadata?.hexKey,
      )

      let nextKey = ''
      if (pick?.hit && pick.pickedMesh) {
        nextKey = (pick.pickedMesh as any).metadata.hexKey as string
      }

      if (nextKey === hoveredKey)
        return

      // 舊的 hover：淡出
      if (hoveredKey)
        targets.set(hoveredKey, 0)

      hoveredKey = nextKey

      // 新的 hover：淡入
      if (hoveredKey) {
        targets.set(hoveredKey, hoverAlpha)
        // 你要印出是哪格：
        // console.log("hover:", hoveredKey)
      }
    })

    scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000
      const alpha = 1 - Math.exp(-fadeSpeed * dt)

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i]
        const mat = materials[i]
        if (!tile || !mat) {
          continue
        }

        const key = (tile.metadata as any).hexKey as string
        const target = targets.get(key) ?? 0

        mat.alpha = mat.alpha + (target - mat.alpha) * alpha
      }
    })
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
