import type { DirectionalLight, HemisphericLight, Mesh, Scene, StandardMaterial } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

/**
 * 這一章共用的測試場地
 *
 * 五個範例都在同一塊白沙上放同一批東西，換的只是陰影那幾個設定。
 * 場地不一樣的話，讀者分不出畫面的差別是設定造成的還是場景造成的
 */

/** 光線前進的方向，午後偏西的角度 */
export const SUN_DIRECTION: readonly [number, number, number] = [0.58, -0.66, -0.48]

export interface ShadowStage {
  sun: DirectionalLight;
  ambient: HemisphericLight;
  ground: Mesh;
  stoneMaterial: StandardMaterial;
  woodMaterial: StandardMaterial;
}

export interface ShadowStageParam {
  babylon: BabylonModule;
  scene: Scene;
  /** 地面邊長 */
  groundSize?: number;
  /** 地面中心，長廊那個範例要往深處挪 */
  groundOffsetZ?: number;
}

/** 建一盞平行光、一盞天光與一片白沙 */
export function createShadowStage(param: ShadowStageParam): ShadowStage {
  const { babylon, scene, groundSize = 70, groundOffsetZ = 0 } = param
  const { Color3, DirectionalLight, HemisphericLight, MeshBuilder, StandardMaterial, Vector3 } = babylon

  scene.clearColor = new babylon.Color4(0.84, 0.89, 0.94, 1)

  /**
   * 平行光
   *
   * 太陽在一億五千萬公里外，射到這座庭園的光線可以當成互相平行。
   * 平行光沒有位置的概念，投影用的鏡頭因此走正交投影
   */
  const sun = new DirectionalLight('sun', new Vector3(...SUN_DIRECTION), scene)
  sun.intensity = 1.25
  sun.diffuse = new Color3(1, 0.93, 0.78)
  sun.specular = new Color3(0, 0, 0)

  /** 天光，影子裡只剩它，所以它決定影子有多黑 */
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.62
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const ground = MeshBuilder.CreateGround('ground', {
    width: groundSize,
    height: groundSize,
  }, scene)
  ground.position.z = groundOffsetZ
  ground.material = sandMaterial
  ground.receiveShadows = true

  const stoneMaterial = new StandardMaterial('stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  const woodMaterial = new StandardMaterial('wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wood-texture' })
  woodMaterial.specularColor = new Color3(0.02, 0.02, 0.02)

  return { sun, ambient, ground, stoneMaterial, woodMaterial }
}

/**
 * 場地上的那批東西
 *
 * 一座鳥居、一片矮牆、幾顆貼地的小石頭。
 * 鳥居負責看接觸硬化，矮牆負責看自我遮蔽的條紋，
 * 小石頭負責看 bias 有沒有把貼地的短影子吃掉
 */
export function createShadowProps(param: {
  babylon: BabylonModule;
  scene: Scene;
  stage: ShadowStage;
}): Mesh[] {
  const { babylon, scene, stage } = param
  const { MeshBuilder } = babylon
  const meshList: Mesh[] = []

  const addMesh = (mesh: Mesh, material: StandardMaterial) => {
    mesh.material = material
    mesh.receiveShadows = true
    meshList.push(mesh)
  }

  /** 鳥居的兩根柱子，從地面一路長上去 */
  for (const [index, offset] of [-2.6, 2.6].entries()) {
    const pillar = MeshBuilder.CreateBox(`torii-pillar-${index}`, {
      width: 0.7,
      height: 6.4,
      depth: 0.7,
    }, scene)
    pillar.position.set(offset, 3.2, 0)
    addMesh(pillar, stage.woodMaterial)
  }

  const beam = MeshBuilder.CreateBox('torii-beam', { width: 7.4, height: 0.5, depth: 0.8 }, scene)
  beam.position.set(0, 6.2, 0)
  addMesh(beam, stage.woodMaterial)

  const lintel = MeshBuilder.CreateBox('torii-lintel', { width: 5.4, height: 0.4, depth: 0.6 }, scene)
  lintel.position.set(0, 5.1, 0)
  addMesh(lintel, stage.woodMaterial)

  /** 一片矮牆，自我遮蔽的條紋在這種大平面上最明顯 */
  for (let x = -4; x <= 4; x++) {
    for (let y = 0; y < 2; y++) {
      const box = MeshBuilder.CreateBox(`wall-${x}-${y}`, { size: 1 }, scene)
      box.position.set(x, y + 0.5, -5.5)
      addMesh(box, stage.stoneMaterial)
    }
  }

  /** 幾顆貼地的小石頭，短影子被吃掉時最先看得出來 */
  for (const [index, spot] of ([[3.4, 3.2], [5.2, 1.4], [1.8, 4.6]] as const).entries()) {
    const pebble = MeshBuilder.CreateBox(`pebble-${index}`, {
      width: 0.7,
      height: 0.3,
      depth: 0.7,
    }, scene)
    pebble.position.set(spot[0], 0.15, spot[1])
    addMesh(pebble, stage.stoneMaterial)
  }

  return meshList
}

/**
 * 一路排到深處的柱子
 *
 * 單層陰影只罩得住鏡頭附近那一塊，遠處有沒有影子要靠這排柱子才看得出來
 */
export function createPillarRow(param: {
  babylon: BabylonModule;
  scene: Scene;
  stage: ShadowStage;
  count?: number;
  step?: number;
}): Mesh[] {
  const { babylon, scene, stage, count = 13, step = 8 } = param
  const meshList: Mesh[] = []

  for (let index = 0; index < count; index++) {
    for (const [side, offset] of [-3.4, 3.4].entries()) {
      const pillar = babylon.MeshBuilder.CreateBox(`row-${index}-${side}`, {
        width: 0.9,
        height: 5.5,
        depth: 0.9,
      }, scene)
      pillar.position.set(offset, 2.75, -index * step)
      pillar.material = stage.woodMaterial
      pillar.receiveShadows = true
      meshList.push(pillar)
    }
  }

  return meshList
}
