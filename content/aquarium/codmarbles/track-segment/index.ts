import type { ISceneLoaderAsyncResult, Scene } from '@babylonjs/core'
import { ImportMeshAsync, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Quaternion, TransformNode, Vector3 } from '@babylonjs/core'
import { pipe, tap } from 'remeda'

interface TrackSegmentSceneData {
  version: number;
  rootFolderName: string;
  partList: Array<{
    path: string;
    position: [number, number, number];
    rotationQuaternion: [number, number, number, number];
    scaling: [number, number, number];
    metadata: {
      name: string;
      mass: number;
      restitution: number;
      friction: number;
    };
  }>;
}

interface TrackSegment {
  rootNode: TransformNode;
  partList: ISceneLoaderAsyncResult[];
  /** 起點座標 */
  startPosition: Vector3;
  /** 終點座標 */
  endPosition: Vector3;
}

enum TrackSegmentType {
  a = 'a',
}
const trackSegmentTypes: Record<TrackSegmentType, TrackSegmentSceneData> = {
  [TrackSegmentType.a]: {
    version: 1,
    rootFolderName: 'kay-platformer-pack',
    partList: [
      {
        path: 'neutral/structure_A.gltf',
        position: [0, 0, 0],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [0.00037384, 0, -2.0999999],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [5e-8, 0, 2.09987235],
        rotationQuaternion: [0, 1e-8, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [2.0999999, 0, -0.00009828],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x1_green.gltf',
        position: [-2, 0, -0.00003378],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-5.00000048, 0, 0.0004884],
        rotationQuaternion: [0, -0.70710678, 0, 0.70710678],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-8, 0, 0.00001159],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x2x2_green.gltf',
        position: [-8.0000124, 0, 3.00001097],
        rotationQuaternion: [0, -0.7071068, 0, 0.70710677],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-8.0000124, 2, 3.00001097],
        rotationQuaternion: [0, 0, 0, 1],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-9.99997425, 0, 4.00000525],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-9.99997425, 3.99999928, 4.00000525],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-5.99995613, 0, 2],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_A.gltf',
        position: [-8.0000124, 7.87400818, 4.00001001],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'in',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/flag_A_green.gltf',
        position: [-9.99525261, 7.99999905, 4.05270863],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/sign.gltf',
        position: [-5.93549967, 4, 2.16272593],
        rotationQuaternion: [0, -0.92387953, 0, 0.38268343],
        scaling: [0.99999998, 1, 0.99999998],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x2_green.gltf',
        position: [-4, 0, 2.00001168],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_1x1x1_green.gltf',
        position: [-6.50009775, 0, 3.50000072],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/railing_corner_padded_green.gltf',
        position: [-8, 4, 0.00001159],
        rotationQuaternion: [0, -0.70710676, 0, 0.7071068],
        scaling: [0.99999994, 1, 0.99999994],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_4x2x4_green.gltf',
        position: [-5, 0, -2],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-3.97969985, 2, 1.98393607],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
    ],
  },
}

export async function createTrackSegment({ scene }: {
  scene: Scene;
}): Promise<TrackSegment> {
  const rootNode = new TransformNode('rootNode', scene)
  const partList: ISceneLoaderAsyncResult[] = []
  const data = trackSegmentTypes.a

  const startPosition = new Vector3(0, 0, 0)
  const endPosition = new Vector3(0, 0, 0)

  const loadPartTasks = data.partList.map(async (partData) => {
    const part = await ImportMeshAsync(
      `/assets/${data.rootFolderName}/${partData.path}`,
      scene,
    )
    const root = part.meshes[0]
    const geometryMesh = part.meshes[1]

    if (!root || !geometryMesh) {
      return
    }
    root.name = partData.metadata.name

    const partContainer = new TransformNode('partContainer', scene)

    partContainer.position = Vector3.FromArray(partData.position)
    // Y 軸加入 180 度
    partContainer.rotationQuaternion = pipe(
      Quaternion.FromArray(partData.rotationQuaternion),
      tap((quaternion) => quaternion.multiplyInPlace(
        Quaternion.RotationAxis(
          root.getDirection(Vector3.Up()),
          Math.PI,
        ),
      )),
    )
    partContainer.scaling = Vector3.FromArray(partData.scaling)

    if (partData.metadata.name === 'in') {
      startPosition.copyFrom(partContainer.position)
    }
    if (partData.metadata.name === 'out') {
      endPosition.copyFrom(partContainer.position)
    }

    partContainer.parent = rootNode
    root.parent = partContainer

    if (geometryMesh) {
      const partAggregate = new PhysicsAggregate(
        geometryMesh,
        PhysicsShapeType.MESH,
        partData.metadata,
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
    startPosition,
    endPosition,
  }
}
