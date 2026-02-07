import type { CreateBlockParams } from '.'
import {
  SceneLoader,
  TransformNode,
  Vector3,
} from '@babylonjs/core'
import { forEach, pipe } from 'remeda'

export async function createTreeBlock(
  {
    scene,
    shadowGenerator,
  }: CreateBlockParams,
) {
  const [
    treeResult,
    hexResult,
  ] = await Promise.all([
    SceneLoader.ImportMeshAsync(
      '',
      '/assets/hexagon-pack/decoration/nature/',
      'trees_B_medium.gltf',
      scene,
    ),
    SceneLoader.ImportMeshAsync(
      '',
      '/assets/hexagon-pack/tiles/base/',
      'hex_grass.gltf',
      scene,
    ),
  ])

  const rootNode = new TransformNode('block-root', scene)

  pipe(
    treeResult.meshes,
    forEach((mesh) => {
      mesh.receiveShadows = true
    }),
    ([rootMesh]) => {
      if (!rootMesh)
        return

      rootMesh.position = new Vector3(0, 0.5, 0)
      shadowGenerator?.addShadowCaster(rootMesh)

      rootMesh.parent = rootNode
    },
  )

  pipe(
    hexResult.meshes,
    forEach((mesh) => {
      mesh.receiveShadows = true
    }),
    ([rootMesh]) => {
      if (!rootMesh)
        return

      rootMesh.position = new Vector3(0, 0.5, 0)
      shadowGenerator?.addShadowCaster(rootMesh)

      rootMesh.parent = rootNode
    },
  )

  return {
    rootNode,
  }
}
