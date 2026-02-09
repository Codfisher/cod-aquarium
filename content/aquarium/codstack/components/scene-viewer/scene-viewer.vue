<template>
  <div class=" relative">
    <context-menu
      :preview-mesh="previewMesh"
      :selected-meshes="selectedMeshes"
      :added-mesh-list="addedMeshList"
      :can-redo="canRedo"
      :can-undo="canUndo"
      :meta="getMeshMeta(selectedMeshes[0])"
      :commands="commands"
    >
      <canvas
        v-once
        ref="canvasRef"
        note="沒有 v-once 會導致 contextMenuItems 一更新就破壞 canvas ref 指向，導致 DOM 相關 API 失效"
        class="w-full h-full outline-none"
      />
    </context-menu>

    <slot :added-mesh-list />
  </div>
</template>

<script setup lang="ts">
import type { AbstractMesh, GizmoManager, Scene } from '@babylonjs/core'
import type { JSAnimation } from 'animejs'
import type { MeshMeta, ModelFile, SceneData } from '../../type'
import { ArcRotateCamera, Color3, ImportMeshAsync, Mesh, PointerEventTypes, Quaternion, Scalar, StandardMaterial, Vector3 } from '@babylonjs/core'
import { onKeyStroke, refManualReset, useActiveElement, useMagicKeys, useThrottledRefHistory, whenever } from '@vueuse/core'
import { animate } from 'animejs'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import { clone, conditional, isStrictEqual, isTruthy, pipe, tap } from 'remeda'
import { computed, onBeforeUnmount, reactive, shallowRef, watch } from 'vue'
import { nextFrame } from '../../../../../web/common/utils'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useMultiMeshSelect } from '../../composables/use-multi-mesh-select'
import { useSceneStore } from '../../domains/scene/scene-store'
import { useMainStore } from '../../stores/main-store'
import { clearPivotRecursive, findTopLevelMesh, getMeshMeta, getSurfaceSnapTransform } from '../../utils/babylon'
import { getFileFromPath } from '../../utils/fs'
import { roundToStep } from '../../utils/math'
import ContextMenu from './context-menu.vue'

import { createGizmoManager, createGround, createScreenAxes, createSideCamera, createTopCamera } from './creator'
import '@babylonjs/loaders'

const props = defineProps<{
  selectedModelFile?: ModelFile;
  importedSceneData?: SceneData;
}>()

const emit = defineEmits<{
  cancelPreview: [];
  useAsPreview: [path: string];
}>()

defineSlots<{
  default: (props: { addedMeshList: AbstractMesh[] }) => any;
}>()

const mainStore = useMainStore()
const sceneStore = useSceneStore()
const { settings: sceneSettings } = storeToRefs(sceneStore)

const {
  shift: shiftKey,
  alt: altKey,
  g: gKey,
  s: sKey,
  r: rKey,
  a_x: aXKey,
  a_y: aYKey,
  a_z: aZKey,
} = useMagicKeys()

/** 目前預覽的模型 */
const previewMesh = shallowRef<AbstractMesh>()
/** 預覽偏移量 */
const previewOffset = refManualReset(() => reactive({
  vertical: 0,
  /** rad */
  yRotation: 0,
}))
watch(previewMesh, () => previewOffset.reset())

/** 已新增的模型 */
const addedMeshList = shallowRef<AbstractMesh[]>([])

watch(() => mainStore.rootFsHandle, () => {
  addedMeshList.value.forEach((mesh) => {
    mesh.dispose()
  })
  addedMeshList.value = []
})
// 處理匯入場景資料
watch(() => props.importedSceneData, async (sceneData) => {
  const sceneValue = scene.value
  const rootFsHandle = mainStore.rootFsHandle
  if (!sceneData || !rootFsHandle || !sceneValue) {
    return
  }
  addedMeshList.value.forEach((mesh) => {
    mesh.dispose()
  })
  addedMeshList.value = []
  clearHistory()

  const tasks = sceneData.partList.map(async (part) => {
    const file = await getFileFromPath(rootFsHandle, part.path)
    if (!file) {
      return
    }
    const model = await loadModel(rootFsHandle, part.path, file, sceneValue)

    // preview clone 時有先 bake 一次，所以這裡也要，否則座標系基礎會不同
    if (model instanceof Mesh) {
      model.setParent(null)
      model.position.setAll(0)
      model.rotation.setAll(0)
      model.rotationQuaternion = null

      model.bakeCurrentTransformIntoVertices()

      model.position = Vector3.FromArray(part.position)
      model.scaling = Vector3.FromArray(part.scaling)

      // 不知道為什麼，直接用 rotationQuaternion 會導致 gizmoManager 無法旋轉，改成 Euler 就行
      const savedQuaternion = Quaternion
        .FromArray(part.rotationQuaternion)
        // 補償匯出時 Y 軸 180 度旋轉
        .multiplyInPlace(new Quaternion(0, 1, 0, 0))
      model.rotation = savedQuaternion.toEulerAngles()
      model.rotationQuaternion = null

      model.refreshBoundingInfo()
    }
    model.metadata = {
      path: part.path,
      name: part.metadata?.name ?? '',
      fileName: file.name,
      mass: part.metadata?.mass ?? sceneSettings.value.metadata.mass.defaultValue,
      restitution: part.metadata?.restitution ?? sceneSettings.value.metadata.restitution.defaultValue,
      friction: part.metadata?.friction ?? sceneSettings.value.metadata.friction.defaultValue,
    } as MeshMeta

    addedMeshList.value.push(model)
  })

  await Promise.all(tasks)

  commitHistory()
})

interface MeshState {
  id: number;
  enabled: boolean;
  position: [number, number, number];
  scale: [number, number, number];
  rotationQuaternion?: [number, number, number, number];
}

/** History 只存關鍵資料，不存 Mesh 物件，否則記憶體會花式噴發  乁( ◔ ௰◔)「
 */
const {
  canRedo,
  canUndo,
  undo,
  redo,
  commit: commitHistory,
  clear: clearHistory,
} = useThrottledRefHistory(
  addedMeshList,
  {
    capacity: 10,
    throttle: 500,
    // 只存關鍵資料，不存 Mesh 物件
    // @ts-expect-error 強制轉換資料
    clone: (meshes): MeshState[] => {
      return meshes.map((mesh) => ({
        id: mesh.uniqueId,
        enabled: mesh.isEnabled(),
        position: mesh.position.asArray(),
        scale: mesh.scaling.asArray(),
        rotationQuaternion: mesh.rotationQuaternion?.asArray(),
      }))
    },

    parse: (serializedData: MeshState[]) => {
      const temp = [
        ...selectedMeshes.value,
      ]
      // 先移除選取再復原，否則每個物件自己的 transform 會被父群組的 transform 干擾
      clearSelection()
      // 推延後再復原選取
      nextFrame().then(() => {
        temp.forEach((mesh) => {
          if (mesh.isEnabled()) {
            selectMesh(mesh, true)
          }
        })
      })

      // 檢查 mesh 是否還存在
      addedMeshList.value.forEach((mesh) => {
        const data = serializedData.find((data) => data.id === mesh.uniqueId)
        mesh.setEnabled(!!data?.enabled)
      })

      const result = serializedData
        .map((data) => {
          const mesh = scene.value?.getMeshByUniqueId(data.id)

          if (mesh) {
            mesh.setEnabled(data.enabled)
            mesh.position = Vector3.FromArray(data.position)
            mesh.scaling = Vector3.FromArray(data.scale)
            if (data.rotationQuaternion) {
              mesh.rotationQuaternion = Quaternion.FromArray(data.rotationQuaternion)
            }

            return mesh
          }

          return null
        })
        .filter(isTruthy)

      return result
    },
  },
)

/** 旋轉縮放的工具 */
const gizmoManager = shallowRef<GizmoManager>()
watch(() => shiftKey?.value, (shiftKeyValue) => {
  const gizmos = gizmoManager.value?.gizmos
  if (gizmos?.positionGizmo && gizmos?.scaleGizmo) {
    const snapValue = shiftKeyValue ? 0.1 : 0
    gizmos.scaleGizmo.snapDistance = snapValue
    gizmos.positionGizmo.snapDistance = snapValue
  }
  if (gizmos?.rotationGizmo) {
    const snapValue = shiftKeyValue ? Math.PI / 180 * 15 : 0
    gizmos.rotationGizmo.snapDistance = snapValue
  }
}, { deep: true })

watch(() => [gKey?.value, sKey?.value, rKey?.value], ([g, s, r]) => {
  const gizmoManagerValue = gizmoManager.value
  if (!gizmoManagerValue || (!g && !s && !r)) {
    return
  }

  gizmoManagerValue.positionGizmoEnabled = false
  gizmoManagerValue.rotationGizmoEnabled = false
  gizmoManagerValue.scaleGizmoEnabled = false

  gizmoManagerValue.positionGizmoEnabled = !!g
  gizmoManagerValue.rotationGizmoEnabled = !!r
  gizmoManagerValue.scaleGizmoEnabled = !!s
}, { deep: true })

/** 預覽時的網格吸附單位 */
const previewSnapUnit = computed(() => shiftKey?.value ? 0.1 : 0.5)

/** 滑鼠射線之目標位置 */
const previewMoveTarget = {
  position: new Vector3(0, 0, 0),
  rotation: new Quaternion(),
}

const { canvasRef, scene, camera } = useBabylonScene({
  async init(params) {
    const { scene, camera, engine } = params

    // 調整鏡頭
    scene.activeCameras = [camera]
    scene.cameraToUseForPointers = camera
    if (camera instanceof ArcRotateCamera) {
      createScreenAxes({ scene, mainCamera: camera })
    }

    /** x-ray 專用材質 */
    const xRayMaterial = new StandardMaterial('xRayMat', scene)
    xRayMaterial.diffuseColor = new Color3(0.8, 0.8, 0.8)
    xRayMaterial.alpha = 0.4
    xRayMaterial.disableDepthWrite = true

    // sideCamera
    pipe(
      createSideCamera({ scene, camera, engine }),
      tap((sideCam) => {
        /** 儲存原本材質 */
        const materialMap = new Map<number, any>()

        // 加入 x-ray 效果，將 material 臨時替換成 xRayMaterial 即可
        scene.onBeforeCameraRenderObservable.add((cam) => {
          if (cam !== sideCam)
            return

          if (selectedMeshes.value.length === 0) {
            return
          }

          // 紀錄被選取的 Mesh 及其所有子物件
          const safeList = new Set<number>()
          selectedMeshes.value.forEach((mesh) => {
            safeList.add(mesh.uniqueId)
            mesh.getChildMeshes(false).forEach((child) => safeList.add(child.uniqueId))
          })

          addedMeshList.value.forEach((mesh) => {
            mesh.getChildMeshes().forEach((childMesh) => {
              if (!safeList.has(childMesh.uniqueId) && childMesh !== ground) {
                materialMap.set(childMesh.uniqueId, childMesh.material)
                childMesh.material = xRayMaterial
              }
            })
          })
        })
        scene.onAfterCameraRenderObservable.add((cam) => {
          if (cam !== sideCam)
            return

          // 還原所有被改動過的 Mesh 材質
          materialMap.forEach((originalMaterial, meshUniqueId) => {
            const mesh = scene.getMeshByUniqueId(meshUniqueId)
            if (mesh) {
              mesh.material = originalMaterial
            }
          })
          materialMap.clear()
        })

        // 選取物體時，自動調整相機位置
        scene.onBeforeRenderObservable.add(() => {
          const [firstSelectedMesh] = selectedMeshes.value
          if (firstSelectedMesh) {
            /** 整個群組的邊界 */
            const { min, max } = firstSelectedMesh.getHierarchyBoundingVectors(true)
            /** 整個群組的中心點 */
            const worldCenter = min.add(max).scale(0.5)
            /** 整個群組的半徑 */
            const worldRadius = Vector3.Distance(worldCenter, max)

            // 看向中心點
            sideCam.target = Vector3.Lerp(sideCam.target, worldCenter, 0.1)

            const offset = new Vector3(10, 0, 0)
            sideCam.position = Vector3.Lerp(sideCam.position, worldCenter.add(offset), 0.1)

            // 鎖定相機角度
            sideCam.alpha = 0
            sideCam.beta = Math.PI / 2

            // 平滑過渡數值
            const currentOrthoSize = Scalar.Lerp(sideCam.orthoTop!, worldRadius, 0.1)

            /** 畫面長寬比 */
            const aspect = engine.getRenderWidth() / engine.getRenderHeight()

            sideCam.orthoTop = currentOrthoSize
            sideCam.orthoBottom = -currentOrthoSize
            sideCam.orthoLeft = -currentOrthoSize * aspect
            sideCam.orthoRight = currentOrthoSize * aspect
          }
        })
      }),
    )
    // topCamera
    pipe(
      createTopCamera({ scene, camera, engine }),
      tap((topCam) => {
        /** 儲存原本材質 */
        const materialMap = new Map<number, any>()

        // 加入 x-ray 效果，將 material 臨時替換成 xRayMaterial 即可
        scene.onBeforeCameraRenderObservable.add((cam) => {
          if (cam !== topCam)
            return

          if (selectedMeshes.value.length === 0) {
            return
          }

          // 紀錄被選取的 Mesh 及其所有子物件
          const safeList = new Set<number>()
          selectedMeshes.value.forEach((mesh) => {
            safeList.add(mesh.uniqueId)
            mesh.getChildMeshes(false).forEach((child) => safeList.add(child.uniqueId))
          })

          addedMeshList.value.forEach((mesh) => {
            mesh.getChildMeshes().forEach((childMesh) => {
              if (!safeList.has(childMesh.uniqueId) && childMesh !== ground) {
                materialMap.set(childMesh.uniqueId, childMesh.material)
                childMesh.material = xRayMaterial
              }
            })
          })
        })
        scene.onAfterCameraRenderObservable.add((cam) => {
          if (cam !== topCam)
            return

          // 還原所有被改動過的 Mesh 材質
          materialMap.forEach((originalMaterial, meshUniqueId) => {
            const mesh = scene.getMeshByUniqueId(meshUniqueId)
            if (mesh) {
              mesh.material = originalMaterial
            }
          })
          materialMap.clear()
        })

        // 選取物體時，自動調整相機位置
        scene.onBeforeRenderObservable.add(() => {
          const [firstSelectedMesh] = selectedMeshes.value
          if (firstSelectedMesh) {
            /** 整個群組的邊界 */
            const { min, max } = firstSelectedMesh.getHierarchyBoundingVectors(true)
            /** 整個群組的中心點 */
            const worldCenter = min.add(max).scale(0.5)
            /** 整個群組的半徑 */
            const worldRadius = Vector3.Distance(worldCenter, max)

            // 看向中心點
            topCam.target = Vector3.Lerp(topCam.target, worldCenter, 0.1)

            const offset = new Vector3(0, 10, 0)
            topCam.position = Vector3.Lerp(topCam.position, worldCenter.add(offset), 0.1)

            // 鎖定相機角度
            topCam.alpha = Math.PI / 2
            topCam.beta = 0.0001

            // 平滑過渡數值
            const currentOrthoSize = Scalar.Lerp(topCam.orthoTop!, worldRadius, 0.1)

            /** 畫面長寬比 */
            const aspect = engine.getRenderWidth() / engine.getRenderHeight()

            topCam.orthoTop = currentOrthoSize
            topCam.orthoBottom = -currentOrthoSize
            topCam.orthoLeft = -currentOrthoSize * aspect
            topCam.orthoRight = currentOrthoSize * aspect
          }
        })
      }),
    )

    gizmoManager.value = pipe(
      createGizmoManager({ scene, camera }),
      tap((gizmoManager) => {
        gizmoManager.attachableMeshes = addedMeshList.value

        const { gizmos } = gizmoManager

        gizmos.positionGizmo?.onDragEndObservable.add(() => {
          commitHistory()
        })
        gizmos.rotationGizmo?.onDragEndObservable.add(() => {
          commitHistory()
        })
        gizmos.scaleGizmo?.onDragEndObservable.add(() => {
          commitHistory()
        })
      }),
    )

    const ground = createGround({ scene })

    scene.onPointerObservable.add((pointerInfo) => {
      // 滑鼠移動
      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        if (!previewMesh.value || !ground)
          return

        // 針對地面、已放置 mesh 進行射線檢測
        const pickInfo = scene.pick(
          scene.pointerX,
          scene.pointerY,
          (mesh) => {
            if (!mesh.isEnabled() || mesh === previewMesh.value) {
              return false
            }

            if (mesh === ground)
              return true

            const currentMesh = findTopLevelMesh(mesh, addedMeshList.value)
            return !!currentMesh
          },
          false,
          camera,
        )

        if (pickInfo.hit && pickInfo.pickedPoint) {
          const alignToNormal = altKey?.value || sceneSettings.value.enablePreviewRotation
          const { position, rotation } = getSurfaceSnapTransform(previewMesh.value, pickInfo, {
            alignToNormal,
          })

          if (position) {
            if (pickInfo.pickedMesh === ground) {
              position.x = roundToStep(position.x, previewSnapUnit.value)
              position.z = roundToStep(position.z, previewSnapUnit.value)
              position.y = sceneStore.settings.previewGroundYOffset
            }
            previewMoveTarget.position.copyFrom(position)
          }
          if (rotation) {
            previewMoveTarget.rotation.copyFrom(rotation)
          }
        }
      }

      // 點擊事件
      if (pointerInfo.type === PointerEventTypes.POINTERTAP) {
        // 忽略右鍵
        if (pointerInfo.event.button === 2)
          return

        const pickedMesh = pointerInfo.pickInfo?.pickedMesh

        // 放置預覽模型
        if (previewMesh.value) {
          const clonedMesh = previewMesh.value.clone(nanoid(), null, false)
          if (clonedMesh instanceof Mesh) {
            // 確保 Mesh 有父物件的話，先解除父子關係，把變形保留在 World Space
            // (這樣可以避免解除 Parent 時物件亂飛)
            clonedMesh.setParent(null)

            const finalPosition = clonedMesh.position.clone()
            const finalRotationQuaternion = clonedMesh.rotationQuaternion
              ? clonedMesh.rotationQuaternion.clone()
              : Quaternion.FromEulerAngles(clonedMesh.rotation.x, clonedMesh.rotation.y, clonedMesh.rotation.z)

            /** 暫時將物件移回世界原點、重置旋轉
             *
             * 這樣做是因為 bakeCurrentTransformIntoVertices 會把「當前位置」吃進頂點，如果我們在這裡不歸零，頂點會被移走，而 Pivot 會留在 (0,0,0)
             *
             * 看起來就是放下去的瞬間，模型會突然跳到更遠離原點的地方
             */
            clonedMesh.position.setAll(0)
            clonedMesh.rotationQuaternion = Quaternion.Identity()

            /**
             * 將目前的旋轉與縮放「烘焙」進頂點數據 (Vertices)
             * 因為 gltf 會先 Y 軸翻轉，以匹配 babylonjs 座標系，沒有這麼做會導致 undo 到最後一步時，模型會翻轉
             *
             * 這樣做之後：
             * mesh.rotation 會變成 (0,0,0)
             * mesh.rotationQuaternion 會變成 (0,0,0,1) [Identity]
             * mesh.scaling 會變成 (1,1,1)
             */
            clonedMesh.bakeCurrentTransformIntoVertices()
            clearPivotRecursive(clonedMesh)

            // 恢復位置與旋轉，以免自定義旋轉和位移都被 bake 吃掉，最後輸出都是 0
            clonedMesh.position.copyFrom(finalPosition)
            clonedMesh.rotationQuaternion = finalRotationQuaternion

            clonedMesh.isPickable = true
            clonedMesh.getChildMeshes().forEach((mesh) => mesh.isPickable = true)
            clonedMesh.refreshBoundingInfo()

            addedMeshList.value.push(clonedMesh)
            selectMesh(clonedMesh, false)

            commitHistory()
          }
          return
        }

        // 無須預覽 model，點到地面則取消選取
        if (pickedMesh === ground) {
          clearSelection()
          return
        }

        // 選取 Mesh
        if (pickedMesh) {
          const topLevelMesh = findTopLevelMesh(pickedMesh, addedMeshList.value)
          if (!topLevelMesh)
            return
          selectMesh(topLevelMesh, !!shiftKey?.value)
        }
      }
    })

    // 持續更新 previewMesh 的位置
    scene.onBeforeRenderObservable.add(() => {
      const mesh = previewMesh.value
      if (!mesh) {
        return
      }

      const dt = scene.getEngine().getDeltaTime() / 1000
      // 不同 FPS 也會保持一致手感
      const t = 1 - Math.exp(-16 * dt)

      // 先計算目標旋轉 (Target Rotation)
      // 不依賴 mesh 當前的狀態，而是直接對「表面對齊旋轉」疊加一個「Local Y 旋轉」
      // Vector3.Up() 即 (0, 1, 0)，乘在右邊代表以 Local 軸旋轉
      let targetRotation = previewMoveTarget.rotation

      if (mesh.rotationQuaternion) {
        const manualRotation = Quaternion.RotationAxis(
          Vector3.Up(),
          previewOffset.value.yRotation,
        )
        // Base * Offset = Apply Offset in Base's Local Space
        targetRotation = previewMoveTarget.rotation.multiply(manualRotation)

        Quaternion.SlerpToRef(
          mesh.rotationQuaternion,
          targetRotation,
          t,
          mesh.rotationQuaternion,
        )
      }

      // 計算穩定的向上位移方向
      // 位移方向應該基於「最終目標的朝向」，而不是「Mesh 正在轉動中的朝向」
      // 這樣位置才不會隨著旋轉過程亂飄
      const targetUpDirection = Vector3.Up().applyRotationQuaternion(targetRotation)

      const upOffset = previewOffset.value.vertical + sceneSettings.value.previewGroundYOffset
      const offsetVector = targetUpDirection.scale(upOffset)

      // 更新位置
      // 目標位置 = 射線擊中點 + 根據目標旋轉算出的垂直偏移
      const targetX = previewMoveTarget.position.x + offsetVector.x
      const targetY = previewMoveTarget.position.y + offsetVector.y
      const targetZ = previewMoveTarget.position.z + offsetVector.z

      mesh.position.x += (targetX - mesh.position.x) * t
      mesh.position.y += (targetY - mesh.position.y) * t
      mesh.position.z += (targetZ - mesh.position.z) * t
    })
  },
})

const activeElement = useActiveElement()
const isInput = computed(() => {
  const el = activeElement.value
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable
})

const {
  selectedMeshes,
  selectMesh: _selectMesh,
  rebuildGroup,
  clearSelection,
  ungroup,
} = useMultiMeshSelect({ gizmoManager, scene, camera })

/** 選取 Mesh 時，關閉所有 Gizmo 小工具，需使用快捷鍵開啟
 *
 * 二次封裝 useMultiMeshSelect 提供的 selectMesh，
 */
function selectMesh(mesh: AbstractMesh, isMulti: boolean) {
  if (gizmoManager.value) {
    gizmoManager.value.positionGizmoEnabled = false
    gizmoManager.value.rotationGizmoEnabled = false
    gizmoManager.value.scaleGizmoEnabled = false
  }
  _selectMesh(mesh, isMulti)
}
function selectAll() {
  clearSelection()
  addedMeshList.value.forEach((mesh) => {
    if (mesh.isEnabled()) {
      selectMesh(mesh, true)
    }
  })
}
function deleteSelectedMeshes() {
  if (isInput.value)
    return

  if (selectedMeshes.value.length > 0) {
    ungroup()

    selectedMeshes.value.forEach((mesh) => {
      mesh.setEnabled(false)
    })
    commitHistory()
    clearSelection()
  }
}
function duplicateMeshes(meshes: AbstractMesh[]) {
  clearSelection()

  let maxWidth = 0
  const clonedMeshes = meshes.map((mesh) => {
    const clonedMesh = mesh.clone(nanoid(), null)!
    clonedMesh.metadata = clone(mesh.metadata)

    addedMeshList.value.push(clonedMesh)
    selectMesh(clonedMesh, true)

    const { width } = pipe(
      mesh.getHierarchyBoundingVectors(),
      ({ max, min }) => ({
        width: max.x - min.x,
        height: max.y - min.y,
      }),
    )

    maxWidth = Math.max(maxWidth, width)
    return clonedMesh
  })

  clonedMeshes.forEach((clonedMesh) => {
    clonedMesh.position.x += maxWidth
  })

  commitHistory()
}
/** 將選取的 Mesh 沿著指定軸對齊 */
function alignMeshesToAxis(
  meshList: AbstractMesh[],
  baseMesh: AbstractMesh,
  alongAxis: 'x' | 'y' | 'z',
) {
  const targetPosition = baseMesh.position

  meshList.forEach((mesh, i) => {
    if (mesh === baseMesh)
      return Promise.resolve()

    const params = conditional(
      alongAxis,
      [isStrictEqual('x'), () => ({ y: targetPosition.y, z: targetPosition.z, x: mesh.position.x })],
      [isStrictEqual('y'), () => ({ x: targetPosition.x, z: targetPosition.z, y: mesh.position.y })],
      [isStrictEqual('z'), () => ({ x: targetPosition.x, y: targetPosition.y, z: mesh.position.z })],
    )

    mesh.position.set(params.x, params.y, params.z)
  })

  commitHistory()
  rebuildGroup()
}
/** 沿著包圍邊緣對齊 */
function alignMeshesToBoundingEdge(
  meshList: AbstractMesh[],
  alongAxis: 'x' | 'y' | 'z',
  /** 正負方向：max=對齊到最大值那側；min=對齊到最小值那側 */
  direction: 'max' | 'min',
) {
  if (!meshList.length)
    return

  const getEdgeValue = (mesh: AbstractMesh) => {
    // 確保 bounding box 是最新的 world 資訊
    mesh.computeWorldMatrix(true)
    const bb = mesh.getBoundingInfo().boundingBox
    const minW = bb.minimumWorld
    const maxW = bb.maximumWorld
    return direction === 'max' ? (maxW as any)[alongAxis] : (minW as any)[alongAxis]
  }

  const init = direction === 'max' ? -Infinity : Infinity

  // 找出群組極值（最大或最小那條平面）
  const targetEdgeValue = meshList.reduce((acc, mesh) => {
    const v = getEdgeValue(mesh)
    return direction === 'max' ? Math.max(acc, v) : Math.min(acc, v)
  }, init)

  // 把每個 mesh 的對應邊緣推到 target
  for (const mesh of meshList) {
    const edge = getEdgeValue(mesh)
    const delta = targetEdgeValue - edge
    if (delta === 0)
      continue

    const absPos = mesh.getAbsolutePosition().clone()
      ; (absPos as any)[alongAxis] += delta
    mesh.setAbsolutePosition(absPos)
  }

  commitHistory()
  rebuildGroup()
}

let prevRotateTask: JSAnimation
async function rotateMesh(
  mesh: AbstractMesh,
  axis: 'x' | 'y' | 'z',
  angle: number,
) {
  // 快速結束，避免動畫未結束，導致下一次旋轉起點角度不正確
  if (prevRotateTask) {
    prevRotateTask.complete()
  }

  const originalQuaternion = mesh.rotationQuaternion?.clone()
  if (!originalQuaternion) {
    return
  }

  const value = {
    x: 0,
    y: 0,
    z: 0,
  }

  prevRotateTask = animate(value, {
    x: axis === 'x' ? angle : 0,
    y: axis === 'y' ? angle : 0,
    z: axis === 'z' ? angle : 0,
    duration: 500,
    ease: 'outElastic(1,0.65)',
    onUpdate() {
      const currentQuaternion = Quaternion.FromEulerAngles(
        value.x,
        value.y,
        value.z,
      )
      mesh.rotationQuaternion?.copyFrom(
        originalQuaternion.multiply(currentQuaternion),
      )
    },
  })
}

/** 給右鍵選單使用 */
const commands = {
  // preview
  cancelPreview: () => emit('cancelPreview'),
  updatePreviewOffset: (data: Partial<{
    vertical: number;
    yRotation: number;
  }>) => {
    previewOffset.value.vertical += data.vertical ?? 0
    previewOffset.value.yRotation += data.yRotation ?? 0
  },
  useAsPreview: (path: string) => {
    emit('useAsPreview', path)
  },

  // selection
  selectAll: () => selectAll(),
  deselect: () => clearSelection(),
  duplicateSelected: () => duplicateMeshes(selectedMeshes.value),
  deleteSelected: () => deleteSelectedMeshes(),

  // transform
  rotate: (mesh: AbstractMesh, axis: 'x' | 'y' | 'z', angleRad: number) => {
    rotateMesh(mesh, axis, angleRad)
  },
  enableGizmo(mode: 'position' | 'rotation' | 'scale') {
    if (!gizmoManager.value)
      return
    gizmoManager.value.positionGizmoEnabled = mode === 'position'
    gizmoManager.value.rotationGizmoEnabled = mode === 'rotation'
    gizmoManager.value.scaleGizmoEnabled = mode === 'scale'
  },
  snapToGround() {
    const targetMesh = selectedMeshes.value[0]
    if (!targetMesh)
      return
    animate(targetMesh.position, {
      y: 0,
      duration: 800,
      ease: 'outBounce',
      onComplete() { commitHistory() },
    })
  },
  moveToOrigin() {
    const targetMesh = selectedMeshes.value[0]
    if (!targetMesh)
      return
    animate(targetMesh.position, {
      x: 0,
      y: 0,
      z: 0,
      duration: 400,
      ease: 'inOutCirc',
      onComplete() { commitHistory() },
    })
  },
  resetRotation() {
    const targetMesh = selectedMeshes.value[0]
    if (!targetMesh || !targetMesh.rotationQuaternion)
      return

    animate(targetMesh.rotationQuaternion, {
      x: 0,
      y: 0,
      z: 0,
      w: 1,
      duration: 600,
      ease: 'outElastic',
      onComplete() { commitHistory() },
    })
  },
  resetScale() {
    const targetMesh = selectedMeshes.value[0]
    if (!targetMesh)
      return
    animate(targetMesh.scaling, {
      x: 1,
      y: 1,
      z: 1,
      duration: 600,
      ease: 'outElastic',
      onComplete() { commitHistory() },
    })
  },
  alignAxis: (axis: 'x' | 'y' | 'z') => {
    const base = selectedMeshes.value[0]
    if (!base)
      return
    alignMeshesToAxis(selectedMeshes.value, base, axis)
    rebuildGroup()
  },

  alignBounds: (axis: 'x' | 'y' | 'z', dir: 'max' | 'min') => {
    alignMeshesToBoundingEdge(selectedMeshes.value, axis, dir)
    rebuildGroup()
  },

  // meta
  updateSelectedMeta(patch: Partial<MeshMeta>) {
    const mesh = selectedMeshes.value[0]
    if (!mesh)
      return
    const meta = getMeshMeta(mesh)
    if (!meta)
      return
    Object.assign(meta, patch)
  },

  // history / view
  undo: () => undo(),
  redo: () => redo(),

  resetView: () => {
    if (!(camera.value instanceof ArcRotateCamera))
      return
    animate(camera.value, {
      alpha: Math.PI / 2,
      beta: Math.PI / 3,
      radius: 10,
      duration: 800,
      ease: 'inOutQuart',
    })
    animate(camera.value.target, {
      x: 0,
      y: 0,
      z: 0,
      duration: 800,
      ease: 'inOutQuart',
    })
  },
}

/** 自動 preventDefault，但是不影響輸入框 */
onKeyStroke((e) => {
  if (isInput.value)
    return

  e.preventDefault()
})
onKeyStroke((e) => ['a', 'A'].includes(e.key) && e.ctrlKey, selectAll, { dedupe: true })
onKeyStroke(['Delete', 'Backspace'], deleteSelectedMeshes, { dedupe: true })
onKeyStroke((e) => ['d', 'D'].includes(e.key) && e.shiftKey, () => duplicateMeshes(selectedMeshes.value), { dedupe: true })
onKeyStroke(['Escape', 'Esc'], () => {
  // 如果正在預覽，則先結束預覽，無任何預覽才取消選取
  if (previewMesh.value) {
    emit('cancelPreview')
    return
  }

  clearSelection()
}, { dedupe: true })
onKeyStroke((e) => ['z', 'Z'].includes(e.key) && e.ctrlKey, undo, { dedupe: true })
onKeyStroke((e) => ['y', 'Y'].includes(e.key) && e.ctrlKey, redo, { dedupe: true })
// preview offset
onKeyStroke((e) => ['q', 'Q'].includes(e.key), () => {
  if (!previewMesh.value)
    return

  previewOffset.value.vertical += 0.1
})
onKeyStroke((e) => ['e', 'E'].includes(e.key), () => {
  if (!previewMesh.value)
    return

  previewOffset.value.vertical -= 0.1
})
onKeyStroke((e) => ['a', 'A'].includes(e.key), () => {
  if (!previewMesh.value)
    return

  previewOffset.value.yRotation += Math.PI / 4
})
onKeyStroke((e) => ['d', 'D'].includes(e.key), () => {
  if (!previewMesh.value)
    return

  previewOffset.value.yRotation -= Math.PI / 4
})
// 對齊
whenever(() => aXKey?.value, () => {
  const [firstMesh] = selectedMeshes.value
  if (!firstMesh)
    return

  alignMeshesToAxis(selectedMeshes.value, firstMesh, 'x')
  rebuildGroup()
})
whenever(() => aYKey?.value, () => {
  const [firstMesh] = selectedMeshes.value
  if (!firstMesh)
    return

  alignMeshesToAxis(selectedMeshes.value, firstMesh, 'y')
  rebuildGroup()
})
whenever(() => aZKey?.value, () => {
  const [firstMesh] = selectedMeshes.value
  if (!firstMesh)
    return

  alignMeshesToAxis(selectedMeshes.value, firstMesh, 'z')
  rebuildGroup()
})

const blobUrlList: string[] = []
onBeforeUnmount(() => {
  blobUrlList.forEach((url) => URL.revokeObjectURL(url))
})

async function loadModel(
  rootFsHandle: FileSystemDirectoryHandle,
  path: string,
  file: File,
  sceneValue: Scene,
) {
  const result = await ImportMeshAsync(
    file,
    sceneValue,
    {
      pluginOptions: {
        gltf: {
          async preprocessUrlAsync(url) {
            const assetFile = await pipe(
              path.replace(file.name, ''),
              (path) => getFileFromPath(rootFsHandle, `${path}${url}`),
            )

            const newUrl = URL.createObjectURL(assetFile)
            blobUrlList.push(newUrl)

            return newUrl
          },
        },
      },
    },
  )

  const root = result.meshes[0]!
  clearPivotRecursive(root)

  root.metadata = {
    name: '',
    fileName: file.name,
    path,
    mass: sceneSettings.value.metadata.mass.defaultValue,
    restitution: sceneSettings.value.metadata.restitution.defaultValue,
    friction: sceneSettings.value.metadata.friction.defaultValue,
  } as MeshMeta

  return root
}

/** 載入預覽模型 */
async function loadPreviewModel(modelFile: ModelFile) {
  const [sceneValue, rootFsHandle] = [scene.value, mainStore.rootFsHandle]
  if (!sceneValue || !rootFsHandle)
    return

  if (previewMesh.value) {
    previewMesh.value.dispose()
    previewMesh.value = undefined
  }

  try {
    const model = await loadModel(rootFsHandle, modelFile.path, modelFile.file, sceneValue)
    model.position.copyFrom(previewMoveTarget.position)
    model.rotationQuaternion?.copyFrom(previewMoveTarget.rotation)

    model.isPickable = false
    model.getChildMeshes().forEach((mesh) => mesh.isPickable = false)

    previewMesh.value = model
  }
  catch (err) {
    console.error('模型載入失敗:', err)
  }
}

watch(() => props.selectedModelFile, (newVal) => {
  if (newVal) {
    loadPreviewModel(newVal)
  }
  else {
    if (previewMesh.value) {
      previewMesh.value.dispose()
      previewMesh.value = undefined
    }
  }
})
</script>
