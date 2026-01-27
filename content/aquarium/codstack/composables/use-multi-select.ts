import type { Ref } from 'vue'
import { type AbstractMesh, BoundingInfo, Color3, type GizmoManager, Mesh, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { ref, shallowRef } from 'vue'

export function useMultiSelect(gizmoManager: Ref<GizmoManager | undefined>) {
  const selectedMeshes = shallowRef<AbstractMesh[]>([])
  let selectionGroup: Mesh | null = null

  /** 初始化中介容器 */
  function initSelectionGroup(scene: Scene) {
    selectionGroup = new Mesh('selectionGroup', scene)
    selectionGroup.isPickable = false

    const boundingBoxRenderer = scene.getBoundingBoxRenderer()
    boundingBoxRenderer.frontColor = new Color3(0, 0.5, 1)
    // 只顯示前排線條較乾淨
    boundingBoxRenderer.showBackLines = false
  }

  /** 取消群組：讓物體回到世界座標，並清空 Gizmo */
  function ungroup() {
    selectedMeshes.value.forEach(m => m.setParent(null))
    if (selectionGroup) {
      selectionGroup.showBoundingBox = false
      // 重設包圍盒避免殘留
      selectionGroup.setBoundingInfo(new BoundingInfo(Vector3.Zero(), Vector3.Zero()))
    }
    gizmoManager.value?.attachToMesh(null)
  }


  /** 群組化：計算中心點並將選中物體掛載至容器 */
  function group() {
    if (!selectionGroup || selectedMeshes.value.length === 0) return

    if (selectedMeshes.value.length === 1) {
      const target = selectedMeshes.value[0]!
      gizmoManager.value?.attachToMesh(target)
      return
    }

    // 1. 計算所有選中物體的世界座標邊界
    let min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)
    let max = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE)

    selectedMeshes.value.forEach(m => {
      // 取得包含子網格的所有頂點邊界
      const { min: mMin, max: mMax } = m.getHierarchyBoundingVectors(true)
      min = Vector3.Minimize(min, mMin)
      max = Vector3.Maximize(max, mMax)
    })

    // 2. 設定中心點與層級關係
    const center = Vector3.Center(min, max)
    selectionGroup.position.copyFrom(center)
    selectionGroup.rotationQuaternion = Quaternion.Identity()

    selectedMeshes.value.forEach(m => m.setParent(selectionGroup))

    // 3. 更新 Mesh 的包圍盒資訊（關鍵步奏）
    // 我們需要將世界座標的 min/max 轉為相對於 selectionGroup 中心點的本地座標
    const localMin = min.subtract(selectionGroup.position)
    const localMax = max.subtract(selectionGroup.position)
    console.log(`🚀 ~ localMin:`, localMin);
    console.log(`🚀 ~ localMax:`, localMax);

    selectionGroup.setBoundingInfo(new BoundingInfo(localMin, localMax))
    selectionGroup.showBoundingBox = true

    // 4. 綁定 Gizmo
    gizmoManager.value?.attachToMesh(selectionGroup)
  }

  function handleSelect(mesh: AbstractMesh, isMultiMode: boolean) {
    // 先還原，確保座標計算從原始世界座標開始
    ungroup()

    if (isMultiMode) {
      const index = selectedMeshes.value.indexOf(mesh)
      if (index > -1) {
        // 已選中的話就剔除
        selectedMeshes.value = selectedMeshes.value.filter((m) => m !== mesh)
      }
      else {
        selectedMeshes.value = [...selectedMeshes.value, mesh]
      }
    }
    else {
      // 單選模式
      selectedMeshes.value = [mesh]
    }

    group()
  }

  function clearSelection() {
    ungroup()
    selectedMeshes.value = []
  }

  return {
    selectedMeshes,
    initSelectionGroup,
    handleSelect,
    clearSelection,
    ungroup,
  }
}
