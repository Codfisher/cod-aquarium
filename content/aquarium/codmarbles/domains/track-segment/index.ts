import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core'
import type { useAssetStore } from '../../stores/asset-store'
import type { TrackSegmentPartMetadata, TrackSegmentType } from './data'
import { ImportMeshAsync, PBRMaterial, PhysicsAggregate, PhysicsShapeType, Quaternion, TransformNode, Vector3 } from '@babylonjs/core'
import { trackSegmentData } from './data'

export interface TrackSegment {
  type: `${TrackSegmentType}`;
  rootNode: TransformNode;
  /** 起點座標 */
  startPosition: Vector3;
  /** 終點座標 */
  endPosition: Vector3;
  /** 初始化物理 */
  initPhysics: () => void;
}

export async function createTrackSegment({
  scene,
  assetStore,
  type = 'g01',
}: {
  scene: Scene;
  assetStore: ReturnType<typeof useAssetStore>;
  type?: `${TrackSegmentType}`;
}): Promise<TrackSegment> {
  const rootNode = new TransformNode('rootNode', scene)
  const data = trackSegmentData[type]

  const startPosition = new Vector3(0, 0, 0)
  const endPosition = new Vector3(0, 0, 0)

  /** 暫存需要建立物理的網格資訊 */
  const physicsPendingList: Array<{
    mesh: AbstractMesh;
    metadata: TrackSegmentPartMetadata;
  }> = []

  const loadPartTasks = data.partList.map(async (partData) => {
    const fullPath = `${data.rootFolderName}/${partData.path}`

    // FIX: 使用 assetCache 反而導致 FPS 大幅下降 QQ，目前原因不明
    // const container = assetStore.assetCache.get(partData.path)
    // if (!container) {
    //   console.error(`Asset not found: ${fullPath}`)
    //   return
    // }

    const position = Vector3.FromArray(partData.position)
    let isHiddenMesh = false
    if (partData.metadata.name === 'in') {
      startPosition.copyFrom(position)
      isHiddenMesh = true
    }
    if (partData.metadata.name === 'out') {
      endPosition.copyFrom(position)
      isHiddenMesh = true
    }

    const part = await ImportMeshAsync(
      `/assets/${data.rootFolderName}/${partData.path}`,
      scene,
    )
    const root = part.meshes[0]
    const geometryMesh = part.meshes[1] as Mesh

    // const root = container.rootNodes[0]?.clone(
    //   partData.metadata.name,
    //   null,
    // ) as Mesh | undefined
    // const geometryMesh = root?.getChildMeshes()[0]

    if (!root || !geometryMesh) {
      return
    }
    root.name = partData.metadata.name
    root.getChildMeshes().forEach((mesh) => {
      mesh.receiveShadows = true
      if (isHiddenMesh) {
        mesh.isVisible = false
      }
    })

    const partContainer = new TransformNode('partContainer', scene)

    partContainer.position = position
    partContainer.rotationQuaternion = Quaternion.FromArray(partData.rotationQuaternion)
    partContainer.scaling = Vector3.FromArray(partData.scaling)

    partContainer.parent = rootNode
    root.parent = partContainer

    if (geometryMesh) {
      const mat = geometryMesh.material
      if (mat instanceof PBRMaterial) {
        mat.metallic = 0
        mat.roughness = 0.8

        // 輕微的自發光，讓它在陰影處不要變死黑，保持玩具的鮮豔度，複製原本的顏色，並縮小亮度
        mat.albedoColor.scaleToRef(0.05, mat.emissiveColor)
        mat.freeze()
      }

      physicsPendingList.push({
        mesh: geometryMesh,
        metadata: partData.metadata,
      })
    }
  })
  await Promise.all(loadPartTasks)

  const initPhysics = () => {
    physicsPendingList.forEach(({ mesh, metadata }) => {
      if (!mesh.isVisible) {
        return
      }

      const aggregate = new PhysicsAggregate(
        mesh,
        PhysicsShapeType.MESH,
        {
          ...metadata,
        },
        scene,
      )
    })
  }

  return {
    type,
    rootNode,
    startPosition,
    endPosition,
    initPhysics,
  }
}

/** 將 nextTrack 接在 prevTrack 的後面
 *
 * NextRoot = PrevRoot + PrevEnd - NextStart
 */
export function connectTracks(prevTrack: TrackSegment, nextTrack: TrackSegment) {
  nextTrack.rootNode.position
    .copyFrom(prevTrack.rootNode.position)
    .addInPlace(prevTrack.endPosition)
    .subtractInPlace(nextTrack.startPosition)
}
