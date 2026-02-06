<template>
  <div class=" relative">
    <u-context-menu
      :items="contextMenuItems"
      :ui="{
        label: 'text-xs opacity-50',
      }"
    >
      <canvas
        v-once
        ref="canvasRef"
        note="沒有 v-once 會導致 contextMenuItems 一更新就破壞 canvas ref 指向，導致無法操作"
        class="w-full h-full outline-none"
      />

      <template
        v-if="selectedMeshes[0]"
        #metadata
      >
        <div
          class="flex flex-col gap-1"
          @pointermove.stop
        >
          <u-form-field
            label="Name"
            orientation="horizontal"
          >
            <u-input v-model="selectedMeshes[0].metadata.name" />
          </u-form-field>

          <u-separator class="my-1" />

          <u-form-field
            label="Mass"
            orientation="horizontal"
          >
            <u-input
              v-model="selectedMeshes[0].metadata.mass"
              type="number"
            />
          </u-form-field>

          <u-form-field
            label="Restitution"
            orientation="horizontal"
          >
            <u-input
              v-model="selectedMeshes[0].metadata.restitution"
              type="number"
            />
          </u-form-field>

          <u-form-field
            label="Friction"
            orientation="horizontal"
          >
            <u-input
              v-model="selectedMeshes[0].metadata.friction"
              type="number"
            />
          </u-form-field>
        </div>
      </template>
    </u-context-menu>

    <slot :added-mesh-list />
  </div>
</template>

<script setup lang="ts">
import type { AbstractMesh, GizmoManager, Scene } from '@babylonjs/core'
import type { ContextMenuItem } from '@nuxt/ui/.'
import type { MeshMeta, ModelFile, SceneData } from '../../type'
import { ArcRotateCamera, Color3, ImportMeshAsync, Matrix, Mesh, PointerEventTypes, Quaternion, Scalar, StandardMaterial, Vector3 } from '@babylonjs/core'
import { onKeyStroke, refManualReset, useActiveElement, useMagicKeys, useThrottledRefHistory, whenever } from '@vueuse/core'
import { animate } from 'animejs'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import { conditional, filter, isStrictEqual, isTruthy, pipe, tap } from 'remeda'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useMultiMeshSelect } from '../../composables/use-multi-mesh-select'
import { useSceneStore } from '../../domains/scene/scene-store'
import { useMainStore } from '../../stores/main-store'
import { clearPivotRecursive, findTopLevelMesh, getMeshMeta, getSurfaceSnapTransform } from '../../utils/babylon'
import { getFileFromPath } from '../../utils/fs'
import { roundToStep } from '../../utils/math'
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
      const savedQuaternion = Quaternion.FromArray(part.rotationQuaternion)
      model.rotation = savedQuaternion.toEulerAngles()
      model.rotationQuaternion = null

      model.refreshBoundingInfo()
    }

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
      // 檢查 mesh 是否還存在
      addedMeshList.value.forEach((mesh) => {
        const data = serializedData.find((data) => data.id === mesh.uniqueId)
        mesh.setEnabled(!!data?.enabled)
      })

      return serializedData
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

      // 疊加手動位移 (offset)並依照 Mesh 的自身垂直方向位移
      const upDirection = pipe(
        mesh.getDirection(Vector3.Up()),
        tap((dir) => {
          if (dir.lengthSquared() > 0) {
            dir.normalize()
          }
          dir.scaleInPlace(previewOffset.value.vertical + sceneSettings.value.previewGroundYOffset)
        }),
      )

      mesh.position.x += (previewMoveTarget.position.x - mesh.position.x + upDirection.x) * t
      mesh.position.y += (previewMoveTarget.position.y - mesh.position.y + upDirection.y) * t
      mesh.position.z += (previewMoveTarget.position.z - mesh.position.z + upDirection.z) * t

      if (mesh.rotationQuaternion) {
        // 疊加手動旋轉 (offset) 並依照 Mesh 的自身垂直方向旋轉
        const manualRotation = Quaternion.RotationAxis(
          mesh.getDirection(Vector3.Up()),
          previewOffset.value.yRotation,
        )
        const targetRotation = previewMoveTarget.rotation.multiply(manualRotation)

        Quaternion.SlerpToRef(
          mesh.rotationQuaternion,
          targetRotation,
          t,
          mesh.rotationQuaternion,
        )
      }
    })
  },
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
    clonedMesh.position.z += maxWidth
  })

  commitHistory()
}
function alignMeshes(
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
}

const activeElement = useActiveElement()
/** 自動 preventDefault，但是不影響輸入框 */
onKeyStroke((e) => {
  const el = activeElement.value
  const isInput = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable
  if (isInput)
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

  alignMeshes(selectedMeshes.value, firstMesh, 'x')
  rebuildGroup()
})
whenever(() => aYKey?.value, () => {
  const [firstMesh] = selectedMeshes.value
  if (!firstMesh)
    return

  alignMeshes(selectedMeshes.value, firstMesh, 'y')
  rebuildGroup()
})
whenever(() => aZKey?.value, () => {
  const [firstMesh] = selectedMeshes.value
  if (!firstMesh)
    return

  alignMeshes(selectedMeshes.value, firstMesh, 'z')
  rebuildGroup()
})

/** 右鍵選單 */
const contextMenuItems = computed(() => {
  return pipe(
    [
      // 放置預覽
      pipe(undefined, () => {
        if (!previewMesh.value) {
          return
        }

        return [
          { label: 'Preview Mesh', type: 'label' },
          {
            icon: 'material-symbols:cancel-outline-rounded',
            label: 'Cancel Placement',
            kbds: ['escape'],
            onSelect: () => {
              emit('cancelPreview')
            },
          },
          {
            icon: 'i-material-symbols:arrow-upward-rounded',
            label: 'Vertical Up',
            kbds: ['q'],
            onSelect: (e) => {
              previewOffset.value.vertical += 0.1
              e.preventDefault()
            },
          },
          {
            icon: 'material-symbols:arrow-downward-rounded',
            label: 'Vertical Down',
            kbds: ['e'],
            onSelect: (e) => {
              previewOffset.value.vertical -= 0.1
              e.preventDefault()
            },
          },
          {
            icon: 'i-material-symbols:rotate-90-degrees-cw-outline-rounded',
            label: 'Rotate Y +45° (cw)',
            kbds: ['a'],
            onSelect: (e) => {
              previewOffset.value.yRotation += Math.PI / 180 * 45
              e.preventDefault()
            },
          },
          {
            icon: 'i-material-symbols:rotate-90-degrees-ccw-outline-rounded',
            label: 'Rotate Y -45° (ccw)',
            kbds: ['d'],
            onSelect: (e) => {
              previewOffset.value.yRotation -= Math.PI / 180 * 45
              e.preventDefault()
            },
          },
        ] as ContextMenuItem[]
      }),
      // 選取多個 Mesh
      pipe(undefined, () => {
        const [firstMesh] = selectedMeshes.value
        if (selectedMeshes.value.length < 2 || !firstMesh) {
          return
        }

        return [
          { label: `${selectedMeshes.value.length} meshes selected`, type: 'label' },
          {
            icon: 'i-material-symbols:align-vertical-bottom',
            label: 'Align (to first)',
            children: [
              {
                icon: 'i-material-symbols:align-justify-center-rounded',
                label: 'Align along Y Axis',
                kbds: ['a', 'y'],
                onSelect: () => {
                  alignMeshes(selectedMeshes.value, firstMesh, 'y')
                  rebuildGroup()
                },
              },
              {
                icon: 'i-material-symbols:vertical-align-center',
                label: 'Align along X Axis',
                kbds: ['a', 'x'],
                onSelect: () => {
                  alignMeshes(selectedMeshes.value, firstMesh, 'x')
                  rebuildGroup()
                },
              },
              {
                icon: 'i-material-symbols:vertical-align-center',
                label: 'Align along Z Axis',
                kbds: ['a', 'z'],
                onSelect: () => {
                  alignMeshes(selectedMeshes.value, firstMesh, 'z')
                  rebuildGroup()
                },
              },
            ],
          },
          {
            icon: 'material-symbols:content-copy-outline-rounded',
            label: 'Duplicate',
            kbds: ['shift', 'd'],
            onSelect: () => duplicateMeshes(selectedMeshes.value),
          },
          {
            icon: 'i-material-symbols:delete-outline-rounded',
            label: 'Delete',
            kbds: ['delete'],
            onSelect: () => deleteSelectedMeshes(),
          },
        ] as ContextMenuItem[]
      }),
      // 選取單一 Mesh
      pipe(undefined, () => {
        if (selectedMeshes.value.length !== 1) {
          return
        }
        const mesh = selectedMeshes.value[0]
        if (!mesh)
          return

        const meta = getMeshMeta(mesh)
        if (!meta)
          return

        return [
          { label: meta.fileName, type: 'label' },
          {
            icon: 'i-material-symbols:database',
            label: 'Metadata',
            children: [
              {
                slot: 'metadata',
                onSelect: (e) => e.preventDefault(),
              },
            ] satisfies ContextMenuItem[],
          },
          {
            icon: 'hugeicons:three-d-move',
            label: 'Position',
            children: [
              {
                icon: 'i-material-symbols:drag-handle-rounded',
                label: 'Enable handles',
                kbds: ['g'],
                onSelect: () => {
                  if (!gizmoManager.value)
                    return
                  gizmoManager.value.positionGizmoEnabled = true
                  gizmoManager.value.rotationGizmoEnabled = false
                  gizmoManager.value.scaleGizmoEnabled = false
                },
              },
              {
                icon: 'i-material-symbols:download-2-rounded',
                label: 'Snap to ground',
                onSelect: () => {
                  animate(mesh.position, {
                    y: 0,
                    duration: 800,
                    ease: 'outBounce',
                    onComplete() {
                      commitHistory()
                    },
                  })
                },
              },
              {
                icon: 'ri:reset-right-fill',
                label: 'Move to origin',
                onSelect: () => {
                  animate(mesh.position, {
                    x: 0,
                    y: 0,
                    z: 0,
                    duration: 400,
                    ease: 'inOutCirc',
                    onComplete() {
                      commitHistory()
                    },
                  })
                },
              },
            ] satisfies ContextMenuItem[],
          },
          {
            icon: 'hugeicons:three-d-rotate',
            label: 'Rotation',
            children: [
              {
                icon: 'i-material-symbols:drag-handle-rounded',
                label: 'Enable handles',
                kbds: ['r'],
                onSelect: () => {
                  if (!gizmoManager.value)
                    return
                  gizmoManager.value.positionGizmoEnabled = false
                  gizmoManager.value.rotationGizmoEnabled = true
                  gizmoManager.value.scaleGizmoEnabled = false
                },
              },
              {
                icon: 'ri:reset-right-fill',
                label: 'Reset',
                onSelect: () => {
                  if (!mesh.rotationQuaternion)
                    return

                  animate(mesh.rotationQuaternion, {
                    x: 0,
                    y: 0,
                    z: 0,
                    w: 1,
                    duration: 600,
                    ease: 'outElastic',
                    onComplete() {
                      commitHistory()
                    },
                  })
                },
              },
            ] as const,
          },
          {
            icon: 'hugeicons:three-d-scale',
            label: 'Scale',
            children: [
              {
                icon: 'i-material-symbols:drag-handle-rounded',
                label: 'Enable handles',
                kbds: ['s'],
                onSelect: () => {
                  if (!gizmoManager.value)
                    return
                  gizmoManager.value.positionGizmoEnabled = false
                  gizmoManager.value.rotationGizmoEnabled = false
                  gizmoManager.value.scaleGizmoEnabled = true
                },
              },
              {
                icon: 'ri:reset-right-fill',
                label: 'Reset',
                onSelect: () => {
                  animate(mesh.scaling, {
                    x: 1,
                    y: 1,
                    z: 1,
                    duration: 600,
                    ease: 'outElastic',
                    onComplete() {
                      commitHistory()
                    },
                  })
                },
              },
            ] as const,
          },
          {
            icon: 'i-material-symbols:preview',
            label: 'Use as Preview',
            onSelect: () => emit('useAsPreview', meta.path),
          },
          {
            icon: 'material-symbols:content-copy-outline-rounded',
            label: 'Duplicate',
            kbds: ['d'],
            onSelect: () => duplicateMeshes(selectedMeshes.value),
          },
          {
            icon: 'i-material-symbols:delete-outline-rounded',
            label: 'Delete',
            kbds: ['delete'],
            onSelect: () => deleteSelectedMeshes(),
          },
        ] as ContextMenuItem[]
      }),
      [
        pipe(undefined, () => {
          const anyMeshEnabled = addedMeshList.value.some((mesh) => mesh.isEnabled())
          if (!anyMeshEnabled)
            return

          return {
            icon: 'material-symbols:select-all-rounded',
            label: 'Select All',
            kbds: ['ctrl', 'a'],
            onSelect: () => selectAll(),
          }
        }),
        pipe(undefined, () => {
          if (!selectedMeshes.value.length)
            return

          return {
            icon: 'material-symbols:deselect-rounded',
            label: 'Deselect',
            kbds: ['escape'],
            onSelect: () => clearSelection(),
          }
        }),
        {
          icon: 'material-symbols:undo-rounded',
          label: 'Undo',
          kbds: ['ctrl', 'z'],
          disabled: !canUndo.value,
          onSelect: undo,
        },
        {
          icon: 'material-symbols:redo-rounded',
          label: 'Redo',
          kbds: ['ctrl', 'y'],
          disabled: !canRedo.value,
          onSelect: redo,
        },
        {
          icon: 'material-symbols:flip-camera-ios-outline-rounded',
          label: 'Reset View',
          onSelect: () => {
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
        },
      ].filter(isTruthy),
    ] as ContextMenuItem[][],
    filter(isTruthy),
  )
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
