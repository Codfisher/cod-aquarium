import type {
  AbstractMesh,
  Camera,
  Scene,
} from '@babylonjs/core'
import type { ShallowRef } from 'vue'
import type { BabylonEngine } from './use-babylon-scene'
import {
  Matrix,
  PointerEventTypes,
  Vector3,
} from '@babylonjs/core'
import { whenever } from '@vueuse/core'
import { computed, reactive, ref } from 'vue'

interface UseBoxSelectionOptions {
  meshList: ShallowRef<AbstractMesh[]>;
  scene: ShallowRef<Scene | undefined>;
  camera: ShallowRef<Camera | undefined>;
  engine: ShallowRef<BabylonEngine | undefined>;
  canvas: ShallowRef<HTMLCanvasElement | undefined>;
  /** 決定何時開始圈選 */
  startCondition: (evt: PointerEvent) => boolean;
  onSelection?: (meshes: AbstractMesh[]) => void;
}
export function useBoxSelection({
  meshList,
  scene,
  camera,
  engine,
  canvas,
  startCondition,
  onSelection,
}: UseBoxSelectionOptions) {
  const isBoxSelecting = ref(false)
  const boxStart = reactive({ x: 0, y: 0 })
  const boxEnd = reactive({ x: 0, y: 0 })

  whenever(scene, (sceneValue) => {
    sceneValue.onPointerObservable.add((pointerInfo) => {
      const evt = pointerInfo.event as PointerEvent

      switch (pointerInfo.type) {
        // 按下時初始化狀態，暫停相機
        case PointerEventTypes.POINTERDOWN:
          if (startCondition(evt)) {
            isBoxSelecting.value = true
            boxStart.x = evt.offsetX
            boxStart.y = evt.offsetY
            boxEnd.x = evt.offsetX
            boxEnd.y = evt.offsetY

            // 暫時移除相機控制，避免視角旋轉
            camera.value?.detachControl()
          }
          break

        // 更新選取框
        case PointerEventTypes.POINTERMOVE:
          if (isBoxSelecting.value) {
            boxEnd.x = evt.offsetX
            boxEnd.y = evt.offsetY
          }
          break

        // 放開時執行運算，恢復相機
        case PointerEventTypes.POINTERUP:
          if (isBoxSelecting.value) {
            performBoxSelection()
            isBoxSelecting.value = false
            camera.value?.attachControl(canvas.value, true)
          }
          break
      }
    })
  })

  const selectionBoxStyle = computed(() => {
    const left = Math.min(boxStart.x, boxEnd.x)
    const top = Math.min(boxStart.y, boxEnd.y)
    const width = Math.abs(boxEnd.x - boxStart.x)
    const height = Math.abs(boxEnd.y - boxStart.y)
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    }
  })

  function performBoxSelection() {
    const sceneValue = scene.value
    const cameraValue = camera.value
    const engineValue = engine.value
    const canvasValue = canvas.value
    if (!sceneValue || !cameraValue || !engineValue || !canvasValue)
      return

    // CSS px -> render px 的縮放
    const rect = canvasValue.getBoundingClientRect()
    const scaleX = engineValue.getRenderWidth() / rect.width
    const scaleY = engineValue.getRenderHeight() / rect.height

    const minX = Math.min(boxStart.x, boxEnd.x) * scaleX
    const maxX = Math.max(boxStart.x, boxEnd.x) * scaleX
    const minY = Math.min(boxStart.y, boxEnd.y) * scaleY
    const maxY = Math.max(boxStart.y, boxEnd.y) * scaleY

    // 門檻也要一起放大
    if (Math.abs(maxX - minX) < 5 * scaleX && Math.abs(maxY - minY) < 5 * scaleY)
      return

    const transformMatrix = cameraValue.getTransformationMatrix()
    const globalViewport = cameraValue.viewport.toGlobal(
      engineValue.getRenderWidth(),
      engineValue.getRenderHeight(),
    )

    const meshesToSelect: AbstractMesh[] = []

    meshList.value.forEach((mesh) => {
      if (!mesh.isEnabled() || !mesh.isVisible)
        return

      // 確保 world/bounds 是最新的
      mesh.computeWorldMatrix(true)

      const { min, max } = mesh.getHierarchyBoundingVectors(true)

      const corners = [
        new Vector3(min.x, min.y, min.z),
        new Vector3(min.x, min.y, max.z),
        new Vector3(min.x, max.y, min.z),
        new Vector3(min.x, max.y, max.z),
        new Vector3(max.x, min.y, min.z),
        new Vector3(max.x, min.y, max.z),
        new Vector3(max.x, max.y, min.z),
        new Vector3(max.x, max.y, max.z),
      ]

      // 投影後使用 2D AABB 與圈選框做相交判斷
      let bbMinX = Infinity
      let bbMinY = Infinity
      let bbMaxX = -Infinity
      let bbMaxY = -Infinity
      let anyInFront = false

      for (const point of corners) {
        const projectedPoint = Vector3.Project(
          point,
          Matrix.Identity(),
          transformMatrix,
          globalViewport,
        )
        if (projectedPoint.z > 0 && projectedPoint.z < 1)
          anyInFront = true
        bbMinX = Math.min(bbMinX, projectedPoint.x)
        bbMaxX = Math.max(bbMaxX, projectedPoint.x)
        bbMinY = Math.min(bbMinY, projectedPoint.y)
        bbMaxY = Math.max(bbMaxY, projectedPoint.y)
      }

      if (!anyInFront)
        return

      const overlap = !(bbMaxX < minX || bbMinX > maxX || bbMaxY < minY || bbMinY > maxY)
      if (overlap)
        meshesToSelect.push(mesh)
    })

    onSelection?.(meshesToSelect)
  }

  return {
    isBoxSelecting,
    selectionBoxStyle,
  }
}
