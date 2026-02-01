import type { MeshMeta } from '../type'
import { type AbstractMesh, type Node, type PickingInfo, Quaternion, Vector3 } from '@babylonjs/core'

export function findTopLevelMesh(mesh: AbstractMesh, list: AbstractMesh[]): AbstractMesh | undefined {
  let current: Node | null = mesh
  while (current) {
    if (list.includes(current as AbstractMesh)) {
      return current as AbstractMesh
    }
    current = current.parent
  }
  return undefined
}

export function getMeshMeta<Meta = MeshMeta>(mesh: AbstractMesh) {
  return mesh.metadata as Meta | undefined
}

/** 將物體吸附在表面上 */
export function snapMeshToSurface(
  mesh: AbstractMesh,
  pickInfo: PickingInfo,
  options?: {
    /** 是否要更新 mesh 的旋轉
     * @default false
     */
    updateRotation?: boolean;
  },
) {
  const updateRotation = options?.updateRotation ?? false

  if (!pickInfo.pickedPoint)
    return

  const normal = pickInfo.getNormal(true)
  const point = pickInfo.pickedPoint

  if (!normal)
    return

  if (updateRotation) {
    // 讓物體的上方 (Y) 對齊表面的法向量
    const rotationQuaternion = new Quaternion()
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), normal, rotationQuaternion)
    mesh.rotationQuaternion = rotationQuaternion
  }
  else {
    mesh.rotationQuaternion = Quaternion.Identity()
  }

  // 強制更新矩陣
  mesh.computeWorldMatrix(true)

  // 取得 Local Space 的邊界框上限 (假設 Pivot 在中心，這代表從中心到頂部的距離)
  const localMaximum = mesh.getBoundingInfo().maximum

  // 計算物體中心到邊緣的距離 (Local Y * Scaling Y)
  // 修正點：這裡變數名稱改為 distToCenter
  const distToCenter = localMaximum.y * mesh.scaling.y

  // 計算目標位置：撞擊點 + 沿著法線推出的距離
  return point.add(normal.scale(distToCenter))
}
