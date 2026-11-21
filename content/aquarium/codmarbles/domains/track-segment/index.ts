import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core'
import type { TrackAsset, useAssetStore } from '../../stores/asset-store'
import type { TrackSegmentPartMetadata, TrackSegmentType } from './data'
import { LoadAssetContainerAsync, PBRMaterial, PhysicsAggregate, PhysicsShapeType, Quaternion, TransformNode, Vector3 } from '@babylonjs/core'
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

/** 每個模型只下載、解析一次，之後都從 AssetContainer 複製；快取存 Promise，同時載入同一個模型也只會請求一次 */
function loadContainer({ scene, assetStore, url }: {
  scene: Scene;
  assetStore: ReturnType<typeof useAssetStore>;
  url: string;
}) {
  let task = assetStore.assetCache.get(url)
  if (!task) {
    task = LoadAssetContainerAsync(url, scene).then((container): TrackAsset => ({
      container,
      /** 原本的 ImportMeshAsync 以 meshes[1] 作為零件的主網格（掛物理、調材質），
       * 這裡記下它在 rootNodes[0] 階層中的位置，複製體的階層與來源相同，之後用同一個位置取得對應的複製體
       */
      geometryMeshIndex: container.rootNodes[0]?.getChildMeshes().indexOf(container.meshes[1]!) ?? -1,
    }))
    assetStore.assetCache.set(url, task)
  }
  return task
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

    const { container, geometryMeshIndex } = await loadContainer({ scene, assetStore, url: `/assets/${fullPath}` })
    const entries = container.instantiateModelsToScene(
      (sourceName) => sourceName,
      false,
      { doNotInstantiate: true },
    )
    const root = entries.rootNodes[0] as Mesh | undefined
    /** getChildMeshes() 的順序不等於載入順序（多網格模型如 lever_floor 會互換），不能直接取第一顆 */
    const geometryMesh = root?.getChildMeshes()[geometryMeshIndex] as Mesh | undefined

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
