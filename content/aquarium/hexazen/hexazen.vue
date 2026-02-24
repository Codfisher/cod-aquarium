<template>
  <u-app
    :toaster="{
      ui: {
        base: 'chamfer-2 chamfer-border-0.25 bg-gray-200',
      },
    }"
  >
    <div class="fixed w-dvw h-dvh m-0 p-5 bg-gray-100">
      <div
        class="w-full h-full chamfer-5 relative"
        :style="canvasStyle"
      >
        <canvas
          v-once
          ref="canvasRef"
          class="w-full h-full outline-0"
        />

        <transition
          name="fade"
          mode="out-in"
        >
          <div
            v-if="isEditMode && !isSharedView"
            class="absolute right-0 bottom-0 p-5 space-y-6 text-gray-400 "
          >
            <u-tooltip
              text="Remove Mode"
              :content="{
                side: 'left',
              }"
            >
              <u-icon
                name="i-mingcute:shovel-fill"
                class="text-3xl cursor-pointer duration-500 outline-0 "
                :class="{
                  'text-primary': isRemoveMode,
                }"
                @click="toggleRemoveMode()"
              />
            </u-tooltip>

            <u-popover
              :ui="{
                content: 'chamfer-3 bg-gray-200 p-0.5',
              }"
            >
              <u-tooltip
                text="Remove all blocks"
                :content="{
                  side: 'left',
                }"
              >
                <u-icon
                  name="tdesign:clear-formatting-1-filled"
                  class="text-3xl cursor-pointer duration-500 outline-0 scale-90"
                />
              </u-tooltip>

              <template #content="{ close }">
                <div class="chamfer-2.5 bg-white">
                  <div class="p-4 space-y-2 ">
                    <div class=" font-bold">
                      Confirm to remove all blocks?
                    </div>
                    <div class=" text-sm">
                      This action can't be undone
                    </div>

                    <div class="flex justify-end">
                      <base-btn
                        label="Remove All"
                        color="error"
                        @click="removeAllBlocks(); close()"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </u-popover>

            <u-separator
              size="sm"
              :ui="{ border: 'border-gray-300' }"
              class="py-1"
            />

            <u-tooltip
              text="Close edit mode"
              :content="{
                side: 'left',
              }"
            >
              <u-icon
                name="i-line-md:arrow-small-left"
                class="text-3xl cursor-pointer duration-500 outline-0"
                @click="toggleEditMode()"
              />
            </u-tooltip>
          </div>

          <div
            v-else-if="!isSharedView"
            class="absolute right-0 bottom-0 p-5 space-y-6 text-gray-400"
          >
            <u-tooltip
              text="Edit Mode"
              :content="{
                side: 'left',
              }"
            >
              <u-icon
                name="i-line-md:pencil-alt-twotone"
                class="text-3xl cursor-pointer duration-500 outline-0"
                @click="toggleEditMode()"
              />
            </u-tooltip>
          </div>
        </transition>

        <div class="absolute left-0 bottom-0 p-5 space-y-6 duration-500 text-gray-400">
          <u-slider
            v-model="globalVolume"
            orientation="vertical"
            :min="0"
            :max="1"
            :step="0.01"
            :ui="{
              track: 'bg-gray-200',
              range: 'bg-gray-300',
              thumb: ' ring-gray-500 bg-white',
            }"
            class="h-30"
          />

          <u-tooltip
            v-if="!isSharedView"
            text="Share your soundscape with others"
            :content="{
              side: 'right',
            }"
          >
            <u-icon
              name="i-material-symbols:share"
              class="text-3xl cursor-pointer outline-0 "
              @click="handleShare()"
            />
          </u-tooltip>

          <u-icon
            :name="isMuted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'"
            class="text-3xl cursor-pointer outline-0 "
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
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DepthOfFieldEffectBlurLevel,
  DirectionalLight,
  MeshBuilder,
  PointerEventTypes,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { useColorMode, useToggle } from '@vueuse/core'
import { animate } from 'animejs'
import { maxBy } from 'lodash-es'
import { pipe, tap } from 'remeda'
import { computed, ref, shallowReactive, shallowRef, watch } from 'vue'
import { cursorDataUrl } from '../meme-cache/constants'
import BaseBtn from './components/base-btn.vue'
import { useBabylonScene } from './composables/use-babylon-scene'
import { useFontLoader } from './composables/use-font-loader'
import { version } from './constants'
import BlockPicker from './domains/block/block-picker.vue'
import { createBlock } from './domains/block/builder'
import { Hex, HexLayout } from './domains/hex-grid'
import { decodeBlocks, encodeBlocks } from './domains/share/codec'
import { useSoundscapePlayer } from './domains/soundscape/player/use-soundscape-player'
import { TraitType } from './types'

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

useFontLoader()

const sharedViewEncodedData = pipe(
  // 因為 whyframe 隔離，需要從 parent 取得 URL
  new URLSearchParams(window.parent.location.search || window.location.search),
  (urlParams) => urlParams.get('view'),
)
const isSharedView = !!sharedViewEncodedData

const [isEditMode, toggleEditMode] = useToggle(true)
const [isRemoveMode, toggleRemoveMode] = useToggle(false)
const [isMuted, toggleMuted] = useToggle(isSharedView)

const globalVolume = ref(1)

// --- Tile、Block 狀態 ---

const COLOR_SELECTED = new Color3(0.4, 0.3, 0.1)
const COLOR_CANDIDATE = new Color3(0.3, 0.3, 0.3)
const COLOR_HOVER = COLOR_CANDIDATE

const ALPHA_SELECTED = 0.6
const ALPHA_CANDIDATE = 0.5
const ALPHA_HOVER = 0.7
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
  return block
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

const { traitRegionList } = useSoundscapePlayer(placedBlockMap, {
  muted: isMuted,
  volume: globalVolume,
})

// --- 分享功能 ---

const toast = useToast()

async function handleShare() {
  const sharedBlocks = Array.from(placedBlockMap.values()).map((block) => {
    const rotationStep = Math.round(block.rootNode.rotation.y / (Math.PI / 3))
    const rotation = ((rotationStep % 6) + 6) % 6

    return {
      type: block.type,
      hex: block.hex,
      rotation,
    }
  })

  if (sharedBlocks.length === 0) {
    toast.add({
      title: 'Nothing to share',
      description: 'Place some blocks first!',
      icon: 'i-mingcute:information-line',
    })
    return
  }

  const encoded = encodeBlocks(sharedBlocks)
  const url = new URL(window.parent.location.href || window.location.href)
  url.searchParams.set('view', encoded)

  await navigator.clipboard.writeText(url.toString())
  toast.add({
    title: 'Link copied!',
    description: 'Share this link so others can enjoy your soundscape.',
    icon: 'i-material-symbols:check-circle',
  })
}

async function restoreSharedView() {
  if (!sharedViewEncodedData)
    return

  try {
    const sharedBlocks = decodeBlocks(sharedViewEncodedData)
    for (const { type, hex, rotation } of sharedBlocks) {
      const block = await spawnBlock(type, hex)
      block.rootNode.rotation.y = rotation * (Math.PI / 3)
    }
  }
  catch (error) {
    console.error('Failed to restore shared view:', error)
  }
}

// --- Scene 初始化 ---

const DEFAULT_F_STOP = 2.8
const DEFAULT_VIGNETTE_WEIGHT = 1.2

const shadowGenerator = shallowRef<ShadowGenerator>()
const pipeline = shallowRef<DefaultRenderingPipeline>()
const enabledPipeline = computed(() => isSharedView || !isEditMode.value)

// 開關 pipeline
watch(() => [isEditMode.value, pipeline.value], (_, __, onCleanup) => {
  if (!pipeline.value) {
    return
  }

  const enabled = enabledPipeline.value

  // pipeline 停用加入過度效果
  const fStop = enabled ? DEFAULT_F_STOP : 20
  const vignetteWeight = enabled ? DEFAULT_VIGNETTE_WEIGHT : 0

  const instanceList = [
    animate(
      pipeline.value.depthOfField,
      {
        fStop,
        duration: 1000,
      },
    ),
    animate(
      pipeline.value.imageProcessing,
      {
        vignetteWeight,
        duration: 1000,
      },
    ),
  ]

  onCleanup(() => {
    instanceList.forEach((instance) => {
      instance.cancel()
    })
  })
}, { immediate: true, deep: true })

function createGround({ scene }: { scene: Scene }) {
  const ground = MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene)
  const material = new StandardMaterial('groundMat', scene)
  material.diffuseColor = new Color3(0.96, 0.95, 0.93)
  ground.material = material
  ground.receiveShadows = true
  return ground
}

function createShadowGenerator(scene: Scene) {
  const light = new DirectionalLight('dir01', new Vector3(-3, -5, -2), scene)
  light.intensity = 0.8

  const shadowGenerator = new ShadowGenerator(2048, light)
  shadowGenerator.bias = 0.000001
  shadowGenerator.normalBias = 0.0001
  shadowGenerator.forceBackFacesOnly = true
  return shadowGenerator
}

const { canvasRef, scene, camera } = useBabylonScene({
  async init({ scene, engine, camera }) {
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

    if (!isSharedView) {
      // 原點為初始候補格
      addCandidate(new Hex(0, 0, 0))
    }

    // 還原分享連結中的 block
    await restoreSharedView()

    pipeline.value = pipe(
      new DefaultRenderingPipeline(
        'hexazenPipeline',
        true,
        scene,
        [camera],
      ),
      tap((pipeline) => {
        pipeline.fxaaEnabled = true
        pipeline.samples = 8

        pipeline.depthOfFieldEnabled = true
        pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.High
        pipeline.depthOfField.focalLength = 135
        pipeline.depthOfField.fStop = DEFAULT_F_STOP

        pipeline.imageProcessingEnabled = true
        pipeline.imageProcessing.contrast = 1.25
        pipeline.imageProcessing.exposure = 1.1

        // 暗角
        pipeline.imageProcessing.vignetteEnabled = true
        pipeline.imageProcessing.vignetteWeight = DEFAULT_VIGNETTE_WEIGHT
        pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0)

        // 讓景深的對焦距離，永遠等於攝影機與中心點的距離
        scene.onBeforeRenderObservable.add(() => {
          if (pipeline.depthOfFieldEnabled && camera instanceof ArcRotateCamera) {
            pipeline.depthOfField.focusDistance = camera.radius * 1000
          }
        })
      }),
    )

    /** 紀錄動畫中的 block */
    const animatingBlockSet = new Set<string>()
    // 處理 placedBlock 點擊
    scene.onPointerObservable.add((info) => {
      if (!isEditMode.value || isSharedView) {
        return
      }

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
      if (!isEditMode.value || isSharedView) {
        return
      }

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

      for (const [key, material] of tileMaterialMap) {
        if (!isEditMode.value || isSharedView) {
          material.alpha = material.alpha + (ALPHA_HIDDEN - material.alpha) * t
          continue
        }

        const targetAlpha = targetTileAlphaMap.get(key) ?? ALPHA_HIDDEN
        const targetColor = targetTileColorMap.get(key)

        material.alpha = material.alpha + (targetAlpha - material.alpha) * t

        if (targetColor) {
          material.emissiveColor.r += (targetColor.r - material.emissiveColor.r) * t
          material.emissiveColor.g += (targetColor.g - material.emissiveColor.g) * t
          material.emissiveColor.b += (targetColor.b - material.emissiveColor.b) * t
          material.diffuseColor.copyFrom(material.emissiveColor)
        }
      }
    })
  },
})

// 鏡頭自動旋轉
watch(() => [camera.value, isEditMode.value], () => {
  if (!(camera.value instanceof ArcRotateCamera)) {
    return
  }

  const enabled = !isEditMode.value || isSharedView
  camera.value.useAutoRotationBehavior = enabled

  if (camera.value.autoRotationBehavior) {
    camera.value.autoRotationBehavior.idleRotationSpeed = 0.04
    camera.value.autoRotationBehavior.idleRotationSpinupTime = 3000
  }
}, { deep: true })

const traitVignetteColorMap: Record<`${TraitType}`, Color3> = {
  grass: new Color3(0, 0.2, 0),
  tree: new Color3(0, 0.2, 0),
  building: new Color3(0.5, 0.3, 0),
  alpine: new Color3(0, 0, 0),
  river: new Color3(0, 0.4, 0.4),
  water: new Color3(0, 0.4, 0.5),
  sand: new Color3(0.3, 0.3, 0),
}
// 根據 traitRegion 更新 vignette color
watch(() => [traitRegionList, pipeline.value], (_, __, onCleanup) => {
  if (!pipeline.value?.imageProcessing) {
    return
  }

  // 取總和面積最大的 region
  const sizeMap = traitRegionList.value.reduce((acc, region) => {
    acc[region.trait] = (acc[region.trait] || 0) + region.size
    return acc
  }, {} as Record<`${TraitType}`, number>)

  const targetColor = pipe(0, () => {
    const maxTrait = maxBy(Object.values(TraitType), (trait) => sizeMap[trait])
    if (!maxTrait) {
      return Color3.Black()
    }

    return traitVignetteColorMap[maxTrait]
  })

  const instance = animate(
    pipeline.value.imageProcessing.vignetteColor,
    {
      r: targetColor.r,
      g: targetColor.g,
      b: targetColor.b,
      duration: 1000,
    },
  )

  onCleanup(() => {
    instance.cancel()
  })
}, {
  deep: true,
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
</script>

<style lang="sass" scoped>
.btn-drop-shadow
  filter: drop-shadow(0px 0px 1px rgba(0, 0, 0, 0.4)) drop-shadow(0px 0px 6px rgba(0, 0, 0, 0.1))
</style>

<style lang="sass">
.fade
  &-enter-active, &-leave-active
    transition-duration: 0.4s !important
  &-enter-from, &-leave-to
    opacity: 0 !important
    scale: 0.95 !important
</style>
