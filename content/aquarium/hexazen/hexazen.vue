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

        <div class="absolute right-0 bottom-0 p-5 space-y-4 text-gray-400">
          <u-tooltip
            text="Remove Mode"
            :content="{
              side: 'left',
            }"
          >
            <u-icon
              name="i-mingcute:shovel-fill"
              class="text-4xl cursor-pointer duration-500 outline-0"
              :class="{
                'text-primary': isRemoveMode,
              }"
              @click="toggleRemoveMode()"
            />
          </u-tooltip>

          <u-popover>
            <u-icon
              name="i-material-symbols:cleaning-services-rounded"
              class="text-[32px] cursor-pointer duration-500 outline-0"
            />

            <template #content>
              <div class="p-4 space-y-2">
                <div class=" font-bold">
                  Confirm to remove all blocks?
                </div>
                <div class=" text-sm">
                  This action can't be undone
                </div>
                <div class="flex justify-end">
                  <u-button
                    label="Remove All"
                    color="error"
                    @click="removeAllBlocks()"
                  />
                </div>
              </div>
            </template>
          </u-popover>
        </div>

        <div class="absolute left-0 bottom-0 p-5 space-y-4">
          <u-icon
            :name="isMuted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'"
            class="text-4xl cursor-pointer outline-0 text-gray-400"
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
      class=" fixed bottom-0 left-0 right-0 flex justify-center p-10 duration-300 ease-in-out "
      :class="{
        'translate-y-0': blockPickerVisible,
        'translate-y-full': !blockPickerVisible,
      }"
    >
      <block-picker
        class="max-w-[80dvw] md:max-w-[70dvw]"
        @select="handleSelectBlock"
      />
    </div>
  </u-app>
</template>

<script setup lang="ts">
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core'
import type { CSSProperties } from 'vue'
import type { Block, BlockType } from './domains/block/type'
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
import { computed, ref, shallowReactive, shallowRef, watch } from 'vue'
import { version } from '../codstack/constants'
import { cursorDataUrl } from '../meme-cache/constants'
import { useBabylonScene } from './composables/use-babylon-scene'
import { useFontLoader } from './composables/use-font-loader'
import BlockPicker from './domains/block/block-picker.vue'
import { createBlock } from './domains/block/builder'
import { Hex, HexLayout } from './domains/hex-grid'
import { useSoundscapePlayer } from './domains/soundscape/player/use-soundscape-player'

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

const [isRemoveMode, toggleRemoveMode] = useToggle(false)
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

const placedBlockMap = shallowReactive(new Map<string, Block>())
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
    hex,
    hexLayout,
  })

  placedBlockMap.set(hex.key(), block)
}
async function removeAllBlocks() {
  placedBlockMap.forEach((block) => {
    block.rootNode.dispose()
  })
  placedBlockMap.clear()

  syncAllCandidateTile()
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

function removeCandidate(hex: Hex) {
  const key = hex.key()
  if (!candidateTileMap.has(key))
    return

  tileMeshMap.get(key)?.dispose()
  tileMeshMap.delete(key)
  tileMaterialMap.delete(key)
  targetTileAlphaMap.delete(key)
  targetTileColorMap.delete(key)
  candidateTileMap.delete(key)
}

/** 基於 placedBlockMap 同步候補格。
 *
 * 移除無相鄰 block 的孤立候補、補上缺少的鄰格候補
 */
function syncAllCandidateTile() {
  // 移除沒有相鄰 placed block 的候補格
  candidateTileMap.forEach((hex, key) => {
    const hasAdjacentBlock = Array.from({ length: 6 }, (_, d) => hex.neighbor(d))
      .some((neighbor) => placedBlockMap.has(neighbor.key()))

    // 自身位置有 placed block 時也要保留（tile mesh 作為 block hover 偵測依據）
    const hasSelfBlock = placedBlockMap.has(key)

    if (hasAdjacentBlock || hasSelfBlock)
      return

    removeCandidate(hex)
  })

  // 補上 placedBlock 鄰格中缺少的候補
  placedBlockMap.forEach((block) => {
    for (let d = 0; d < 6; d++) {
      addCandidate(block.hex.neighbor(d))
    }
  })

  // 若 placedBlockMap 為空，確保原點候補存在
  if (placedBlockMap.size === 0) {
    // 移除所有候補格
    candidateTileMap.forEach((hex) => {
      removeCandidate(hex)
    })

    addCandidate(new Hex(0, 0, 0))
  }
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
      if (isRemoveMode.value) {
        block.rootNode.dispose()

        removeCandidate(block.hex)

        placedBlockMap.delete(pickedKey)
        syncAllCandidateTile()
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
    if (isRemoveMode.value) {
      return {
        cursor: cursorDataUrl.shovelFill,
      }
    }

    return {
      cursor: cursorDataUrl.rotate,
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

useSoundscapePlayer(placedBlockMap)
</script>

<style lang="sass" scoped>
.canvas
  outline: none
</style>
