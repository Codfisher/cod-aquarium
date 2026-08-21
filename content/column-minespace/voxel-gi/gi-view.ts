import type { Mesh, Scene } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'
import type { DemoWorld, GiGrid } from './gi-world'
import {
  BLOCK_ALBEDO_LIST,
  BlockId,
  toCellIndex,
  toWorldIndex,
  WORLD_SIZE_X,
  WORLD_SIZE_Y,
  WORLD_SIZE_Z,
} from './gi-world'

/**
 * 範例共用的畫法
 *
 * 三個範例都要把同一個迷你世界畫出來，差別只在上面疊什麼。
 * 方塊本體用 thin instance 分組畫，八百多顆方塊才不會變成八百多次繪製呼叫
 */

export interface DemoView {
  meshList: Mesh[];
  dispose: () => void;
}

/** 把方塊世界畫出來，同一種方塊共用一個網格 */
export function createBlockView(
  babylon: BabylonModule,
  scene: Scene,
  world: DemoWorld,
): DemoView {
  const { Color3, Matrix, MeshBuilder, StandardMaterial } = babylon

  const blockIdList = [BlockId.STONE, BlockId.RED, BlockId.GREEN, BlockId.LAMP]
  const meshList: Mesh[] = []

  for (const blockId of blockIdList) {
    const positionList: [number, number, number][] = []

    for (let x = 0; x < WORLD_SIZE_X; x++) {
      for (let y = 0; y < WORLD_SIZE_Y; y++) {
        for (let z = 0; z < WORLD_SIZE_Z; z++) {
          if (world.blockList[toWorldIndex(x, y, z)] !== blockId)
            continue

          positionList.push([x + 0.5, y + 0.5, z + 0.5])
        }
      }
    }

    if (positionList.length === 0)
      continue

    const mesh = MeshBuilder.CreateBox(`block-${blockId}`, { size: 1 }, scene)
    const material = new StandardMaterial(`block-material-${blockId}`, scene)
    const albedo = BLOCK_ALBEDO_LIST[blockId] ?? [0.6, 0.6, 0.6]

    material.diffuseColor = new Color3(albedo[0]!, albedo[1]!, albedo[2]!)
    material.specularColor = new Color3(0, 0, 0)
    if (blockId === BlockId.LAMP) {
      material.emissiveColor = new Color3(0.9, 0.76, 0.45)
    }
    mesh.material = material
    mesh.isPickable = false

    const matrixList = new Float32Array(positionList.length * 16)
    for (const [index, position] of positionList.entries()) {
      Matrix.Translation(position[0], position[1], position[2]).copyToArray(matrixList, index * 16)
    }
    mesh.thinInstanceSetBuffer('matrix', matrixList, 16)

    meshList.push(mesh)
  }

  return {
    meshList,
    dispose: () => {
      for (const mesh of meshList) {
        mesh.material?.dispose()
        mesh.dispose()
      }
    },
  }
}

export interface CellViewParam {
  /** 這一格要畫成什麼顏色，回傳 null 代表這一格不畫 */
  measureColor: (cellIndex: number) => readonly [number, number, number] | null;
  /** 方塊填滿粗格的比例，小於一才看得出格與格的分界 */
  fillRatio?: number;
  alpha?: number;
}

/**
 * 把粗網格畫成一顆一顆的方塊
 *
 * 粗格的數量遠少於方塊（最細的設定也只有兩百多格），
 * 所以這裡不必分組，一格一個網格反而好上色
 */
export function createCellView(
  babylon: BabylonModule,
  scene: Scene,
  grid: GiGrid,
  param: CellViewParam,
): DemoView {
  const { Color3, MeshBuilder, StandardMaterial } = babylon
  const fillRatio = param.fillRatio ?? 0.86
  const alpha = param.alpha ?? 1

  const meshList: Mesh[] = []

  for (let x = 0; x < grid.gridX; x++) {
    for (let y = 0; y < grid.gridY; y++) {
      for (let z = 0; z < grid.gridZ; z++) {
        const cellIndex = toCellIndex(grid, x, y, z)
        const color = param.measureColor(cellIndex)
        if (!color)
          continue

        const mesh = MeshBuilder.CreateBox(`cell-${cellIndex}`, {
          width: grid.cellSizeXZ * fillRatio,
          height: grid.cellSizeY * fillRatio,
          depth: grid.cellSizeXZ * fillRatio,
        }, scene)

        mesh.position.set(
          (x + 0.5) * grid.cellSizeXZ,
          (y + 0.5) * grid.cellSizeY,
          (z + 0.5) * grid.cellSizeXZ,
        )
        mesh.isPickable = false

        const material = new StandardMaterial(`cell-material-${cellIndex}`, scene)
        material.disableLighting = true
        material.emissiveColor = new Color3(color[0], color[1], color[2])
        material.diffuseColor = new Color3(0, 0, 0)
        material.specularColor = new Color3(0, 0, 0)
        material.alpha = alpha
        mesh.material = material

        meshList.push(mesh)
      }
    }
  }

  return {
    meshList,
    dispose: () => {
      for (const mesh of meshList) {
        mesh.material?.dispose()
        mesh.dispose()
      }
    },
  }
}

/** 三個範例共用的燈光，方塊要看得出六個面的差別 */
export function addDemoLighting(babylon: BabylonModule, scene: Scene): void {
  const { Color3, DirectionalLight, HemisphericLight, Vector3 } = babylon

  const sun = new DirectionalLight('sun', new Vector3(-0.42, -0.78, -0.46), scene)
  sun.intensity = 1.1
  sun.diffuse = new Color3(1, 0.95, 0.84)

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
  ambient.intensity = 0.55
  ambient.diffuse = new Color3(0.8, 0.86, 1)
  ambient.groundColor = new Color3(0.6, 0.58, 0.55)
  ambient.specular = new Color3(0, 0, 0)
}

/** 世界的中心，鏡頭要看著這裡 */
export const WORLD_CENTER: [number, number, number] = [
  WORLD_SIZE_X / 2,
  WORLD_SIZE_Y / 3,
  WORLD_SIZE_Z / 2,
]
