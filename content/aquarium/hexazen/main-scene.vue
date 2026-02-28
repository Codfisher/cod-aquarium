<template>
  <canvas
    v-once
    ref="canvasRef"
    class="w-full h-full outline-0"
  />
</template>

<script setup lang="ts">
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core'
import type { ShallowReactive } from 'vue'
import type { TraitRegion } from './domains/block/trait-region'
import type { Block, BlockType } from './domains/block/type'
import type { TraitType, Weather } from './types'
import {
  ArcRotateCamera,
  BoxParticleEmitter,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DepthOfFieldEffectBlurLevel,
  DirectionalLight,
  DynamicTexture,
  GPUParticleSystem,
  MeshBuilder,
  ParticleSystem,
  PointerEventTypes,
  Ray,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { promiseTimeout } from '@vueuse/core'
import { animate } from 'animejs'
import { maxBy } from 'lodash-es'
import { pipe, tap } from 'remeda'
import { computed, onWatcherCleanup, shallowRef, toRef, watch } from 'vue'
import { useBabylonScene } from './composables/use-babylon-scene'
import { createBlock } from './domains/block/builder'
import { Hex, HexLayout } from './domains/hex-grid'
import { TraitTypeEnum } from './types'

const props = defineProps<{
  placedBlockMap: ShallowReactive<Map<string, Block>>;
  isEditMode: boolean;
  isSharedView: boolean;
  isRemoveMode: boolean;
  weather: Weather | undefined;
  traitRegionList: TraitRegion[];
}>()

const emit = defineEmits<{
  openBlockPicker: [];
  closeBlockPicker: [];
  ready: [];
}>()

// --- Constants ---

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

const DEFAULT_F_STOP = 8
const DEFAULT_VIGNETTE_WEIGHT = 1.5

// --- HexMesh Metadata ---

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

// --- Tile、Block 狀態 ---

/** key 來自 Hex.key() */
const tileMeshMap = new Map<string, Mesh>()
const tileMaterialMap = new Map<string, StandardMaterial>()
const selectedTileSet = new Set<string>()
const candidateTileMap = new Map<string, Hex>()
const targetTileAlphaMap = new Map<string, number>()
const targetTileColorMap = new Map<string, Color3>()

const hoveredTile = shallowRef<Hex>()
const selectedTile = shallowRef<Hex>()

const hoveredBlock = shallowRef<Block>()

/** 對齊模型與 hex 的大小 */
const HEX_SIZE = 0.5775
const hexLayout = new HexLayout(HexLayout.pointy, HEX_SIZE, Vector3.Zero())
/** clone 用的基礎 hex mesh */
const baseHexMesh = shallowRef<Mesh>()

// --- Scene 狀態 ---

const ground = shallowRef<Mesh>()
const shadowGenerator = shallowRef<ShadowGenerator>()
const pipeline = shallowRef<DefaultRenderingPipeline>()
const rainParticleSystem = shallowRef<GPUParticleSystem>()
const splashParticleSystem = shallowRef<ParticleSystem>()
const enabledPipeline = computed(() => props.isSharedView || !props.isEditMode)

// --- Block / Tile 函式 ---

const weatherRef = toRef(() => props.weather)

async function spawnBlock(blockType: BlockType, hex: Hex) {
  const block = await createBlock({
    type: blockType,
    scene: scene.value!,
    shadowGenerator: shadowGenerator.value!,
    hex,
    hexLayout,
    weather: weatherRef,
  })

  props.placedBlockMap.set(hex.key(), block)
  return block
}

async function removeAllBlocks() {
  await Promise.all([...props.placedBlockMap.values()].map(async (block, i) => {
    await promiseTimeout(i * 50)
    return block.dispose()
  }))
  props.placedBlockMap.clear()

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
      .some((neighbor) => props.placedBlockMap.has(neighbor.key()))

    // 自身位置有 placed block 時也要保留（tile mesh 作為 block hover 偵測依據）
    const hasSelfBlock = props.placedBlockMap.has(key)

    if (hasAdjacentBlock || hasSelfBlock)
      return

    removeCandidate(hex)
  })

  // 補上 placedBlock 鄰格中缺少的候補
  props.placedBlockMap.forEach((block) => {
    for (let d = 0; d < 6; d++) {
      addCandidate(block.hex.neighbor(d))
    }
  })

  // 若 placedBlockMap 為空，確保原點候補存在
  if (props.placedBlockMap.size === 0) {
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
  emit('closeBlockPicker')
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

  emit('openBlockPicker')
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

// --- Scene 建立輔助函式 ---

function createGround({ scene }: { scene: Scene }) {
  const ground = MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene)
  const material = new StandardMaterial('groundMat', scene)
  material.diffuseColor = new Color3(0.96, 0.95, 0.93)
  ground.material = material
  ground.receiveShadows = true
  return ground
}

function createRainSystem(scene: Scene) {
  if (!GPUParticleSystem.IsSupported) {
    console.warn('此裝置不支援 GPU 粒子系統')
    return
  }

  const particleSystem = new GPUParticleSystem('rain_system', { capacity: 50000 }, scene)

  const dropTexture = new DynamicTexture('drop_tex', { width: 1, height: 20 }, scene, false)
  const ctx = dropTexture.getContext()
  const gradient = ctx.createLinearGradient(0, 0, 0, 32)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 4, 32)
  dropTexture.update()

  particleSystem.particleTexture = dropTexture

  const emitter = new BoxParticleEmitter()
  emitter.direction1 = new Vector3(0, -1, 0)
  emitter.direction2 = new Vector3(0, -1, 0)
  emitter.minEmitBox = new Vector3(-5, 4, -5)
  emitter.maxEmitBox = new Vector3(5, 4, 5)

  particleSystem.particleEmitterType = emitter
  particleSystem.emitter = Vector3.Zero()

  particleSystem.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED
  particleSystem.color1 = new Color4(0.8, 0.8, 0.9, 0.2)
  particleSystem.color2 = new Color4(0.6, 0.7, 0.8, 0.3)
  particleSystem.colorDead = new Color4(0.5, 0.6, 0.7, 0.0)

  particleSystem.minSize = 0.01
  particleSystem.maxSize = 0.01
  particleSystem.minScaleX = 0.05
  particleSystem.maxScaleX = 0.05
  particleSystem.minScaleY = 5.0
  particleSystem.maxScaleY = 5.0

  particleSystem.minLifeTime = 5
  particleSystem.maxLifeTime = 5
  particleSystem.emitRate = 2000
  particleSystem.minEmitPower = 0.5
  particleSystem.maxEmitPower = 0.5
  particleSystem.gravity = new Vector3(0, -1, 0)

  particleSystem.stop()

  return particleSystem
}

function createSplashSystem(scene: Scene) {
  const splashSystem = new ParticleSystem('splash_system', 10000, scene)

  const splashTexture = new DynamicTexture('splash_tex', { width: 32, height: 32 }, scene, false)
  const ctx = splashTexture.getContext()
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)

  gradient.addColorStop(0, 'rgba(200, 220, 240, 0.8)')
  gradient.addColorStop(1, 'rgba(200, 220, 240, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  splashTexture.update()

  splashSystem.particleTexture = splashTexture

  const emitter = new BoxParticleEmitter()
  emitter.direction1 = new Vector3(-0.5, 1, -0.5)
  emitter.direction2 = new Vector3(0.5, 1.5, 0.5)
  emitter.minEmitBox = new Vector3(-5, 5, -5)
  emitter.maxEmitBox = new Vector3(5, 5, 5)
  splashSystem.particleEmitterType = emitter

  splashSystem.emitter = new Vector3(0, 0, 0)

  splashSystem.billboardMode = ParticleSystem.BILLBOARDMODE_ALL

  splashSystem.minSize = 0.002
  splashSystem.maxSize = 0.005

  splashSystem.color1 = new Color4(0.8, 0.8, 0.9, 0.8)
  splashSystem.color2 = new Color4(0.6, 0.7, 0.8, 0.5)
  splashSystem.colorDead = new Color4(0.5, 0.6, 0.7, 0.0)

  splashSystem.minLifeTime = 0.15
  splashSystem.maxLifeTime = 0.3
  splashSystem.emitRate = 5000

  splashSystem.minEmitPower = 0.05
  splashSystem.maxEmitPower = 0.1
  splashSystem.gravity = new Vector3(0, -0.5, 0)

  splashSystem.stop()

  /** 使用射線投射來決定水花出生點，避免水花浮空，會覆蓋 emitter.emitBox 的設定 */
  splashSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    const randomX = Math.random() * 10 - 5
    const randomZ = Math.random() * 10 - 5

    // 從高空垂直向下發射射線
    const rayStart = new Vector3(randomX, 5, randomZ)
    const rayDir = new Vector3(0, -1, 0)
    const ray = new Ray(rayStart, rayDir, 30)

    // 偵測射線打到了場景中的哪個表面
    const hit = scene.pickWithRay(ray, (mesh) => {
      return mesh.isVisible && mesh.isPickable
    })

    if (hit && hit.hit && hit.pickedPoint) {
      // 稍微抬高避免被模型吃掉
      positionToUpdate.copyFrom(hit.pickedPoint)
      positionToUpdate.y += 0.01
    }
    else {
      positionToUpdate.copyFromFloats(randomX, -100, randomZ)
    }
  }

  return splashSystem
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

// --- Scene 初始化 ---

const { canvasRef, scene, camera } = useBabylonScene({
  async init({ scene, engine, camera }) {
    ground.value = createGround({ scene })
    shadowGenerator.value = createShadowGenerator(scene)
    rainParticleSystem.value = createRainSystem(scene)
    splashParticleSystem.value = createSplashSystem(scene)

    baseHexMesh.value = pipe(
      MeshBuilder.CreateCylinder('hexBase', {
        diameter: hexLayout.size * 1.98,
        height: 0.04,
        tessellation: 6,
      }, scene),
      tap((mesh) => {
        mesh.rotation.y = Math.PI / 6
        mesh.isPickable = false
        mesh.isVisible = false
      }),
    )

    if (!props.isSharedView) {
      // 原點為初始候補格
      addCandidate(new Hex(0, 0, 0))
    }

    pipeline.value = pipe(
      new DefaultRenderingPipeline(
        'hexazenPipeline',
        true,
        scene,
        [camera],
      ),
      tap((pipeline) => {
        pipeline.fxaaEnabled = true
        pipeline.samples = 4

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
    scene.onPointerObservable.add(async (info) => {
      if (!props.isEditMode || props.isSharedView) {
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

          return props.placedBlockMap.has(key)
        },
      )

      const pickedKey: string = pick?.hit && pick.pickedMesh
        ? (hexMeshMetadata(pick.pickedMesh)?.hex?.key() as string)
        : ''

      if (!pickedKey || animatingBlockSet.has(pickedKey)) {
        return
      }

      const block = props.placedBlockMap.get(pickedKey)
      if (!block) {
        return
      }

      if (isMove) {
        hoveredBlock.value = block
        return
      }

      // 移除
      if (props.isRemoveMode) {
        await block.dispose()

        removeCandidate(block.hex)

        props.placedBlockMap.delete(pickedKey)
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
      if (!props.isEditMode || props.isSharedView) {
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
          if (!key || props.placedBlockMap.has(key)) {
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
        if (!props.isEditMode || props.isSharedView) {
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

    emit('ready')
  },
})

// 開關 pipeline
watch(() => [props.isEditMode, pipeline.value], (_, __, onCleanup) => {
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

// 鏡頭自動旋轉
watch(() => [camera.value, props.isEditMode], () => {
  if (!(camera.value instanceof ArcRotateCamera)) {
    return
  }

  const enabled = !props.isEditMode || props.isSharedView
  camera.value.useAutoRotationBehavior = enabled

  if (camera.value.autoRotationBehavior) {
    camera.value.autoRotationBehavior.idleRotationSpeed = 0.02
    camera.value.autoRotationBehavior.idleRotationSpinupTime = 3000
  }
}, { deep: true })

const traitVignetteColorMap: Record<TraitType, Color3> = {
  grass: new Color3(0, 0.2, 0),
  tree: new Color3(0, 0.2, 0),
  building: new Color3(0.4, 0.2, 0),
  alpine: new Color3(0, 0, 0),
  river: new Color3(0, 0.4, 0.4),
  water: new Color3(0, 0.4, 0.5),
  sand: new Color3(0.3, 0.3, 0),
  campfire: new Color3(0.3, 0.3, 0),
}

// 根據 traitRegion 更新 vignette color
watch(() => [props.traitRegionList, pipeline.value], (_, __, onCleanup) => {
  if (!pipeline.value?.imageProcessing || !ground.value?.material) {
    return
  }

  // 取總和面積最大的 region
  const sizeMap = props.traitRegionList.reduce((acc, region) => {
    acc[region.trait] = (acc[region.trait] || 0) + region.size
    return acc
  }, {} as Record<TraitType, number>)

  const targetColor = pipe(0, () => {
    const maxTrait = maxBy(Object.values(TraitTypeEnum), (trait) => sizeMap[trait])
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

  const blendRatio = 0.7
  const baseGroundColor = new Color3(0.96, 0.95, 0.93)
  const groundColor = Color3.Lerp(targetColor, baseGroundColor, blendRatio)

  const instance2 = animate(
    (ground.value.material as StandardMaterial).diffuseColor,
    {
      r: groundColor.r,
      g: groundColor.g,
      b: groundColor.b,
      duration: 1000,
    },
  )

  onCleanup(() => {
    instance.cancel()
    instance2.cancel()
  })
}, {
  deep: true,
})

// 切換雨天
watch(() => ({ isRain: props.weather === 'rain', scene: scene.value }), ({ isRain, scene: sceneValue }) => {
  if (!sceneValue) {
    return
  }

  if (isRain) {
    rainParticleSystem.value?.start()
    promiseTimeout(3000).then(() => {
      splashParticleSystem.value?.start()
    })
  }
  else {
    rainParticleSystem.value?.stop()
    promiseTimeout(3000).then(() => {
      splashParticleSystem.value?.stop()
    })
  }

  const shadowLight = shadowGenerator.value?.getLight()
  if (shadowLight) {
    const instance = animate(
      shadowLight,
      {
        intensity: isRain ? 0.01 : 0.8,
        duration: 3000,
      },
    )
    onWatcherCleanup(() => {
      instance.cancel()
    })
  }

  const fogStart = isRain ? 1 : 10
  const fogEnd = isRain ? 30 : 100

  const instance = animate(
    sceneValue,
    {
      fogStart,
      fogEnd,
      duration: 3000,
    },
  )

  onWatcherCleanup(() => {
    instance.cancel()
  })
})

// --- Expose ---

defineExpose({
  spawnBlock,
  removeAllBlocks,
  handleSelectBlock,
  hoveredBlock,
  hoveredTile,
})
</script>
