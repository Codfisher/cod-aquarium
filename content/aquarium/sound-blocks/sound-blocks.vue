<template>
  <u-app>
    <div class="fixed w-dvw h-dvh m-0 p-4 bg-gray-100">
      <canvas
        v-once
        ref="canvasRef"
        class="canvas w-full h-full chamfer-5"
      />

      <div class=" absolute bottom-0 right-0 p-6 opacity-20">
        v{{ version }}
      </div>
    </div>
  </u-app>
</template>

<script setup lang="ts">
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core'
import {
  Color3,
  DirectionalLight,
  MeshBuilder,
  PointerEventTypes,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import USlideover from '@nuxt/ui/components/Slideover.vue'
import { useColorMode } from '@vueuse/core'
import { pipe, tap } from 'remeda'
import { h, ref, shallowRef } from 'vue'
import { version } from '../codstack/constants'
import { useBabylonScene } from './composables/use-babylon-scene'
import { useFontLoader } from './composables/use-font-loader'
import BlockPicker from './domains/block/block-picker.vue'
import { Hex, HexLayout } from './domains/hex-grid'

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

useFontLoader()

const COLOR_SELECTED = new Color3(0.25, 0.60, 1.00)
const COLOR_CANDIDATE = new Color3(0.3, 0.3, 0.3)
const COLOR_HOVER = COLOR_CANDIDATE

const ALPHA_SELECTED = 0.5
const ALPHA_CANDIDATE = 0.35
const ALPHA_HOVER = 0.65
const ALPHA_HIDDEN = 0.0

const FADE_SPEED = 14
/** 最大可放置半徑 */
const MAX_RADIUS = 2

interface HexMeshMetadata {
  hexKey: string;
  hex: Hex;
}

/** 取得或設定 hexMesh 的 metadata */
function hexMeshMetadata(mesh: Mesh | AbstractMesh, update?: Partial<HexMeshMetadata>): HexMeshMetadata {
  if (update) {
    mesh.metadata = {
      ...mesh.metadata,
      ...update,
    }
  }
  return {
    hexKey: mesh.metadata?.hexKey,
    hex: mesh.metadata?.hex,
  }
}

function hexKey(hex: Hex) {
  return `${hex.q},${hex.r},${hex.s}`
}

// --- Hex Tile 狀態 ---

const meshMap = new Map<string, Mesh>()
const materialMap = new Map<string, StandardMaterial>()
const selectedSet = new Set<string>()
const candidateMap = new Map<string, Hex>()
const targetAlphaMap = new Map<string, number>()
const targetColorMap = new Map<string, Color3>()

let hoveredKey = ''
let selectedKey = ''

/** 對齊模型與 hex 的大小 */
const HEX_SIZE = 0.575
const hexLayout = new HexLayout(HexLayout.pointy, HEX_SIZE, Vector3.Zero())
/** clone 用的基礎 hex mesh */
const baseHexMesh = shallowRef<Mesh>()

function spawnTile(hex: Hex, color: Color3, alpha: number): string {
  const sceneValue = scene.value
  const hexMesh = baseHexMesh.value

  const key = hexKey(hex)
  if (meshMap.has(key) || !sceneValue || !hexMesh)
    return key

  const mesh = hexMesh.clone(`hex_${key}`)
  mesh.isVisible = true
  mesh.isPickable = false
  mesh.position.copyFrom(hexLayout.hexToWorld(hex, 0.02))

  const material = new StandardMaterial(`mat_${key}`, sceneValue)
  material.diffuseColor = color.clone()
  material.emissiveColor = color.clone()
  material.specularColor = Color3.Black()
  material.backFaceCulling = false
  material.needDepthPrePass = true
  material.alpha = alpha
  mesh.material = material
  hexMeshMetadata(mesh, { hexKey: key, hex })

  meshMap.set(key, mesh)
  materialMap.set(key, material)
  targetAlphaMap.set(key, alpha)
  targetColorMap.set(key, color.clone())
  return key
}

function addCandidate(hex: Hex) {
  const key = hexKey(hex)
  if (selectedSet.has(key) || candidateMap.has(key))
    return
  if (hex.len() > MAX_RADIUS)
    return

  spawnTile(hex, COLOR_CANDIDATE, ALPHA_HIDDEN)
  targetAlphaMap.set(key, ALPHA_CANDIDATE)
  targetColorMap.set(key, COLOR_CANDIDATE.clone())
  candidateMap.set(key, hex)
  meshMap.get(key)!.isPickable = true
}

function deselectCurrent() {
  if (!selectedKey)
    return

  const previousHex = hexMeshMetadata(meshMap.get(selectedKey)!).hex
  const previousKey = selectedKey
  selectedSet.delete(previousKey)

  candidateMap.set(previousKey, previousHex)
  targetAlphaMap.set(previousKey, ALPHA_CANDIDATE)
  targetColorMap.set(previousKey, COLOR_CANDIDATE.clone())
  meshMap.get(previousKey)!.isPickable = true

  selectedKey = ''
  blockPickerRef.value?.close()
}

function selectTile(hex: Hex) {
  const key = hexKey(hex)
  if (selectedSet.has(key))
    return

  deselectCurrent()

  candidateMap.delete(key)
  selectedSet.add(key)
  selectedKey = key

  targetAlphaMap.set(key, ALPHA_SELECTED)
  targetColorMap.set(key, COLOR_SELECTED.clone())
  meshMap.get(key)!.isPickable = false

  openBlockPicker()
}

// --- Scene 初始化 ---

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

const { canvasRef, scene } = useBabylonScene({
  async init({ scene, engine }) {
    createGround({ scene })
    createShadowGenerator(scene)

    baseHexMesh.value = pipe(
      MeshBuilder.CreateCylinder('hexBase', {
        diameter: hexLayout.size * 2,
        height: 0.04,
        tessellation: 6,
      }, scene),
      tap((mesh) => {
        mesh.rotation.y = Math.PI / 6
        mesh.isPickable = false
        mesh.isVisible = false
      }),
    )

    // 原點為初始候補格
    addCandidate(new Hex(0, 0, 0))

    scene.onPointerObservable.add((info) => {
      const isMove = info.type === PointerEventTypes.POINTERMOVE
      const isClick = info.type === PointerEventTypes.POINTERTAP

      if (!isMove && !isClick)
        return

      const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        (mesh) => !!hexMeshMetadata(mesh).hexKey && candidateMap.has(hexMeshMetadata(mesh).hexKey),
      )

      const pickedKey: string = pick?.hit && pick.pickedMesh
        ? (hexMeshMetadata(pick.pickedMesh).hexKey as string)
        : ''

      // hover 變化
      if (isMove && pickedKey !== hoveredKey) {
        if (hoveredKey && candidateMap.has(hoveredKey)) {
          targetAlphaMap.set(hoveredKey, ALPHA_CANDIDATE)
          targetColorMap.set(hoveredKey, COLOR_CANDIDATE.clone())
        }
        hoveredKey = pickedKey
        if (hoveredKey && candidateMap.has(hoveredKey)) {
          targetAlphaMap.set(hoveredKey, ALPHA_HOVER)
          targetColorMap.set(hoveredKey, COLOR_HOVER.clone())
        }
      }

      // 點擊選取
      if (isClick && pickedKey && candidateMap.has(pickedKey)) {
        const hex = candidateMap.get(pickedKey)!
        hoveredKey = ''
        selectTile(hex)
      }
      else if (isClick && !pickedKey) {
        deselectCurrent()
      }
    })

    scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime() / 1000
      const t = 1 - Math.exp(-FADE_SPEED * dt)

      for (const [key, mat] of materialMap) {
        const ta = targetAlphaMap.get(key) ?? ALPHA_HIDDEN
        const tc = targetColorMap.get(key)

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

const overlay = useOverlay()

const blockPickerRef = shallowRef<ReturnType<typeof overlay.create>>()
function openBlockPicker() {
  const slideover = overlay.create(h(
    USlideover,
    {
      side: 'bottom',
      modal: false,
      inset: true,
      ui: {
        content: 'chamfer-3 flex justify-center items-center bg-transparent',
      },
    },
    {
      content: () => h(BlockPicker),
    },
  ))
  slideover.open()
  blockPickerRef.value = slideover
}
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
