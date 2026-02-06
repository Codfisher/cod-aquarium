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
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [1.2e-7, 0, 2.09987235],
        rotationQuaternion: [0, -1, 0, 3e-8],
        scaling: [0.99999994, 1, 0.99999994],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [0.0003737, 0, -2.09999967],
        rotationQuaternion: [0, 3e-8, 0, 1],
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
        path: 'neutral/structure_A.gltf',
        position: [0, 0, 0],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [1, 1, 1],
        metadata: {
          name: 'out',
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
        path: 'green/platform_slope_2x4x4_green.gltf',
        position: [-8.0000124, 2, 3.00001097],
        rotationQuaternion: [0, 1, 0, 3e-8],
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
        path: 'neutral/structure_C.gltf',
        position: [-8.00000286, 1.99889112, 6.00003242],
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
        path: 'green/barrier_3x1x1_green.gltf',
        position: [-8.11690426, 4, -0.25479507],
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
        path: 'green/platform_slope_6x2x2_green.gltf',
        position: [2.09999967, 0, -0.00009823],
        rotationQuaternion: [0, -0.70727417, 0, 0.70693935],
        scaling: [0.99999993, 1, 0.99999993],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'green/platform_2x2x4_green.gltf',
        position: [-8.00000286, 3.99887443, 6.00003242],
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
        position: [-5.00000048, 0, 0.00048834],
        rotationQuaternion: [0, 0.7071068, 0, 0.70710676],
        scaling: [0.99999994, 1, 0.99999994],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/structure_C.gltf',
        position: [-8.00000286, 0, 6.00003242],
        rotationQuaternion: [0, 1, 0, 0],
        scaling: [0.99999994, 1, 0.99999994],
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
        path: 'green/flag_A_green.gltf',
        position: [-5.56805801, 4, 2.46882749],
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
        position: [-7.99727631, 4.94498491, -0.37305415],
        rotationQuaternion: [0, 0.38268343, 0, 0.92387953],
        scaling: [0.9999999, 1, 0.9999999],
        metadata: {
          name: '',
          mass: 0,
          restitution: 0.5,
          friction: 0,
        },
      },
      {
        path: 'neutral/cone.gltf',
        position: [-5.9866271, 4, -2.03859353],
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
        path: 'neutral/platform_wood_1x1x1.gltf',
        position: [-4.07466125, 4, -2.04832768],
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
        path: 'green/railing_straight_double_green.gltf',
        position: [2.17891479, 1.05280244, -0.02310883],
        rotationQuaternion: [0, 0.70710678, 0, 0.70710678],
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
    root.getChildMeshes().forEach((mesh) => {
      mesh.receiveShadows = true
    })

    const partContainer = new TransformNode('partContainer', scene)

    partContainer.position = Vector3.FromArray(partData.position)
    // Y 軸加入 180 度
    partContainer.rotationQuaternion = Quaternion.FromArray(partData.rotationQuaternion)
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
