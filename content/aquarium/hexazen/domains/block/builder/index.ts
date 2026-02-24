import type {
  Scene,
  ShadowGenerator,
} from '@babylonjs/core'
import type { Hex, HexLayout } from '../../hex-grid'
import type { Block, BlockType } from '../type'
import {
  ImportMeshAsync,
  PBRMaterial,
  Quaternion,
  TransformNode,
  Vector3,
} from '@babylonjs/core'
import { forEach, pipe } from 'remeda'
import { blockDefinitions } from './data'

export interface CreateBlockParams {
  type: BlockType;
  scene: Scene;
  shadowGenerator?: ShadowGenerator;
  hex: Hex;
  hexLayout: HexLayout;
}

export async function createBlock(
  {
    type,
    scene,
    shadowGenerator,
    hex,
    hexLayout,
  }: CreateBlockParams,
): Promise<Block> {
  const blockDefinition = blockDefinitions[type]

  const resultList = await Promise.all(
    blockDefinition.content.partList.map(async ({ path, position, rotationQuaternion, scaling }) => {
      const fullPath = `${blockDefinition.content.rootFolderName}/${path}`
      const model = await ImportMeshAsync(
        fullPath,
        scene,
      )

      model.meshes.forEach((mesh) => {
        if (mesh.material instanceof PBRMaterial) {
          mesh.material.metallic = 0
          mesh.material.roughness = 0.3
        }
      })

      return {
        model,
        position,
        rotationQuaternion,
        scaling,
      }
    }),
  )

  const rootNode = new TransformNode('block-root', scene)

  pipe(
    resultList,
    forEach((result) => {
      const { model, position, rotationQuaternion, scaling } = result
      const [rootMesh] = model.meshes

      if (!rootMesh) {
        return
      }

      rootMesh.receiveShadows = true
      rootMesh.position = new Vector3(...position)
      rootMesh.rotationQuaternion = new Quaternion(...rotationQuaternion)
      rootMesh.scaling = new Vector3(...scaling)
      rootMesh.parent = rootNode

      rootMesh.getChildMeshes().forEach((mesh) => {
        mesh.receiveShadows = true
        shadowGenerator?.addShadowCaster(mesh)
      })
    }),
  )

  rootNode.position.copyFrom(hexLayout.hexToWorld(hex))

  return {
    type,
    rootNode,
    hex,
  }
}
