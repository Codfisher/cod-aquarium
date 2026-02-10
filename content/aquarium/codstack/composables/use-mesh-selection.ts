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
import { shallowRef } from 'vue'

interface UseMultiMeshSelectOptions {
  gizmoManager: Ref<GizmoManager | undefined>;
  scene: Ref<Scene | undefined>;
  camera: Ref<Camera | undefined>;
}
export function useMeshSelection({
  gizmoManager,
  scene,
  camera,
}: UseMultiMeshSelectOptions) {
  const selectedMeshes = shallowRef<AbstractMesh[]>([])

  let selectionProxy: Mesh | null = null
  let highlightLayer: HighlightLayer | null = null

  const firstHighlightColor = new Color3(1, 1, 0)
  const highlightColor = new Color3(0, 1, 1)

  /** 初始化中介容器 */
  whenever(scene, (sceneValue) => {
    selectionProxy = new Mesh('selectionGroup', sceneValue)
    selectionProxy.isPickable = false
    selectionProxy.renderingGroupId = 1

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

    selectedMeshes.value.forEach((mesh, i) => {
      if (!(mesh instanceof Mesh))
        return

      const color = i === 0 ? firstHighlightColor : highlightColor
      highlightLayer?.addMesh(mesh, color)
      mesh.getChildMeshes().forEach((child) => {
        if (child instanceof Mesh)
          highlightLayer?.addMesh(child, color)
      })
    })
  }

  /** 解除 Proxy 綁定，讓物體回到世界座標，同時清空 Gizmo */
  function detachFromProxy() {
    selectedMeshes.value.forEach((m) => m.setParent(null))
    gizmoManager.value?.attachToMesh(null)

    highlightLayer?.removeAllMeshes()
  }

  /** 計算中心點並將選中物體掛載至 Proxy */
  function attachToProxy() {
    if (!selectionProxy || selectedMeshes.value.length === 0)
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
      selectionProxy.position.copyFrom(center)
      selectionProxy.rotationQuaternion = Quaternion.Identity()

      selectedMeshes.value.forEach((m) => m.setParent(selectionProxy))

      // 綁定 Gizmo
      gizmoManager.value?.attachToMesh(selectionProxy)
    }

    updateSelectionVisuals()
  }

  /** 以目前選元素重建選取，同時更新選取框 */
  function refreshProxy() {
    if (selectedMeshes.value.length <= 1)
      return

    detachFromProxy()
    attachToProxy()
  }

  function selectMesh(mesh: AbstractMesh, isMultiMode: boolean) {
    // 先還原，確保座標計算從原始世界座標開始
    detachFromProxy()

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

    attachToProxy()
  }

  function clearSelection() {
    detachFromProxy()
    selectedMeshes.value = []
  }

  return {
    selectedMeshes,
    selectMesh,
    /** 清除所有選取 */
    clearSelection,
    /** 解除 Proxy 綁定，讓物體回到世界座標，同時清空 Gizmo */
    detachFromProxy,
    /** 以目前選元素重建選取，同時更新選取框 */
    refreshProxy,
  }
}
