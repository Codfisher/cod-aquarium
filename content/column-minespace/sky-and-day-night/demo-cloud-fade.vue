<template>
  <demo-frame
    :setup="setupScene"
    title="遠處的雲要化進天色"
    caption="雲層往四面鋪得很遠，從眼睛看出去越遠的雲落在越低的仰角上，最遠那一圈只剩不到五度。幾百朵雲全擠在地平線上方那一小條裡，疊成一道白得發亮的帶子。而雲又是全場唯一不吃霧氣的東西，那道帶子連淡都不會淡。"
    :camera-alpha="-Math.PI / 2"
    :camera-beta="Math.PI / 2.12"
    :camera-radius="24"
    :camera-target="[0, 24, 0]"
    :height="300"
  >
    <demo-toggle
      v-model="hasDistanceFade"
      label="隨距離化進天色"
    />
    <demo-slider
      v-model="fadeStart"
      label="開始淡出"
      :min="40"
      :max="600"
      :step="10"
      :digit="0"
      unit=" 格"
    />
    <demo-slider
      v-model="fadeEnd"
      label="完全化開"
      :min="200"
      :max="1400"
      :step="20"
      :digit="0"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { ShaderMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'

const hasDistanceFade = shallowRef(true)
const fadeStart = shallowRef(320)
const fadeEnd = shallowRef(900)

/** 半透明的雲，飛過頭頂時還看得到後面的天色 */
const CLOUD_ALPHA = 0.72
const CLOUD_HEIGHT = 104
const CLOUD_CELL_SIZE = 14
const PATTERN_COUNT = 18
const TILE_COUNT = 9

/**
 * 視空間的原點就是眼睛
 *
 * 長度直接就是離鏡頭多遠，每個像素各自算，遠近之間是連續的
 */
const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;

uniform mat4 worldView;
uniform mat4 worldViewProjection;

varying float vDistance;

void main() {
  vDistance = length((worldView * vec4(position, 1.0)).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying float vDistance;

uniform vec3 cloudColor;
uniform vec3 hazeColor;
uniform float cloudAlpha;
uniform float fadeStart;
uniform float fadeEnd;

void main() {
  float haze = smoothstep(fadeStart, fadeEnd, vDistance);
  vec3 color = mix(cloudColor, hazeColor, haze);
  gl_FragColor = vec4(color, cloudAlpha);
}
`

const cloudMaterial = shallowRef<ShaderMaterial>()

function createSeededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function setupScene({ babylon, scene, camera }: BabylonDemoContext) {
  const { Color3, Effect, Mesh, MeshBuilder, ShaderMaterial, StandardMaterial, VertexData } = babylon

  /** 天邊那一段用霧色，天與地才接得起來 */
  const hazeColor: [number, number, number] = [0.955, 0.95, 0.935]
  scene.clearColor = new babylon.Color4(0.42, 0.62, 0.9, 1)

  camera.maxZ = 2400

  Effect.ShadersStore.demoCloudFadeVertexShader = VERTEX_SHADER
  Effect.ShadersStore.demoCloudFadeFragmentShader = FRAGMENT_SHADER

  const material = new ShaderMaterial('demo-cloud-fade', scene, 'demoCloudFade', {
    attributes: ['position'],
    uniforms: [
      'world',
      'worldView',
      'worldViewProjection',
      'cloudColor',
      'hazeColor',
      'cloudAlpha',
      'fadeStart',
      'fadeEnd',
    ],
    needAlphaBlending: true,
  })
  material.alpha = CLOUD_ALPHA
  material.backFaceCulling = true
  /** 少了深度預寫，同一片雲自己的前後面會互相疊色 */
  material.needDepthPrePass = true
  material.setColor3('cloudColor', new Color3(1, 1, 1))
  material.setColor3('hazeColor', new Color3(...hazeColor))
  material.setFloat('cloudAlpha', CLOUD_ALPHA)
  cloudMaterial.value = material

  /** 圖樣與 EP06 那個範例同一套規則，只是這裡鋪得更遠 */
  const random = createSeededRandom(20260821)
  let cellList = Array.from(
    { length: PATTERN_COUNT * PATTERN_COUNT },
    () => random() < 0.34,
  )

  const readCell = (grid: boolean[], x: number, z: number) => {
    const wrappedX = ((x % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
    const wrappedZ = ((z % PATTERN_COUNT) + PATTERN_COUNT) % PATTERN_COUNT
    return grid[wrappedZ * PATTERN_COUNT + wrappedX] === true
  }

  for (let pass = 0; pass < 4; pass++) {
    const nextList = cellList.slice()
    for (let x = 0; x < PATTERN_COUNT; x++) {
      for (let z = 0; z < PATTERN_COUNT; z++) {
        let neighborCount = 0
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
            if (offsetX === 0 && offsetZ === 0)
              continue
            if (readCell(cellList, x + offsetX, z + offsetZ))
              neighborCount++
          }
        }
        nextList[z * PATTERN_COUNT + x] = neighborCount > 4
          || (neighborCount === 4 && readCell(cellList, x, z))
      }
    }
    cellList = nextList
  }

  const positionList: number[] = []
  const normalList: number[] = []
  const indexList: number[] = []

  const addQuad = (
    cornerList: [number, number, number][],
    normal: [number, number, number],
  ) => {
    const baseIndex = positionList.length / 3
    for (const corner of cornerList) {
      positionList.push(corner[0], corner[1], corner[2])
      normalList.push(normal[0], normal[1], normal[2])
    }
    indexList.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }

  const half = (PATTERN_COUNT * TILE_COUNT) / 2
  const isFilled = (x: number, z: number) => {
    if (x < -half || x >= half || z < -half || z >= half)
      return false
    return readCell(cellList, x, z)
  }

  const halfThickness = 2.5

  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      if (!isFilled(x, z))
        continue

      const minX = x * CLOUD_CELL_SIZE
      const maxX = minX + CLOUD_CELL_SIZE
      const minZ = z * CLOUD_CELL_SIZE
      const maxZ = minZ + CLOUD_CELL_SIZE

      addQuad([
        [minX, halfThickness, minZ],
        [minX, halfThickness, maxZ],
        [maxX, halfThickness, maxZ],
        [maxX, halfThickness, minZ],
      ], [0, 1, 0])

      addQuad([
        [minX, -halfThickness, maxZ],
        [minX, -halfThickness, minZ],
        [maxX, -halfThickness, minZ],
        [maxX, -halfThickness, maxZ],
      ], [0, -1, 0])

      if (!isFilled(x - 1, z)) {
        addQuad([
          [minX, halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, -halfThickness, maxZ],
          [minX, halfThickness, maxZ],
        ], [-1, 0, 0])
      }
      if (!isFilled(x + 1, z)) {
        addQuad([
          [maxX, halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, -halfThickness, minZ],
          [maxX, halfThickness, minZ],
        ], [1, 0, 0])
      }
      if (!isFilled(x, z - 1)) {
        addQuad([
          [maxX, halfThickness, minZ],
          [maxX, -halfThickness, minZ],
          [minX, -halfThickness, minZ],
          [minX, halfThickness, minZ],
        ], [0, 0, -1])
      }
      if (!isFilled(x, z + 1)) {
        addQuad([
          [minX, halfThickness, maxZ],
          [minX, -halfThickness, maxZ],
          [maxX, -halfThickness, maxZ],
          [maxX, halfThickness, maxZ],
        ], [0, 0, 1])
      }
    }
  }

  const cloudMesh = new Mesh('cloud-layer', scene)
  const vertexData = new VertexData()
  vertexData.positions = positionList
  vertexData.normals = normalList
  vertexData.indices = indexList
  vertexData.applyToMesh(cloudMesh)
  cloudMesh.material = material
  cloudMesh.position.y = CLOUD_HEIGHT
  cloudMesh.isPickable = false

  /** 一片地當地平線的參照，雲的帶子就壓在它上面 */
  const groundMaterial = new StandardMaterial('ground', scene)
  groundMaterial.disableLighting = true
  groundMaterial.emissiveColor = new Color3(...hazeColor)
  groundMaterial.specularColor = new Color3(0, 0, 0)

  const ground = MeshBuilder.CreateGround('ground', { width: 2400, height: 2400 }, scene)
  ground.material = groundMaterial
  ground.position.y = 0

  applySetting()

  return () => {
    cloudMaterial.value = undefined
  }
}

function applySetting() {
  const material = cloudMaterial.value
  if (!material)
    return

  /**
   * 關掉時把兩個距離都推到極遠
   *
   * smoothstep 於是永遠回傳零，雲一路維持原本的白，
   * 效果等同這個功能不存在
   */
  material.setFloat('fadeStart', hasDistanceFade.value ? fadeStart.value : 1e6)
  material.setFloat('fadeEnd', hasDistanceFade.value ? Math.max(fadeEnd.value, fadeStart.value + 1) : 1e6 + 1)
}

watch([hasDistanceFade, fadeStart, fadeEnd], applySetting)
</script>
