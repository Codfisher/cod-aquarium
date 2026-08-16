<template>
  <demo-frame
    :setup="setupScene"
    title="讓瀑布四面往同一邊流"
    caption="Babylon 的盒子每一面各有各的 UV 方向。+Z 面的 v 由上往下、-Z 與 -X 反過來、+X 面更是把 u 與 v 對調。靜態貼圖看不出差別，但流水是逐格播放的動畫，動畫沿著 v 前進，於是同一道瀑布的四個面各流各的，其中兩面看起來是往旁邊流。"
    :camera-alpha="-Math.PI / 2.6"
    :camera-beta="Math.PI / 2.6"
    :camera-radius="7.5"
    :camera-target="[0, 1.5, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="isUvAligned"
      label="重算側面 UV"
    />
    <demo-toggle
      v-model="isRotating"
      label="自動繞一圈"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh, Scene } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

const isUvAligned = shallowRef(true)
const isRotating = shallowRef(true)

/** 動畫貼圖有幾張畫格，上下疊成一長條 */
const FRAME_COUNT = 8
const TEXTURE_SIZE = 16
/** 每秒播幾格，與本體同一個節奏 */
const TEXTURE_FRAME_RATE = 3.5

const waterMeshList = shallowRef<Mesh[]>([])
/** 原本的 UV 與重算過的 UV 都先存著，切換時直接換上去 */
const originalUvMap = new Map<Mesh, number[]>()
const alignedUvMap = new Map<Mesh, number[]>()

/**
 * 一條直向排列的流水動畫
 *
 * 每一格畫幾道橫紋，逐格往下挪，捲起來就是水在流。
 * 紋路要夠明顯，方向才看得出來
 */
function createFlowTexture(babylon: BabylonModule, scene: Scene) {
  const height = TEXTURE_SIZE * FRAME_COUNT
  const texture = new babylon.DynamicTexture(
    'water-flow',
    { width: TEXTURE_SIZE, height },
    scene,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const offsetY = frame * TEXTURE_SIZE

    context.fillStyle = 'rgb(58, 122, 168)'
    context.fillRect(0, offsetY, TEXTURE_SIZE, TEXTURE_SIZE)

    /** 亮紋往下移，每一格挪兩個像素 */
    for (let index = 0; index < 4; index++) {
      const y = (index * 4 + frame * 2) % TEXTURE_SIZE
      context.fillStyle = 'rgb(126, 190, 226)'
      context.fillRect(0, offsetY + y, TEXTURE_SIZE, 1)
      context.fillStyle = 'rgb(88, 156, 200)'
      context.fillRect(0, offsetY + ((y + 1) % TEXTURE_SIZE), TEXTURE_SIZE, 1)
    }

    /** 幾道直向的水流線，橫著跑的時候特別刺眼 */
    context.fillStyle = 'rgb(150, 208, 236)'
    for (const x of [3, 9, 13]) {
      context.fillRect(x, offsetY, 1, TEXTURE_SIZE)
    }
  }

  texture.update()
  /** v 軸縮到只取一格，再逐格往下捲 */
  texture.vScale = 1 / FRAME_COUNT
  texture.wrapV = babylon.Texture.WRAP_ADDRESSMODE

  return texture
}

/**
 * 把四個側面的 UV 統一成「u 水平、v 由上往下」
 *
 * 必須在 bakeCurrentTransformIntoVertices 之前算，
 * 座標還是以盒子中心為原點時才算得準
 */
function measureAlignedUv(mesh: Mesh, babylon: BabylonModule, height: number): number[] | null {
  const positionList = mesh.getVerticesData(babylon.VertexBuffer.PositionKind)
  const uvList = mesh.getVerticesData(babylon.VertexBuffer.UVKind)
  if (!positionList || !uvList)
    return null

  const nextUvList = Array.from(uvList)
  /** 頂點 0～15 是四個側面，16 之後是頂面與底面 */
  const sideVertexCount = 16

  for (let vertexIndex = 0; vertexIndex < sideVertexCount; vertexIndex++) {
    const x = positionList[vertexIndex * 3]!
    const y = positionList[vertexIndex * 3 + 1]!
    const z = positionList[vertexIndex * 3 + 2]!
    /** 後兩個面朝向 X 軸，水平方向要改看 Z */
    const isFacingX = vertexIndex >= 8

    nextUvList[vertexIndex * 2] = (isFacingX ? z : x) + 0.5
    nextUvList[vertexIndex * 2 + 1] = 0.5 - y / height
  }

  return nextUvList
}

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const {
    Color3,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
    VertexBuffer,
  } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.5, -0.7, -0.45), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.85
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 24, height: 24 }, scene)
  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = sandMaterial

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  /** 岩壁，襯托水柱用 */
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5]] as const) {
    for (let level = 0; level < 3; level++) {
      const box = MeshBuilder.CreateBox(`rock-${x}-${level}`, { size: 1 }, scene)
      box.position.set(x, level + 0.5, z)
      box.material = stoneMaterial
    }
  }

  const flowTexture = createFlowTexture(babylon, scene)

  const waterMaterial = new StandardMaterial('water', scene)
  waterMaterial.diffuseTexture = flowTexture
  /**
   * 水的法線統一朝上
   *
   * 整池水因此是一個光學上的平面，四面取同一個亮度
   */
  waterMaterial.specularColor = new Color3(0.8, 0.82, 0.85)
  waterMaterial.specularPower = 160
  waterMaterial.backFaceCulling = false

  /** 一根三格高的水柱，四個側面都看得到 */
  const meshList: Mesh[] = []
  for (let level = 0; level < 3; level++) {
    const box = MeshBuilder.CreateBox(`water-${level}`, { size: 1 }, scene)
    box.position.set(0, level + 0.5, -1.5)
    box.material = waterMaterial

    const uvList = box.getVerticesData(VertexBuffer.UVKind)
    if (uvList) {
      originalUvMap.set(box, Array.from(uvList))
    }

    const aligned = measureAlignedUv(box, babylon, 1)
    if (aligned) {
      alignedUvMap.set(box, aligned)
    }

    /** 法線一律朝上，整塊取同一個亮度 */
    const normalList = box.getVerticesData(VertexBuffer.NormalKind)
    if (normalList) {
      for (let index = 0; index < normalList.length; index += 3) {
        normalList[index] = 0
        normalList[index + 1] = 1
        normalList[index + 2] = 0
      }
      box.setVerticesData(VertexBuffer.NormalKind, normalList)
    }

    meshList.push(box)
  }

  waterMeshList.value = meshList
  applySetting()

  /** 逐格往下捲，水就流起來了 */
  let elapsed = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    const deltaSecond = scene.getEngine().getDeltaTime() / 1000
    elapsed += deltaSecond
    flowTexture.vOffset = Math.floor(elapsed * TEXTURE_FRAME_RATE) % FRAME_COUNT / FRAME_COUNT

    if (isRotating.value) {
      camera.alpha += deltaSecond * 0.35
    }
  })

  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    originalUvMap.clear()
    alignedUvMap.clear()
    waterMeshList.value = []
  }
}

function applySetting() {
  for (const mesh of waterMeshList.value) {
    const uvList = isUvAligned.value
      ? alignedUvMap.get(mesh)
      : originalUvMap.get(mesh)

    if (uvList) {
      mesh.setVerticesData('uv', uvList)
    }
  }
}

watch(isUvAligned, applySetting)
</script>
