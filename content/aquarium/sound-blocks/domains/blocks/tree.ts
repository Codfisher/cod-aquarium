import type { CreateBlockParams } from '.'
import {
  ImportMeshAsync,
  TransformNode,
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
  ] = await Promise.all([
    ImportMeshAsync(
      '/assets/kenny-hexagon-pack/GLB format/building-archery.glb',
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

      shadowGenerator?.addShadowCaster(rootMesh)

      rootMesh.parent = rootNode
    },
  )

  return {
    rootNode,
  }
}
