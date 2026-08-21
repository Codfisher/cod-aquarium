import type { DirectionalLight, HemisphericLight, StandardMaterial } from '@babylonjs/core'
import type { BabylonDemoContext } from '../demo/use-babylon-demo'
import { createSandTexture, createStoneTexture, createWoodTexture } from '../demo/pixel-texture'

/**
 * 這一篇的共用場景
 *
 * 一段木棧道、幾顆石頭、一片沙地。三種材質原本的高光差很多，
 * 淋濕之後才看得出「高光要往同一個目標值收」是什麼意思
 */

export interface WetScene {
  /** 濕潤要作用在這幾份材質上 */
  materialList: StandardMaterial[];
  sun: DirectionalLight;
  ambient: HemisphericLight;
}

export function createWetScene({ babylon, scene }: BabylonDemoContext): WetScene {
  const {
    Color3,
    Color4,
    DirectionalLight,
    HemisphericLight,
    MeshBuilder,
    StandardMaterial,
    Vector3,
  } = babylon

  scene.clearColor = new Color4(0.78, 0.82, 0.88, 1)

  /**
   * 斜射的陽光
   *
   * 濕地面那道刺眼的反光要有斜射光才照得出來，
   * 頂光只會在正下方留一個小點
   */
  const sun = new DirectionalLight('sun', new Vector3(0.82, -0.42, -0.38), scene)
  sun.intensity = 1.25
  sun.diffuse = new Color3(1, 0.93, 0.78)
  /** 高光給滿，讓材質自己決定要反射多少 */
  sun.specular = new Color3(1, 1, 1)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.72
  ambient.diffuse = new Color3(0.78, 0.88, 1)
  ambient.groundColor = new Color3(0.82, 0.77, 0.72)
  ambient.specular = new Color3(0, 0, 0)

  const sandMaterial = new StandardMaterial('wet-sand', scene)
  sandMaterial.diffuseTexture = createSandTexture({ babylon, scene, name: 'wet-sand-texture' })
  sandMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  sandMaterial.specularPower = 64

  const stoneMaterial = new StandardMaterial('wet-stone', scene)
  stoneMaterial.diffuseTexture = createStoneTexture({ babylon, scene, name: 'wet-stone-texture' })
  stoneMaterial.specularColor = new Color3(0.02, 0.02, 0.02)
  stoneMaterial.specularPower = 64

  const woodMaterial = new StandardMaterial('wet-wood', scene)
  woodMaterial.diffuseTexture = createWoodTexture({ babylon, scene, name: 'wet-wood-texture' })
  /**
   * 木頭原本的高光乾脆是零
   *
   * 這正是「高光要往同一個目標值收」的理由，
   * 照倍率放大的話它永遠濕不起來
   */
  woodMaterial.specularColor = new Color3(0, 0, 0)
  woodMaterial.specularPower = 64

  const ground = MeshBuilder.CreateGround('wet-ground', { width: 40, height: 40 }, scene)
  ground.material = sandMaterial
  ground.isPickable = false

  for (let index = 0; index < 7; index++) {
    const plank = MeshBuilder.CreateBox(`plank-${index}`, { width: 4, height: 0.2, depth: 0.8 }, scene)
    plank.position.set(0, 0.35, index - 3)
    plank.material = woodMaterial
    plank.isPickable = false
  }

  for (const [x, z, height] of [[-3.4, -1, 2], [3.6, 1.5, 1], [-2.6, 3, 1]] as const) {
    for (let level = 0; level < height; level++) {
      const box = MeshBuilder.CreateBox(`wet-stone-${x}-${level}`, { size: 1 }, scene)
      box.position.set(x, level + 0.5, z)
      box.material = stoneMaterial
      box.isPickable = false
    }
  }

  return {
    materialList: [sandMaterial, stoneMaterial, woodMaterial],
    sun,
    ambient,
  }
}
