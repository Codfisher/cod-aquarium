import type {
  AbstractMesh,
  Scene,
} from '@babylonjs/core'
import {
  SceneLoader,
  Vector3,
} from '@babylonjs/core'

interface CreateBlockParams {
  scene: Scene;
}
export async function createTreeBlock(
  { scene }: CreateBlockParams,
) {
  const [
    treeResult,
    hexResult,
  ] = await Promise.all([
    SceneLoader.ImportMeshAsync(
      '',
      '/sound-blocks/hexagon-pack/decoration/nature/',
      'trees_B_large.gltf',
      scene,
    ),
    SceneLoader.ImportMeshAsync(
      '',
      '/sound-blocks/hexagon-pack/tiles/base/',
      'hex_grass.gltf',
      scene,
    ),
  ])

  const meshes: AbstractMesh[] = []
  if (treeResult.meshes[0]) {
    treeResult.meshes[0].position = new Vector3(0, 0.5, 0)
    meshes.push(treeResult.meshes[0])
  }

  if (hexResult.meshes[0]) {
    hexResult.meshes[0].position = new Vector3(0, 0.5, 0)
    meshes.push(hexResult.meshes[0])
  }

  return {
    meshes,
  }
}
