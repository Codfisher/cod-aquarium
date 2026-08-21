import type { AbstractMesh, DynamicTexture, Mesh, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext, BabylonModule } from '../demo/use-babylon-demo'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

/**
 * 這一篇的共用場景
 *
 * 一方水池、一圈石燈籠、一座鳥居，還有一片會飄雲的天空。
 * 倒影要有東西可以映，天空與地景缺一都看得出來
 */

/** 液體的最上層比方塊頂面矮八分之一格 */
const LIQUID_SURFACE_DROP = 0.125

/** 水池的半寬與半深 */
export const POOL_HALF_WIDTH = 4.5
export const POOL_HALF_DEPTH = 4.5

/** 水面的世界高度 */
export const SURFACE_Y = 0.4 - LIQUID_SURFACE_DROP

/**
 * 倒影面比水面再高一點點
 *
 * 兩片幾乎同高的半透明面會互相爭深度，畫面上是一片閃爍的雜訊。
 * 抬高兩公分就分得開了，而兩公分在畫面上量不出來
 */
export const SURFACE_LIFT = 0.02

export interface MirrorScene {
  /** 天空那幾個網格 */
  skyMeshList: AbstractMesh[];
  /** 岸邊的地景 */
  landmarkList: AbstractMesh[];
  /** 水自己那一片，倒影疊在它上面 */
  waterMesh: Mesh;
}

/**
 * 邊緣淡出的遮罩
 *
 * 中心是滿的、往外收到全透明。倒影面是一片方形的板子，
 * 沒有這層遮罩的話，水池的四個角會露出筆直的邊
 */
export function createFadeTexture(
  babylon: BabylonModule,
  scene: Scene,
  innerRatio: number,
): DynamicTexture {
  const size = 128
  const texture = new babylon.DynamicTexture(
    'water-mirror-fade',
    { width: size, height: size },
    scene,
    true,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(Math.min(0.99, innerRatio), 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true

  return texture
}

export function createMirrorScene({ babylon, scene }: BabylonDemoContext): MirrorScene {
  const {
    Color3,
    Color4,
    DirectionalLight,
    DynamicTexture,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new Color4(0.6, 0.78, 0.99, 1)

  const sun = new DirectionalLight('sun', new Vector3(0.62, -0.6, -0.5), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.93, 0.78)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.82
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  /** 一個假的天空盒，只有它進得了反射清單，池面上才看得到雲 */
  const skyTexture = new DynamicTexture('sky-texture', { width: 256, height: 256 }, scene, true)
  const skyContext = skyTexture.getContext() as CanvasRenderingContext2D
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256)
  skyGradient.addColorStop(0, 'rgb(58, 118, 226)')
  skyGradient.addColorStop(0.62, 'rgb(146, 194, 246)')
  skyGradient.addColorStop(1, 'rgb(238, 240, 236)')
  skyContext.fillStyle = skyGradient
  skyContext.fillRect(0, 0, 256, 256)

  skyContext.fillStyle = 'rgba(255, 255, 255, 0.92)'
  for (const [x, y, width, height] of [[24, 44, 62, 18], [128, 30, 48, 14], [188, 62, 44, 16], [66, 84, 40, 12]]) {
    skyContext.fillRect(x!, y!, width!, height!)
  }
  skyTexture.update()

  const skyMaterial = new StandardMaterial('sky', scene)
  skyMaterial.diffuseTexture = skyTexture
  skyMaterial.diffuseColor = new Color3(0, 0, 0)
  skyMaterial.specularColor = new Color3(0, 0, 0)
  skyMaterial.emissiveColor = new Color3(1, 1, 1)
  skyMaterial.disableLighting = true
  skyMaterial.backFaceCulling = false

  const skyDome = MeshBuilder.CreateBox('sky-dome', { size: 120 }, scene)
  skyDome.material = skyMaterial
  skyDome.infiniteDistance = true
  skyDome.isPickable = false

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'mirror-sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'mirror-stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'mirror-wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene)
  ground.material = sandMaterial
  ground.isPickable = false

  const landmarkList: AbstractMesh[] = [ground]

  for (const [x, z] of [[-5.6, -4], [5.8, -3], [-5, 4.8]] as const) {
    const base = MeshBuilder.CreateBox(`lantern-base-${x}`, { width: 1.1, height: 0.9, depth: 1.1 }, scene)
    base.position.set(x, 0.45, z)
    base.material = stoneMaterial

    const post = MeshBuilder.CreateBox(`lantern-post-${x}`, { width: 0.35, height: 0.5, depth: 0.35 }, scene)
    post.position.set(x, 1.15, z)
    post.material = woodMaterial

    const head = MeshBuilder.CreateBox(`lantern-head-${x}`, { width: 1.4, height: 0.9, depth: 1.4 }, scene)
    head.position.set(x, 1.7, z)
    head.material = stoneMaterial

    landmarkList.push(base, post, head)
  }

  const toriiLeft = MeshBuilder.CreateBox('torii-left', { width: 0.5, height: 5, depth: 0.5 }, scene)
  toriiLeft.position.set(-2.4, 2.5, -8)
  toriiLeft.material = woodMaterial

  const toriiRight = MeshBuilder.CreateBox('torii-right', { width: 0.5, height: 5, depth: 0.5 }, scene)
  toriiRight.position.set(2.4, 2.5, -8)
  toriiRight.material = woodMaterial

  const toriiBeam = MeshBuilder.CreateBox('torii-beam', { width: 6.4, height: 0.5, depth: 0.6 }, scene)
  toriiBeam.position.set(0, 5.2, -8)
  toriiBeam.material = woodMaterial

  landmarkList.push(toriiLeft, toriiRight, toriiBeam)

  /** 水自己那一片，倒影是疊在它上面的另一片板子 */
  const waterMaterial: StandardMaterial = new StandardMaterial('water', scene)
  waterMaterial.diffuseColor = new Color3(0.22, 0.42, 0.5)
  waterMaterial.specularColor = new Color3(0.8, 0.82, 0.85)
  waterMaterial.specularPower = 160
  waterMaterial.alpha = 0.9

  const waterMesh = MeshBuilder.CreateGround(
    'water',
    { width: POOL_HALF_WIDTH * 2, height: POOL_HALF_DEPTH * 2 },
    scene,
  )
  waterMesh.position.y = SURFACE_Y
  waterMesh.material = waterMaterial
  waterMesh.isPickable = false

  return {
    skyMeshList: [skyDome],
    landmarkList,
    waterMesh,
  }
}
