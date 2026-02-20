<template>
  <u-app>
    <div class="fixed w-dvw h-dvh m-0 p-5 bg-gray-100">
      <div
        class="w-full h-full chamfer-5"
        :style="canvasStyle"
      >
        <canvas
          v-once
          ref="canvasRef"
          class="canvas w-full h-full"
        />
      </div>

      <div class=" absolute bottom-0 right-0 p-1 opacity-20 text-xs">
        v{{ version }}
      </div>
    </div>

    <!-- u-slideover 開啟動畫不穩動，不知道為甚麼會抖動 -->
    <!-- <u-slideover
      v-model:open="blockPickerVisible"
      side="bottom"
      :modal="false"
      inset
      :ui="{
        content: 'chamfer-3 flex justify-center items-center bg-transparent',
      }"
      title="選擇積木"
      description="選擇積木"
    >
      <template #content>
        <block-picker @select="handleSelectBlock" />
      </template>
</u-slideover> -->

    <div
      class=" fixed bottom-0 right-0 w-full flex justify-center p-10 duration-300 ease-in-out"
      :class="{
        'translate-y-0': blockPickerVisible,
        'translate-y-full': !blockPickerVisible,
      }"
    >
      <block-picker @select="handleSelectBlock" />
    </div>
  </u-app>
</template>

<script setup lang="ts">
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core'
import type { CSSProperties } from 'vue'
import type { Block } from './domains/block/builder'
import type { BlockType } from './domains/block/builder/data'
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
import { useColorMode, whenever } from '@vueuse/core'
import { pipe, tap } from 'remeda'
import { computed, h, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { version } from '../codstack/constants'
import { useBabylonScene } from './composables/use-babylon-scene'
import { useFontLoader } from './composables/use-font-loader'
import { useThumbnailGenerator } from './composables/use-thumbnail-generator'
import BlockPicker from './domains/block/block-picker.vue'
import { createBlock } from './domains/block/builder'
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
  hex: Hex;
}

/** 取得或設定 hexMesh 的 metadata */
function hexMeshMetadata(mesh?: Mesh | AbstractMesh, update?: Partial<HexMeshMetadata>): HexMeshMetadata | undefined {
  if (!mesh) {
    return undefined
  }
  if (update) {
    mesh.metadata = {
      ...mesh.metadata,
      ...update,
    }
  }
  if (!mesh.metadata?.hex) {
    return
  }

  return {
    hex: mesh.metadata.hex,
  }
}

// --- Hex Tile 狀態 ---

/** key 來自 Hex.key() */
const meshMap = new Map<string, Mesh>()
const tileMaterialMap = new Map<string, StandardMaterial>()
const selectedTileSet = new Set<string>()
const candidateTileMap = new Map<string, Hex>()
const targetTileAlphaMap = new Map<string, number>()
const targetTileColorMap = new Map<string, Color3>()

const placedBlockMap = new Map<string, Block>()

const hoveredTile = shallowRef<Hex>()
const selectedTile = shallowRef<Hex>()

/** 對齊模型與 hex 的大小 */
const HEX_SIZE = 0.575
const hexLayout = new HexLayout(HexLayout.pointy, HEX_SIZE, Vector3.Zero())
/** clone 用的基礎 hex mesh */
const baseHexMesh = shallowRef<Mesh>()

async function spawnBlock(blockType: BlockType, hex: Hex) {
  const block = await createBlock({
    type: blockType,
    scene: scene.value!,
    shadowGenerator: shadowGenerator.value!,
  })
  block.rootNode.position.copyFrom(hexLayout.hexToWorld(hex))

  placedBlockMap.set(hex.key(), block)
}

function spawnTile(hex: Hex, color: Color3, alpha: number): string {
  const sceneValue = scene.value
  const hexMesh = baseHexMesh.value

  const key = hex.key()
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
  hexMeshMetadata(mesh, { hex })

  meshMap.set(key, mesh)
  tileMaterialMap.set(key, material)
  targetTileAlphaMap.set(key, alpha)
  targetTileColorMap.set(key, color.clone())
  return key
}

function addCandidate(hex: Hex) {
  const key = hex.key()
  if (selectedTileSet.has(key) || candidateTileMap.has(key))
    return
  if (hex.len() > MAX_RADIUS)
    return

  spawnTile(hex, COLOR_CANDIDATE, ALPHA_HIDDEN)
  targetTileAlphaMap.set(key, ALPHA_CANDIDATE)
  targetTileColorMap.set(key, COLOR_CANDIDATE.clone())
  candidateTileMap.set(key, hex)
  meshMap.get(key)!.isPickable = true
}

function deselectCurrent() {
  if (!selectedTile.value)
    return

  const key = selectedTile.value.key()

  const previousHex = hexMeshMetadata(meshMap.get(key)!)!.hex
  selectedTileSet.delete(key)

  candidateTileMap.set(key, previousHex)
  targetTileAlphaMap.set(key, ALPHA_CANDIDATE)
  targetTileColorMap.set(key, COLOR_CANDIDATE.clone())
  meshMap.get(key)!.isPickable = true

  selectedTile.value = undefined
  blockPickerVisible.value = false
}

function selectTile(hex: Hex) {
  const key = hex.key()
  if (selectedTileSet.has(key))
    return

  deselectCurrent()

  candidateTileMap.delete(key)
  selectedTileSet.add(key)
  selectedTile.value = hex

  targetTileAlphaMap.set(key, ALPHA_SELECTED)
  targetTileColorMap.set(key, COLOR_SELECTED.clone())

  const mesh = meshMap.get(key)
  if (mesh) {
    mesh.isPickable = false
  }

  openBlockPicker()
}

// --- Scene 初始化 ---

const shadowGenerator = shallowRef<ShadowGenerator>()

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
    shadowGenerator.value = createShadowGenerator(scene)

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
        (mesh) => {
          const key = hexMeshMetadata(mesh)?.hex.key()
          if (!key || placedBlockMap.has(key)) {
            return false
          }

          return candidateTileMap.has(key) || selectedTileSet.has(key)
        },
      )

      const pickedKey: string = pick?.hit && pick.pickedMesh
        ? (hexMeshMetadata(pick.pickedMesh)?.hex?.key() as string)
        : ''

      const hoveredKey = hoveredTile.value?.key()

      // hover 變化
      if (isMove && pickedKey !== hoveredKey) {
        // 還原舊 hover
        if (hoveredKey && candidateTileMap.has(hoveredKey)) {
          targetTileAlphaMap.set(hoveredKey, ALPHA_CANDIDATE)
          targetTileColorMap.set(hoveredKey, COLOR_CANDIDATE.clone())
        }
        hoveredTile.value = pick.pickedMesh?.metadata?.hex
        // 設定新 hover
        if (pickedKey && candidateTileMap.has(pickedKey)) {
          targetTileAlphaMap.set(pickedKey, ALPHA_HOVER)
          targetTileColorMap.set(pickedKey, COLOR_HOVER.clone())
        }
      }

      // 點擊選取
      if (isClick && pickedKey && candidateTileMap.has(pickedKey)) {
        const hex = candidateTileMap.get(pickedKey)
        if (hex) {
          hoveredTile.value = undefined
          selectTile(hex)
        }
      }
      else if (isClick && !pickedKey) {
        deselectCurrent()
      }
    })

    scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime() / 1000
      const t = 1 - Math.exp(-FADE_SPEED * dt)

      for (const [key, mat] of tileMaterialMap) {
        const ta = targetTileAlphaMap.get(key) ?? ALPHA_HIDDEN
        const tc = targetTileColorMap.get(key)

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

const canvasStyle = computed<CSSProperties>(() => {
  return {
    cursor: hoveredTile.value ? 'pointer' : 'default',
  }
})

const blockPickerVisible = ref(false)
function openBlockPicker() {
  blockPickerVisible.value = true
}

function handleSelectBlock(blockType: BlockType) {
  if (selectedTile.value) {
    spawnBlock(blockType, selectedTile.value)

    // 展開六個方向的候補
    for (let d = 0; d < 6; d++) {
      const neighbor = selectedTile.value.neighbor(d)
      if (neighbor.len() <= MAX_RADIUS) {
        addCandidate(neighbor)
      }
    }
  }

  deselectCurrent()
}
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
