import type { MeshMeta } from '../type'
import { type AbstractMesh, Matrix, Mesh, type Node, type PickingInfo, Quaternion, Vector3 } from '@babylonjs/core'

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

/**
 * 計算 Mesh 貼合表面的變換資訊，但不直接修改 Mesh
 */
export function getSurfaceSnapTransform(
  mesh: AbstractMesh,
  pickInfo: PickingInfo,
  options?: {
    /** 是否要計算對齊表面的旋轉 (若為 false 則只回傳修正後的預設旋轉)
     * @default false
     */
    alignToNormal?: boolean
  },
) {
  const alignToNormal = options?.alignToNormal ?? false

  if (!pickInfo.pickedPoint || !pickInfo.hit)
    return {}

  // 注意：getNormal(true) 會使用插值後的法線 (平滑)，若要硬邊請用 false
  const normal = pickInfo.getNormal(true)
  const point = pickInfo.pickedPoint

  if (!normal)
    return {}

  // --- 1. 計算旋轉 (Rotation) ---

  // gltf 會在 Y 軸多 180 度旋轉，需要修正
  const fixRotation = Quaternion.RotationAxis(Vector3.Up(), Math.PI)
  const targetRotation = new Quaternion()

  if (alignToNormal) {
    // 讓物體的上方 (Y) 對齊表面的法向量，並疊加 GLTF 修正
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), normal, targetRotation)
    targetRotation.multiplyInPlace(fixRotation)
  }
  else {
    // 不對齊地形時，保持直立 (Identity)，但仍需保留 GLTF 修正
    targetRotation.copyFrom(fixRotation)
  }

  // --- 2. 計算位置 (Position) ---

  // 取得 Local Space 的邊界框資訊
  // 這裡不需要 computeWorldMatrix，因為我們只需要 Local 的幾何邊界
  const boundingInfo = mesh.getBoundingInfo()
  const localMaximum = boundingInfo.maximum

  // 計算物體中心到邊緣的距離 (Local Y * Scaling Y)
  const distToCenter = localMaximum.y * mesh.scaling.y

  // 計算目標位置：撞擊點 + 沿著法線推出的距離
  const targetPosition = point.add(normal.scale(distToCenter))

  return {
    position: targetPosition,
    rotation: targetRotation,
  }
}

/** 清除所有 Mesh 的 PivotMatrix，統一由外部控制旋轉，避免旋轉偏移 */
export function clearPivotRecursive(root: AbstractMesh) {
  if (root instanceof Mesh) {
    root.setPivotMatrix(Matrix.Identity())
  }

  root.getChildMeshes(false).forEach((m) => {
    if (m instanceof Mesh) {
      m.setPivotMatrix(Matrix.Identity())
    }
  })
}