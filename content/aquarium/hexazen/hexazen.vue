<template>
  <u-app>
    <div class="fixed w-dvw h-dvh m-0 p-5 bg-gray-100">
      <div
        class="w-full h-full chamfer-5 relative"
        :style="canvasStyle"
      >
        <canvas
          v-once
          ref="canvasRef"
          class="canvas w-full h-full"
        />

        <div class="absolute right-0 bottom-0 p-5 space-y-4">
          <u-tooltip
            text="移除模式"
            :content="{
              side: 'left',
            }"
          >
            <u-icon
              name="i-mingcute:shovel-fill"
              class="text-4xl cursor-pointer duration-500 outline-0"
              :class="{
                'text-gray-400': !isCleanMode,
                'text-primary': isCleanMode,
              }"
              @click="toggleCleanMode()"
            />
          </u-tooltip>
        </div>

        <div class="absolute left-0 bottom-0 p-5 space-y-4">
          <u-icon
            :name="isMuted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'"
            class="text-4xl cursor-pointer duration-500 outline-0 "
            :class="{
              'text-gray-600': !isMuted,
              'text-gray-300': isMuted,
            }"
            @click="toggleMuted()"
          />
        </div>
      </div>

      <div class=" absolute bottom-0 right-0 p-1 opacity-20 text-xs">
        v{{ version }}
      </div>
    </div>

    <!-- u-slideover 開啟動畫不穩動，不知道為甚麼會抖動 -->
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
import { useColorMode, useToggle } from '@vueuse/core'
import { animate } from 'animejs'
import { pipe, tap } from 'remeda'
import { computed, ref, shallowRef } from 'vue'
import { version } from '../codstack/constants'
import { useBabylonScene } from './composables/use-babylon-scene'
import { useFontLoader } from './composables/use-font-loader'
import BlockPicker from './domains/block/block-picker.vue'
import { createBlock } from './domains/block/builder'
import { Hex, HexLayout } from './domains/hex-grid'

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

useFontLoader()

const COLOR_SELECTED = new Color3(0.4, 0.3, 0.1)
const COLOR_CANDIDATE = new Color3(0.3, 0.3, 0.3)
const COLOR_HOVER = COLOR_CANDIDATE

const ALPHA_SELECTED = 0.6
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

const [isCleanMode, toggleCleanMode] = useToggle(false)
const [isMuted, toggleMuted] = useToggle(false)

/** key 來自 Hex.key() */
const tileMeshMap = new Map<string, Mesh>()
const tileMaterialMap = new Map<string, StandardMaterial>()
const selectedTileSet = new Set<string>()
const candidateTileMap = new Map<string, Hex>()
const targetTileAlphaMap = new Map<string, number>()
const targetTileColorMap = new Map<string, Color3>()

const hoveredTile = shallowRef<Hex>()
const selectedTile = shallowRef<Hex>()

const placedBlockMap = new Map<string, Block>()
const hoveredBlock = shallowRef<Block>()

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
  if (tileMeshMap.has(key) || !sceneValue || !hexMesh)
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

  tileMeshMap.set(key, mesh)
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
  tileMeshMap.get(key)!.isPickable = true
}

function deselectCurrent() {
  if (!selectedTile.value)
    return

  const key = selectedTile.value.key()

  const previousHex = hexMeshMetadata(tileMeshMap.get(key)!)!.hex
  selectedTileSet.delete(key)

  candidateTileMap.set(key, previousHex)
  targetTileAlphaMap.set(key, ALPHA_CANDIDATE)
  targetTileColorMap.set(key, COLOR_CANDIDATE.clone())
  tileMeshMap.get(key)!.isPickable = true

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

  const mesh = tileMeshMap.get(key)
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

    /** 紀錄動畫中的 block */
    const animatingBlockSet = new Set<string>()
    // 處理 placedBlock 點擊
    scene.onPointerObservable.add((info) => {
      const isMove = info.type === PointerEventTypes.POINTERMOVE
      const isClick = info.type === PointerEventTypes.POINTERTAP

      if (!isClick && !isMove)
        return
      hoveredBlock.value = undefined

      const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        (mesh) => {
          const key = hexMeshMetadata(mesh)?.hex.key()
          if (!key) {
            return false
          }

          return placedBlockMap.has(key)
        },
      )

      const pickedKey: string = pick?.hit && pick.pickedMesh
        ? (hexMeshMetadata(pick.pickedMesh)?.hex?.key() as string)
        : ''

      if (!pickedKey || animatingBlockSet.has(pickedKey)) {
        return
      }

      const block = placedBlockMap.get(pickedKey)
      if (!block) {
        return
      }

      if (isMove) {
        hoveredBlock.value = block
        return
      }

      // 移除
      if (isCleanMode.value) {
        block.rootNode.dispose()
        placedBlockMap.delete(pickedKey)
        return
      }

      // 旋轉
      animatingBlockSet.add(pickedKey)
      const duration = 800
      animate(block.rootNode.rotation, {
        y: block.rootNode.rotation.y + Math.PI / 3,
        duration,
        ease: 'inOutCirc',
      })

      animate(block.rootNode.position, {
        y: [0, 0.2, 0],
        duration,
        ease: 'inOutBack(3)',
        onComplete() {
          animatingBlockSet.delete(pickedKey)
        },
      })
    })

    // 處理 tile 之 hover、select
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

    // tile alpha、color 漸變
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
  const isRotating = hoveredBlock.value
  if (isRotating) {
    if (isCleanMode.value) {
      return {
        cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2em' height='2em' viewBox='0 0 24 24'%3E%3C!-- Icon from MingCute Icon by MingCute Design - https://github.com/Richard9394/MingCute/blob/main/LICENSE --%3E%3Cg fill='none'%3E%3Cpath d='m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z'/%3E%3Cpath fill='white' d='M16.243 3.515a1 1 0 0 1 1.414 0l1.41 1.41l.004.004l.005.004l1.41 1.41a1 1 0 0 1-1.415 1.414l-.707-.707l-4.95 4.95l1.414 1.414a2 2 0 0 1 0 2.829l-2.494 2.494a5 5 0 0 1-5.117 1.208l-.949-.316a3 3 0 0 1-1.897-1.898l-.316-.948a5 5 0 0 1 1.208-5.117l2.494-2.495a2 2 0 0 1 2.829 0L12 10.586l4.95-4.95l-.707-.707a1 1 0 0 1 0-1.414'/%3E%3C/g%3E%3C/svg%3E") 12 12, pointer`,
      }
    }

    return {
      cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2em' height='2em' viewBox='0 0 24 24'%3E%3C!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --%3E%3Cpath fill='%23FFFFFF' d='M13 22q-.925 0-1.812-.187t-1.738-.538q-.375-.15-.5-.537t.025-.763t.525-.537t.75.012q.65.275 1.338.413T13 20q2.925 0 4.963-2.037T20 13t-2.05-4.962T12.975 6H12.8l.9.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275L9.7 5.7q-.125-.125-.2-.312T9.425 5t.075-.387t.2-.313l2.6-2.6q.275-.275.7-.275t.7.275t.275.7t-.275.7l-.9.9h.175q3.75 0 6.388 2.625T22 13t-2.625 6.375T13 22m-6-3.425q-.2 0-.375-.062T6.3 18.3l-4.6-4.6q-.15-.15-.212-.325T1.425 13t.063-.375t.212-.325l4.6-4.6q.15-.15.325-.213T7 7.426t.375.063t.325.212l4.6 4.6q.15.15.213.325t.062.375t-.062.375t-.213.325l-4.6 4.6q-.15.15-.325.213T7 18.575m0-2.425L10.15 13L7 9.85L3.85 13zM7 13'/%3E%3C/svg%3E") 12 12, pointer`,
    }
  }

  const isPointer = hoveredTile.value

  return {
    cursor: isPointer ? 'pointer' : 'default',
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
