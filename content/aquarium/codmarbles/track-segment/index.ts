import type { ISceneLoaderAsyncResult, Scene } from '@babylonjs/core'
import { ImportMeshAsync, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Quaternion, TransformNode, Vector3 } from '@babylonjs/core'

interface TrackSegmentPart {
  path: string;
  position: [number, number, number];
  rotationQuaternion: [number, number, number, number];
  scaling: [number, number, number];
}

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

enum TrackSegmentType {
  a = 'a',
}
const trackSegmentTypes: Record<TrackSegmentType, TrackSegmentPart[]> = {
  [TrackSegmentType.a]: [
    {
      path: 'platformer-pack/blue/platform_slope_2x4x4_blue.gltf',
      position: [0, 0, 0],
      rotationQuaternion: [0, 0, 0, 1],
      scaling: [1, 1, 1],
    },
    {
      path: 'platformer-pack/blue/platform_4x2x2_blue.gltf',
      position: [-1, 0, 3],
      rotationQuaternion: [0, 0, 0, 1],
      scaling: [1, 1, 1],
    },
    {
      path: 'platformer-pack/blue/railing_corner_double_blue.gltf',
      position: [0, 2, 2.98],
      rotationQuaternion: [0, -0.7, 0, 0.697],
      scaling: [1, 1, 1],
    },
  ],
}

export async function createTrackSegment({ scene }: {
  scene: Scene;
}): Promise<TrackSegment> {
  const rootNode = new TransformNode('rootNode', scene)
  const partList: ISceneLoaderAsyncResult[] = []

  const loadPartTasks = trackSegmentTypes.a.map(async (partData) => {
    const part = await ImportMeshAsync(
      `/assets/${partData.path}`,
      scene,
    )
    const root = part.meshes[0]
    const geometryMesh = part.meshes[1]

    if (!root) {
      return
    }

    const partContainer = new TransformNode('partContainer', scene)

    partContainer.position = Vector3.FromArray(partData.position)
    partContainer.rotationQuaternion = Quaternion.FromArray(partData.rotationQuaternion)
    partContainer.scaling = Vector3.FromArray(partData.scaling)

    partContainer.parent = rootNode
    root.parent = partContainer

    if (geometryMesh) {
      const partAggregate = new PhysicsAggregate(
        geometryMesh,
        PhysicsShapeType.CONVEX_HULL,
        { mass: 0, restitution: 0 },
        scene,
      )
    }

    partList.push(part)

    return part
  })
  await Promise.all(loadPartTasks)

  return {
    rootNode,
    partList,
  }
}
