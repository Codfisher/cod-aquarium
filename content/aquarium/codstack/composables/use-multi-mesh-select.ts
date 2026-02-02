import type {
  AbstractMesh,
  Camera,
  GizmoManager,
  Scene,
} from '@babylonjs/core'
import type { Ref } from 'vue'
import {
  Color3,
  HighlightLayer,
  Mesh,
  Quaternion,
  Vector3,
} from '@babylonjs/core'
import { whenever } from '@vueuse/core'
import { shallowRef, watch } from 'vue'

interface UseMultiMeshSelectOptions {
  gizmoManager: Ref<GizmoManager | undefined>;
  scene: Ref<Scene | undefined>;
  camera: Ref<Camera | undefined>;
}
export function useMultiMeshSelect({
  gizmoManager,
  scene,
  camera,
}: UseMultiMeshSelectOptions) {
  const selectedMeshes = shallowRef<AbstractMesh[]>([])

  let selectionGroup: Mesh | null = null
  let highlightLayer: HighlightLayer | null = null

  const highlightColor = new Color3(0, 1, 1)

  /** 初始化中介容器 */
  whenever(scene, (sceneValue) => {
    selectionGroup = new Mesh('selectionGroup', sceneValue)
    selectionGroup.isPickable = false
    selectionGroup.renderingGroupId = 1

    const boundingBoxRenderer = sceneValue.getBoundingBoxRenderer()
    boundingBoxRenderer.frontColor = highlightColor
    // 只顯示前排線條較乾淨
    boundingBoxRenderer.showBackLines = false

    highlightLayer = new HighlightLayer('hl', sceneValue, {
      isStroke: true,
      mainTextureRatio: 2,
      blurHorizontalSize: 1,
      blurVerticalSize: 1,
      camera: camera.value,
    })
    highlightLayer.innerGlow = false
  })

  /** 更新選取視覺效果 */
  function updateSelectionVisuals() {
    if (!highlightLayer)
      return

    highlightLayer.removeAllMeshes()

    selectedMeshes.value.forEach((mesh) => {
      if (mesh instanceof Mesh) {
        highlightLayer?.addMesh(mesh, highlightColor)
        mesh.getChildMeshes().forEach((child) => {
          if (child instanceof Mesh)
            highlightLayer?.addMesh(child, highlightColor)
        })
      }
    })
  }

  /** 取消群組：讓物體回到世界座標，並清空 Gizmo */
  function ungroup() {
    selectedMeshes.value.forEach((m) => m.setParent(null))
    gizmoManager.value?.attachToMesh(null)

    highlightLayer?.removeAllMeshes()
  }

  /** 群組化：計算中心點並將選中物體掛載至容器 */
  function group() {
    if (!selectionGroup || selectedMeshes.value.length === 0)
      return

    if (selectedMeshes.value.length === 1) {
      const target = selectedMeshes.value[0]!
      gizmoManager.value?.attachToMesh(target)
    }
    else {
      // 1. 計算所有選中物體的世界座標邊界
      let min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)
      let max = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE)

      selectedMeshes.value.forEach((m) => {
        // 取得包含子網格的所有頂點邊界
        const { min: mMin, max: mMax } = m.getHierarchyBoundingVectors(true)
        min = Vector3.Minimize(min, mMin)
        max = Vector3.Maximize(max, mMax)
      })

      // 2. 設定中心點與層級關係
      const center = Vector3.Center(min, max)
      selectionGroup.position.copyFrom(center)
      selectionGroup.rotationQuaternion = Quaternion.Identity()

      selectedMeshes.value.forEach((m) => m.setParent(selectionGroup))

      // 綁定 Gizmo
      gizmoManager.value?.attachToMesh(selectionGroup)
    }

    updateSelectionVisuals()
  }

  /** 以目前選元素重建選取，同時更新選取框 */
  function rebuildGroup() {
    if (selectedMeshes.value.length <= 1) return

    ungroup()
    group()
  }

  function selectMesh(mesh: AbstractMesh, isMultiMode: boolean) {
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
    selectMesh,
    clearSelection,
    ungroup,
    rebuildGroup,
  }
}
