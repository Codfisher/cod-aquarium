import type { ISceneLoaderAsyncResult, Scene } from '@babylonjs/core'
import { ImportMeshAsync, MeshBuilder, PhysicsAggregate, PhysicsShapeType, TransformNode, Vector3 } from '@babylonjs/core'

interface TrackSegment {
  rootNode: TransformNode;
  partList: ISceneLoaderAsyncResult[];
}

const partNameList = [
  'platform_slope_2x2x2',
]
const partColorList = [
  'blue',
  'green',
  'red',
  'yellow',
]

const trackSegmentTypes = {
  a: [],
}

export async function createTrackSegment({ scene }: {
  scene: Scene;
}): Promise<TrackSegment> {
  const rootNode = new TransformNode('rootNode', scene)
  const partList: ISceneLoaderAsyncResult[] = []

  const part = await ImportMeshAsync(
    '/assets/platformer-pack/blue/platform_slope_2x2x2_blue.gltf',
    scene,
  )

  const root = part.meshes[0]!
  root.parent = rootNode

  const partAggregate = new PhysicsAggregate(
    part.meshes[1]!,
    PhysicsShapeType.CONVEX_HULL,
    { mass: 0, restitution: 0 },
    scene,
  )

  partList.push(part)

  return {
    rootNode,
    partList,
  }
}
