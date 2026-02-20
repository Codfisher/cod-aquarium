import type {
  Scene,
  ShadowGenerator,
} from '@babylonjs/core'
import {
  ImportMeshAsync,
  Quaternion,
  TransformNode,
  Vector3,
} from '@babylonjs/core'
import { forEach, pipe } from 'remeda'
import { blockDefinitions, type BlockType } from './data'

export interface CreateBlockParams {
  type: BlockType;
  scene: Scene;
  shadowGenerator?: ShadowGenerator;
}

export interface Block {
  type: BlockType;
  rootNode: TransformNode;
}

export async function createBlock(
  {
    type,
    scene,
    shadowGenerator,
  }: CreateBlockParams,
) {
  const blockDefinition = blockDefinitions[type]

  const resultList = await Promise.all(
    blockDefinition.content.partList.map(async ({ path, position, rotationQuaternion, scaling }) => {
      const fullPath = `${blockDefinition.content.rootFolderName}/${path}`
      const model = await ImportMeshAsync(
        fullPath,
        scene,
      )

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

  return {
    rootNode,
  }
}
