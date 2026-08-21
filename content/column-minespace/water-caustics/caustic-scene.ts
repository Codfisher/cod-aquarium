import type { RawTexture, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { createSandTexture, createStoneTexture } from '../demo/pixel-texture'

/**
 * 這一篇的共用場景
 *
 * 一方水池，旁邊挖一個一樣深卻沒有水的坑。
 * 「哪裡有水」這件事沒做對的時候，那個坑會第一個亮起來
 */

/** 水面的高度 */
export const WATER_SURFACE_Y = 2.6

/** 水池的邊界，兩個軸都是這個半寬 */
export const POOL_HALF_SIZE = 5

/** 世界的範圍，水位圖就烘在這一塊上 */
export const MAP_ORIGIN = -16
export const MAP_SPAN = 32

/** 水位圖的邊長，一個像素蓋半格 */
const MAP_SIZE = 64

/** 編碼水面高度時除以這個數，是二的冪，除下去沒有零頭 */
export const LEVEL_ENCODE_RANGE = 64

/** 這一格柱的地面頂在哪個高度 */
function measureGroundTop(x: number, z: number): number {
  /** 水池 */
  if (Math.abs(x) <= POOL_HALF_SIZE && Math.abs(z) <= POOL_HALF_SIZE)
    return 1

  /** 旁邊那個乾的坑，深度與水池一樣 */
  if (x >= 7 && x <= 12 && Math.abs(z) <= 3)
    return 1

  return 3
}

/** 這一格柱頭頂上有沒有水 */
function hasWater(x: number, z: number): boolean {
  return Math.abs(x) <= POOL_HALF_SIZE && Math.abs(z) <= POOL_HALF_SIZE
}

export interface CausticScene {
  /** 焦散要掛上去的那幾份材質 */
  materialList: StandardMaterial[];
  /** 烘好的水位圖 */
  waterLevelTexture: RawTexture;
}

/**
 * 把水位烘成一張貼圖
 *
 * R、G 兩個通道湊成十六位元的高度，B 存「這一格有沒有水」。
 * 用高度是零代表沒有水不行，世界的最底層本來就在零附近
 */
function createWaterLevelTexture({ babylon, scene }: BabylonDemoContext): RawTexture {
  const data = new Uint8Array(MAP_SIZE * MAP_SIZE * 4)
  const texelSpan = MAP_SPAN / MAP_SIZE

  for (let row = 0; row < MAP_SIZE; row++) {
    for (let column = 0; column < MAP_SIZE; column++) {
      const worldX = MAP_ORIGIN + (column + 0.5) * texelSpan
      const worldZ = MAP_ORIGIN + (row + 0.5) * texelSpan
      if (!hasWater(worldX, worldZ))
        continue

      const texel = (row * MAP_SIZE + column) * 4
      const encoded = Math.round(WATER_SURFACE_Y / LEVEL_ENCODE_RANGE * 65535)

      data[texel] = encoded >> 8
      data[texel + 1] = encoded & 255
      data[texel + 2] = 255
      data[texel + 3] = 255
    }
  }

  /**
   * 取樣一律用最近鄰
   *
   * 相鄰兩格若一格有水一格沒有，內插出來的是「半有水」，
   * 岸邊那一圈於是時有時無；高度是拆成兩個位元組存的，
   * 內插高位元組更是毫無意義
   */
  return babylon.RawTexture.CreateRGBATexture(
    data,
    MAP_SIZE,
    MAP_SIZE,
    scene,
    false,
    false,
    babylon.Texture.NEAREST_SAMPLINGMODE,
  )
}

/**
 * 一方水池、一個乾的坑，還有一片高起來的岸
 *
 * 地形照方塊世界的樣子用薄實例堆，每根格柱只鋪最上面兩層，
 * 底下反正看不到
 */
export function createCausticScene(context: BabylonDemoContext): CausticScene {
  const { babylon, scene } = context
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    Matrix,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new Color4(0.63, 0.77, 0.92, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.42, -0.8, -0.38), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.96, 0.86)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.7
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.8, 0.76, 0.7)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('caustic-sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'caustic-sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const stoneMaterial = new StandardMaterial('caustic-stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'caustic-stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const sandMatrixList: number[] = []
  const stoneMatrixList: number[] = []

  for (let x = MAP_ORIGIN; x < MAP_ORIGIN + MAP_SPAN; x++) {
    for (let z = MAP_ORIGIN; z < MAP_ORIGIN + MAP_SPAN; z++) {
      const top = measureGroundTop(x, z)
      const targetList = top >= 3 ? sandMatrixList : stoneMatrixList

      for (let level = 0; level < 2; level++) {
        const buffer = new Float32Array(16)
        Matrix.Translation(x, top - 0.5 - level, z).copyToArray(buffer, 0)
        targetList.push(...buffer)
      }
    }
  }

  const sandSource = MeshBuilder.CreateBox('caustic-sand-source', { size: 1 }, scene)
  sandSource.material = sandMaterial
  sandSource.isPickable = false
  sandSource.thinInstanceSetBuffer('matrix', new Float32Array(sandMatrixList), 16, true)
  sandSource.alwaysSelectAsActiveMesh = true

  const stoneSource = MeshBuilder.CreateBox('caustic-stone-source', { size: 1 }, scene)
  stoneSource.material = stoneMaterial
  stoneSource.isPickable = false
  stoneSource.thinInstanceSetBuffer('matrix', new Float32Array(stoneMatrixList), 16, true)
  stoneSource.alwaysSelectAsActiveMesh = true

  const waterMaterial = new StandardMaterial('caustic-water', scene)
  waterMaterial.diffuseColor = new Color3(0.42, 0.7, 0.92)
  waterMaterial.specularColor = new Color3(0.4, 0.45, 0.5)
  waterMaterial.specularPower = 128
  waterMaterial.alpha = 0.55

  const water = MeshBuilder.CreateGround(
    'caustic-water-surface',
    { width: POOL_HALF_SIZE * 2, height: POOL_HALF_SIZE * 2 },
    scene,
  )
  water.position.y = WATER_SURFACE_Y
  water.material = waterMaterial
  water.isPickable = false

  return {
    materialList: [sandMaterial, stoneMaterial],
    waterLevelTexture: createWaterLevelTexture(context),
  }
}
