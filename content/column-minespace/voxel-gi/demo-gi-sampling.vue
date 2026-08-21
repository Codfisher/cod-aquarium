<template>
  <demo-frame
    :setup="setupScene"
    :badge="badge"
    title="材質外掛怎麼把它讀回來"
    caption="這片方板照著本體那份取樣函式讀圖集。最近鄰會讓同一個粗格內完全一樣、格與格之間硬切，地面上浮出一塊一塊的矩形；少了減半格，整份間接光會偏移半個粗格；關掉垂直內插，把取樣高度往上拉時整片顏色會一層一層跳。"
    :camera-alpha="-Math.PI / 3.6"
    :camera-beta="Math.PI / 3.4"
    :camera-radius="32"
    :camera-target="WORLD_CENTER"
    :height="320"
  >
    <demo-toggle
      v-model="bilinearEnabled"
      label="水平雙線性"
    />
    <demo-toggle
      v-model="halfOffsetEnabled"
      label="減半格對齊中心"
    />
    <demo-toggle
      v-model="verticalBlendEnabled"
      label="垂直取兩層內插"
    />
    <demo-slider
      v-model="sampleHeight"
      label="取樣高度"
      :min="2"
      :max="7"
      :step="0.1"
      :digit="1"
      unit=" 格"
    />
  </demo-frame>
</template>

<script setup lang="ts">
import type { Mesh, RawTexture, ShaderMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import type { DemoView } from './gi-view'
import { computed, shallowRef, watch } from 'vue'
import DemoFrame from '../demo/demo-frame.vue'
import DemoSlider from '../demo/demo-slider.vue'
import DemoToggle from '../demo/demo-toggle.vue'
import { addDemoLighting, createBlockView, WORLD_CENTER } from './gi-view'
import {
  bakeIndirectLight,
  buildGiAtlas,
  buildGiGrid,
  createDemoWorld,
  measureTilesPerRow,
  WORLD_SIZE_X,
  WORLD_SIZE_Z,
} from './gi-world'

const bilinearEnabled = shallowRef(true)
const halfOffsetEnabled = shallowRef(true)
const verticalBlendEnabled = shallowRef(true)
const sampleHeight = shallowRef(2.5)

/** 這一組格距與本體「高」那一級相同 */
const world = createDemoWorld()
const grid = buildGiGrid(world, 4, 2)
const indirectList = bakeIndirectLight(grid, {
  world,
  sunColor: [1, 0.96, 0.88],
  sunStrength: 1,
  bouncePassCount: 4,
  bounceStrength: 0.35,
  lampEnabled: true,
})
const atlas = buildGiAtlas(grid, indirectList, measureTilesPerRow(grid))

const badge = computed(() => (bilinearEnabled.value ? '雙線性' : '最近鄰'))

const SHADER_NAME = 'demoVoxelGiSampling'

const VERTEX_SHADER = `
precision highp float;

attribute vec3 position;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vPositionW;

void main() {
  vPositionW = (world * vec4(position, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

/**
 * 取樣的算式照抄本體的 VOXEL_GI_SAMPLE_GLSL
 *
 * 差別只有兩個示範用的開關：減半格與垂直內插各自可以關掉，
 * 關掉之後畫面上會發生什麼事就一目了然
 */
const FRAGMENT_SHADER = `
precision highp float;

varying vec3 vPositionW;

uniform sampler2D voxelGiSampler;
uniform vec3 voxelGiGrid;
uniform vec3 voxelGiCellSize;
uniform vec3 voxelGiAtlas;
uniform float halfOffsetEnabled;
uniform float verticalBlendEnabled;
uniform float gain;

vec4 sampleVoxelSlice(vec2 cellXZ, float slice) {
  float tileX = mod(slice, voxelGiAtlas.x);
  float tileY = floor(slice / voxelGiAtlas.x);
  vec2 pixel = vec2(tileX * voxelGiGrid.x, tileY * voxelGiGrid.z) + cellXZ + 0.5;

  return texture2D(voxelGiSampler, pixel / voxelGiAtlas.yz);
}

vec4 sampleVoxelGi(vec3 worldPosition) {
  /** 減掉半格，整數點才落在格子中心 */
  vec3 cell = worldPosition / voxelGiCellSize - 0.5 * halfOffsetEnabled;
  cell = clamp(cell, vec3(0.0), voxelGiGrid - 1.0);

  float slice0 = floor(cell.y);
  float slice1 = min(slice0 + 1.0, voxelGiGrid.y - 1.0);

  vec4 lowSample = sampleVoxelSlice(cell.xz, slice0);
  if (verticalBlendEnabled < 0.5) {
    return lowSample;
  }

  /** 上下兩層各取一次再內插，垂直方向才不會一階一階跳 */
  return mix(lowSample, sampleVoxelSlice(cell.xz, slice1), cell.y - slice0);
}

void main() {
  gl_FragColor = vec4(sampleVoxelGi(vPositionW).rgb * gain, 1.0);
}
`

const materialRef = shallowRef<ShaderMaterial>()
const textureRef = shallowRef<RawTexture>()
const planeRef = shallowRef<Mesh>()
const blockViewRef = shallowRef<DemoView>()

/** 兩種取樣模式的代號，Babylon 是動態載入的，常數得在 setup 裡取 */
const samplingModeMap = shallowRef<{ nearest: number; bilinear: number }>()

function setupScene({ babylon, scene }: BabylonDemoContext) {
  const { Effect, MeshBuilder, RawTexture, ShaderMaterial, Texture, Vector3 } = babylon

  addDemoLighting(babylon, scene)
  blockViewRef.value = createBlockView(babylon, scene, world)

  samplingModeMap.value = {
    nearest: Texture.NEAREST_SAMPLINGMODE,
    bilinear: Texture.BILINEAR_SAMPLINGMODE,
  }

  const texture = RawTexture.CreateRGBATexture(
    atlas.data,
    atlas.width,
    atlas.height,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  /** 世界外緣不要繞回另一頭，貼著邊界取樣不到才不會冒出對面的顏色 */
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  textureRef.value = texture

  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER

  const material = new ShaderMaterial('gi-sampling', scene, SHADER_NAME, {
    attributes: ['position'],
    uniforms: [
      'world',
      'worldViewProjection',
      'voxelGiGrid',
      'voxelGiCellSize',
      'voxelGiAtlas',
      'halfOffsetEnabled',
      'verticalBlendEnabled',
      'gain',
    ],
    samplers: ['voxelGiSampler'],
  })
  material.backFaceCulling = false

  /** 網格的形狀與圖集的排法從頭到尾不變，設一次就好 */
  material.setVector3('voxelGiGrid', new Vector3(grid.gridX, grid.gridY, grid.gridZ))
  material.setVector3('voxelGiCellSize', new Vector3(grid.cellSizeXZ, grid.cellSizeY, grid.cellSizeXZ))
  material.setVector3('voxelGiAtlas', new Vector3(atlas.tilesPerRow, atlas.width, atlas.height))
  /** 間接光本來就很淡，示範時放大幾倍才看得出分布 */
  material.setFloat('gain', 3.2)

  materialRef.value = material

  const plane = MeshBuilder.CreateGround('gi-probe', {
    width: WORLD_SIZE_X,
    height: WORLD_SIZE_Z,
  }, scene)
  plane.position.set(WORLD_SIZE_X / 2, sampleHeight.value, WORLD_SIZE_Z / 2)
  plane.material = material
  plane.isPickable = false
  planeRef.value = plane

  applySetting()

  return () => {
    blockViewRef.value?.dispose()
    material.dispose()
    texture.dispose()
    plane.dispose()
    blockViewRef.value = undefined
    materialRef.value = undefined
    textureRef.value = undefined
    planeRef.value = undefined
  }
}

function applySetting() {
  const material = materialRef.value
  const texture = textureRef.value
  const samplingMode = samplingModeMap.value
  if (!material || !texture || !samplingMode)
    return

  texture.updateSamplingMode(
    bilinearEnabled.value ? samplingMode.bilinear : samplingMode.nearest,
  )
  material.setTexture('voxelGiSampler', texture)
  material.setFloat('halfOffsetEnabled', halfOffsetEnabled.value ? 1 : 0)
  material.setFloat('verticalBlendEnabled', verticalBlendEnabled.value ? 1 : 0)

  planeRef.value?.position.set(WORLD_SIZE_X / 2, sampleHeight.value, WORLD_SIZE_Z / 2)
}

watch(
  [bilinearEnabled, halfOffsetEnabled, verticalBlendEnabled, sampleHeight],
  applySetting,
)
</script>
