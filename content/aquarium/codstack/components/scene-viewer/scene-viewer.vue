<template>
  <div class=" relative">
    <u-context-menu
      :items="contextMenuItems"
      :ui="{
        label: 'text-xs opacity-50',
      }"
    >
      <canvas
        ref="canvasRef"
        class="w-full h-full outline-none"
      />
    </u-context-menu>

    <slot :added-mesh-list />
  </div>
</template>

<script setup lang="ts">
import type { AbstractMesh, GizmoManager } from '@babylonjs/core'
import type { ContextMenuItem } from '@nuxt/ui/.'
import type { MeshMeta, ModelFile } from '../../type'
import { ArcRotateCamera, Color3, Color4, ImportMeshAsync, KeyboardEventTypes, Mesh, PointerEventTypes, Quaternion, Scalar, StandardMaterial, Vector3 } from '@babylonjs/core'
import { onKeyStroke, useActiveElement, useEventListener, useMagicKeys, useThrottledRefHistory } from '@vueuse/core'
import { animate } from 'animejs'
import { nanoid } from 'nanoid'
import { filter, isTruthy, pipe, tap } from 'remeda'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useMultiMeshSelect } from '../../composables/use-multi-mesh-select'
import { useSceneStore } from '../../domains/scene/scene-store'
import { useMainStore } from '../../stores/main-store'
import { findTopLevelMesh, getMeshMeta, snapMeshToSurface } from '../../utils/babylon'
import { getFileFromPath } from '../../utils/fs'
import { roundToStep } from '../../utils/math'
import { createGizmoManager, createGround, createSideCamera } from './creator'
import '@babylonjs/loaders'

const props = defineProps<{
  selectedModelFile?: ModelFile;
}>()

const emit = defineEmits<{
  cancelPreview: [];
}>()

defineSlots<{
  default: (props: { addedMeshList: AbstractMesh[] }) => any;
}>()

const mainStore = useMainStore()
const sceneStore = useSceneStore()

const {
  shift: shiftKey,
  g: gKey,
  s: sKey,
  r: rKey,
  q: qKey,
  e: eKey,
} = useMagicKeys()

/** 目前預覽的模型 */
const previewMesh = shallowRef<AbstractMesh>()
/** 預覽垂直偏移量 */
const previewVerticalOffset = ref(0)
watch(previewMesh, () => previewVerticalOffset.value = 0)

/** 已新增的模型 */
const addedMeshList = shallowRef<AbstractMesh[]>([])

watch(() => mainStore.rootFsHandle, () => {
  addedMeshList.value.forEach((mesh) => {
    mesh.dispose()
  })
  addedMeshList.value = []
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
    gizmos.rotationGizmo.snapDistance = shiftKeyValue ? Math.PI / 180 : 0
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
const mouseTargetPosition = new Vector3(0, 0, 0)

const { canvasRef, scene, camera } = useBabylonScene({
  async init(params) {
    const { scene, camera, engine } = params
    scene.activeCamera = camera
    scene.cameraToUseForPointers = camera

    const sideCamera = pipe(
      createSideCamera({ scene, camera, engine }),
      tap((sideCam) => {
        /** x-ray 專用材質 */
        const xRayMaterial = new StandardMaterial('xRayMat', scene)
        xRayMaterial.diffuseColor = new Color3(0.8, 0.8, 0.8)
        xRayMaterial.alpha = 0.4
        xRayMaterial.disableDepthWrite = true

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
            sideCamera.target = Vector3.Lerp(sideCamera.target, worldCenter, 0.1)

            const offset = new Vector3(10, 0, 0)
            sideCamera.position = Vector3.Lerp(sideCamera.position, worldCenter.add(offset), 0.1)

            // 鎖定相機角度
            sideCamera.alpha = 0
            sideCamera.beta = Math.PI / 2

            // 平滑過渡數值
            const currentOrthoSize = Scalar.Lerp(sideCamera.orthoTop!, worldRadius, 0.1)

            /** 畫面長寬比 */
            const aspect = engine.getRenderWidth() / engine.getRenderHeight()

            sideCamera.orthoTop = currentOrthoSize
            sideCamera.orthoBottom = -currentOrthoSize
            sideCamera.orthoLeft = -currentOrthoSize * aspect
            sideCamera.orthoRight = currentOrthoSize * aspect
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
          const target = snapMeshToSurface(previewMesh.value, pickInfo)
          if (target) {
            if (pickInfo.pickedMesh === ground) {
              target.x = roundToStep(target.x, previewSnapUnit.value)
              target.z = roundToStep(target.z, previewSnapUnit.value)
            }
            target.y += sceneStore.settings.previewBaseY + previewVerticalOffset.value
            mouseTargetPosition.copyFrom(target)
          }
        }
      }

      // 點擊事件
      if (pointerInfo.type === PointerEventTypes.POINTERTAP) {
        // 忽略右鍵
        if (pointerInfo.event.button === 2)
          return

        const pickedMesh = pointerInfo.pickInfo?.pickedMesh

        // 預覽、放置
        if (previewMesh.value) {
          const clonedMesh = previewMesh.value.clone(nanoid(), null, false)
          if (clonedMesh instanceof Mesh) {
            // 確保 Mesh 有父物件的話，先解除父子關係，把變形保留在 World Space
            // (這樣可以避免解除 Parent 時物件亂飛)
            clonedMesh.setParent(null)

            /** 暫時將物件移回世界原點
             *
             * 這樣做是因為 bakeCurrentTransformIntoVertices 會把「當前位置」吃進頂點，如果我們在這裡不歸零，頂點會被移走，而 Pivot 會留在 (0,0,0)
             *
             * 看起來就是放下去的瞬間，模型會突然跳到更遠離原點的地方
             */
            clonedMesh.position.setAll(0)

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

            clonedMesh.position.copyFrom(mouseTargetPosition)
            clonedMesh.refreshBoundingInfo()

            clonedMesh.isPickable = true
            clonedMesh.getChildMeshes().forEach((mesh) => mesh.isPickable = true)
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

    scene.onBeforeRenderObservable.add(() => {
      const previewMeshValue = previewMesh.value
      if (previewMeshValue) {
        const dt = scene.getEngine().getDeltaTime() / 1000
        // 不同 FPS 也會保持一致手感
        const t = 1 - Math.exp(-16 * dt)

        previewMeshValue.position.x += (mouseTargetPosition.x - previewMeshValue.position.x) * t
        previewMeshValue.position.y += (mouseTargetPosition.y - previewMeshValue.position.y) * t
        previewMeshValue.position.z += (mouseTargetPosition.z - previewMeshValue.position.z) * t
      }
    })
  },
})

const {
  selectedMeshes,
  selectMesh: _selectMesh,
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
function duplicateSelectedMeshes(meshes: AbstractMesh[]) {
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
    clonedMesh.position.x += maxWidth * 1.5
    clonedMesh.position.z += maxWidth * 1.5
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
onKeyStroke(['d', 'D'], () => duplicateSelectedMeshes(selectedMeshes.value), { dedupe: true })
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

onKeyStroke((e) => ['q', 'Q'].includes(e.key), () => {
  if (!previewMesh.value)
    return

  previewVerticalOffset.value += 0.1
}, { dedupe: true })
onKeyStroke((e) => ['e', 'E'].includes(e.key), () => {
  if (!previewMesh.value)
    return

  previewVerticalOffset.value -= 0.1
}, { dedupe: true })

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
            onSelect: () => {
              previewVerticalOffset.value += 0.1
              mouseTargetPosition.y += previewVerticalOffset.value
            },
          },
          {
            icon: 'material-symbols:arrow-downward-rounded',
            label: 'Vertical Down',
            kbds: ['e'],
            onSelect: () => {
              previewVerticalOffset.value -= 0.1
              mouseTargetPosition.y += previewVerticalOffset.value
            },
          },
        ] as ContextMenuItem[]
      }),
      // 選取多個 Mesh
      pipe(undefined, () => {
        if (selectedMeshes.value.length < 2) {
          return
        }

        return [
          { label: `${selectedMeshes.value.length} meshes selected`, type: 'label' },
          {
            icon: 'material-symbols:content-copy-outline-rounded',
            label: 'Duplicate',
            kbds: ['d'],
            onSelect: () => duplicateSelectedMeshes(selectedMeshes.value),
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

        return [
          { label: meta?.fileName || 'Unknown Mesh', type: 'label' },
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
            icon: 'material-symbols:content-copy-outline-rounded',
            label: 'Duplicate',
            kbds: ['d'],
            onSelect: () => duplicateSelectedMeshes(selectedMeshes.value),
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
    const result = await ImportMeshAsync(
      modelFile.file,
      sceneValue,
      {
        pluginOptions: {
          gltf: {
            async preprocessUrlAsync(url) {
              const file = await pipe(
                modelFile.path.replace(modelFile.name, ''),
                (path) => getFileFromPath(rootFsHandle, `${path}${url}`),
              )

              const newUrl = URL.createObjectURL(file)
              blobUrlList.push(newUrl)

              return newUrl
            },
          },
        },
      },
    )

    const root = result.meshes[0]!
    root.position = mouseTargetPosition.clone()

    // const { min, max } = root.getHierarchyBoundingVectors()
    // root.setBoundingInfo(new BoundingInfo(min, max))
    // root.showBoundingBox = true

    root.isPickable = false
    root.getChildMeshes().forEach((mesh) => mesh.isPickable = false)

    root.metadata = {
      fileName: modelFile.name,
      path: modelFile.path,
    } satisfies MeshMeta

    previewMesh.value = root
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
