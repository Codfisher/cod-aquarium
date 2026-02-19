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
  DirectionalLight,
  MeshBuilder,
  PointerEventTypes,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { pipe, tap } from 'remeda'
import { Hex, HexLayout } from './domains/hex-grid'
import { useBabylonScene } from './use-babylon-scene'

const COLOR_PLACED = new Color3(0.25, 0.60, 1.00) // 藍（已放置）
const COLOR_CANDIDATE = new Color3(0.55, 0.55, 0.55) // 灰（候補可點擊）
const COLOR_HOVER = new Color3(0.50, 0.82, 1.00) // 淡藍（hover 候補）

const ALPHA_PLACED = 1.0
const ALPHA_CANDIDATE = 0.35
const ALPHA_HOVER = 0.65
const ALPHA_HIDDEN = 0.0

const FADE_SPEED = 14

function hexKey(hex: Hex) {
  return `${hex.q},${hex.r},${hex.s}`
}

function createGround({ scene }: { scene: Scene }) {
  const ground = MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene)
  const material = new StandardMaterial('groundMat', scene)

  material.diffuseColor = new Color3(0.98, 0.98, 0.98)
  ground.material = material
  ground.receiveShadows = true
  return ground
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

const { canvasRef } = useBabylonScene({
  async init({ scene }) {
    createGround({ scene })
    createShadowGenerator(scene)

    const layout = new HexLayout(HexLayout.pointy, 0.5, Vector3.Zero())

    // 基礎 mesh（隱藏，用來 clone）
    const baseMesh = pipe(
      MeshBuilder.CreateCylinder('hexBase', {
        diameter: layout.size * 2,
        height: 0.04,
        tessellation: 6,
      }, scene),
      tap((mesh) => {
        mesh.rotation.y = Math.PI / 6
        mesh.isPickable = false
        mesh.isVisible = false
      }),
    )

    const meshMap = new Map<string, Mesh>()
    const materialMap = new Map<string, StandardMaterial>()
    const placedSet = new Set<string>()
    const candidateMap = new Map<string, Hex>()
    const tgtAlphaMap = new Map<string, number>()
    const tgtColorMap = new Map<string, Color3>()

    let hoveredKey = ''

    function spawnTile(hex: Hex, color: Color3, alpha: number): string {
      const key = hexKey(hex)
      if (meshMap.has(key))
        return key

      const mesh = baseMesh.clone(`hex_${key}`) as Mesh
      mesh.isVisible = true
      mesh.isPickable = false
      mesh.position.copyFrom(layout.hexToWorld(hex, 0.02))

      const material = new StandardMaterial(`mat_${key}`, scene)
      material.diffuseColor = color.clone()
      material.emissiveColor = color.clone()
      material.specularColor = Color3.Black()
      material.backFaceCulling = false
      material.needDepthPrePass = true
      material.alpha = alpha
      mesh.material = material
      mesh.metadata = { hexKey: key, hex }

      meshMap.set(key, mesh)
      materialMap.set(key, material)
      tgtAlphaMap.set(key, alpha)
      tgtColorMap.set(key, color.clone())
      return key
    }

    const MAX_RADIUS = 2

    function addCandidate(hex: Hex) {
      const key = hexKey(hex)
      if (placedSet.has(key) || candidateMap.has(key))
        return
      if (hex.len() > MAX_RADIUS)
        return

      spawnTile(hex, COLOR_CANDIDATE, ALPHA_HIDDEN)
      // 從隱藏 fade in 到 CANDIDATE
      tgtAlphaMap.set(key, ALPHA_CANDIDATE)
      tgtColorMap.set(key, COLOR_CANDIDATE.clone())
      candidateMap.set(key, hex)
      meshMap.get(key)!.isPickable = true
    }

    function placeTile(hex: Hex) {
      const key = hexKey(hex)
      if (placedSet.has(key))
        return

      candidateMap.delete(key)
      placedSet.add(key)

      spawnTile(hex, COLOR_PLACED, ALPHA_CANDIDATE)
      tgtAlphaMap.set(key, ALPHA_PLACED)
      tgtColorMap.set(key, COLOR_PLACED.clone())
      meshMap.get(key)!.isPickable = false

      // 展開六個方向的候補
      for (let d = 0; d < 6; d++) {
        addCandidate(hex.neighbor(d))
      }
    }

    placeTile(new Hex(0, 0, 0))

    scene.onPointerObservable.add((info) => {
      const isMove = info.type === PointerEventTypes.POINTERMOVE
      const isClick = info.type === PointerEventTypes.POINTERDOWN

      if (!isMove && !isClick)
        return

      const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        (mesh) => !!mesh.metadata?.hexKey && candidateMap.has(mesh.metadata.hexKey),
      )

      const pickedKey: string = pick?.hit && pick.pickedMesh
        ? (pick.pickedMesh.metadata.hexKey as string)
        : ''

      // hover 變化
      if (isMove && pickedKey !== hoveredKey) {
        // 還原舊 hover
        if (hoveredKey && candidateMap.has(hoveredKey)) {
          tgtAlphaMap.set(hoveredKey, ALPHA_CANDIDATE)
          tgtColorMap.set(hoveredKey, COLOR_CANDIDATE.clone())
        }
        hoveredKey = pickedKey
        // 設定新 hover
        if (hoveredKey && candidateMap.has(hoveredKey)) {
          tgtAlphaMap.set(hoveredKey, ALPHA_HOVER)
          tgtColorMap.set(hoveredKey, COLOR_HOVER.clone())
        }
      }

      // 點擊放置
      if (isClick && pickedKey && candidateMap.has(pickedKey)) {
        const hex = candidateMap.get(pickedKey)!
        hoveredKey = ''
        placeTile(hex)
      }
    })

    scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000
      const t = 1 - Math.exp(-FADE_SPEED * dt)

      for (const [key, mat] of materialMap) {
        const ta = tgtAlphaMap.get(key) ?? ALPHA_HIDDEN
        const tc = tgtColorMap.get(key)

        mat.alpha = mat.alpha + (ta - mat.alpha) * t

        if (tc) {
          mat.emissiveColor.r += (tc.r - mat.emissiveColor.r) * t
          mat.emissiveColor.g += (tc.g - mat.emissiveColor.g) * t
          mat.emissiveColor.b += (tc.b - mat.emissiveColor.b) * t
          mat.diffuseColor.copyFrom(mat.emissiveColor)
        }
      }
    })
  },
})
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
