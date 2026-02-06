import type { ISceneLoaderAsyncResult, Mesh, Scene } from '@babylonjs/core'
import type { TrackSegmentType } from './data'
import { ImportMeshAsync, PhysicsAggregate, PhysicsShapeType, Quaternion, TransformNode, Vector3 } from '@babylonjs/core'
import { trackSegmentData } from './data'

export interface TrackSegment {
  rootNode: TransformNode;
  partList: ISceneLoaderAsyncResult[];
  /** 起點座標 */
  startPosition: Vector3;
  /** 終點座標 */
  endPosition: Vector3;
  /** 初始化物理 */
  initPhysics: () => void;
}

export async function createTrackSegment({
  scene,
  type = 'g01',
}: {
  scene: Scene;
  type?: `${TrackSegmentType}`;
}): Promise<TrackSegment> {
  const rootNode = new TransformNode('rootNode', scene)
  const partList: ISceneLoaderAsyncResult[] = []
  const data = trackSegmentData[type]

  const startPosition = new Vector3(0, 0, 0)
  const endPosition = new Vector3(0, 0, 0)

  // 暫存需要建立物理的網格資訊
  const physicsPendingList: { mesh: Mesh; metadata: any }[] = []

  const loadPartTasks = data.partList.map(async (partData) => {
    const position = Vector3.FromArray(partData.position)
    if (partData.metadata.name === 'in') {
      startPosition.copyFrom(position)
      return
    }
    if (partData.metadata.name === 'out') {
      endPosition.copyFrom(position)
      return
    }

    const part = await ImportMeshAsync(
      `/assets/${data.rootFolderName}/${partData.path}`,
      scene,
    )
    const root = part.meshes[0]
    const geometryMesh = part.meshes[1] as Mesh // 轉型為 Mesh

    if (!root || !geometryMesh) {
      return
    }
    root.name = partData.metadata.name
    root.getChildMeshes().forEach((mesh) => {
      mesh.receiveShadows = true
    })

    const partContainer = new TransformNode('partContainer', scene)

    partContainer.position = position
    partContainer.rotationQuaternion = Quaternion.FromArray(partData.rotationQuaternion)
    partContainer.scaling = Vector3.FromArray(partData.scaling)

    partContainer.parent = rootNode
    root.parent = partContainer

    if (geometryMesh) {
      physicsPendingList.push({
        mesh: geometryMesh,
        metadata: partData.metadata,
      })
    }

    partList.push(part)

    return part
  })
  await Promise.all(loadPartTasks)

  const initPhysics = () => {
    physicsPendingList.forEach(({ mesh, metadata }) => {
      const aggregate = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.MESH,
        metadata,
        scene,
      )
    })
  }

  return {
    rootNode,
    partList,
    startPosition,
    endPosition,
    initPhysics,
  }
}
