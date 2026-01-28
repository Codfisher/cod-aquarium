<template>
  <div class=" ">
    <canvas
      ref="canvasRef"
      class="w-full h-full outline-none"
    />
  </div>
</template>

<script setup lang="ts">
import type { AbstractMesh, Node, Scene } from '@babylonjs/core'
import type { ModelFile } from '../../type'
import { ArcRotateCamera, Camera, Color3, Color4, GizmoManager, ImportMeshAsync, Mesh, MeshBuilder, PointerEventTypes, Quaternion, Vector3, Viewport } from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'
import { useDebouncedRefHistory, useMagicKeys, useThrottledRefHistory, whenever } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { isTruthy, map, pipe, piped, prop, tap } from 'remeda'
import { computed, onMounted, Ref, shallowRef, triggerRef, watch } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useMultiMeshSelect } from '../../composables/use-multi-mesh-select'
import { useMainStore } from '../../stores/main-store'
import { getFileFromPath } from '../../utils/fs'
import '@babylonjs/loaders'

const props = defineProps<{
  selectedModelFile?: ModelFile;
}>()

const mainStore = useMainStore()
const {
  shift: shiftKey,
  alt: altKey,
  delete: deleteKey,
  ctrl_z: ctrlZKey,
  ctrl_y: ctrlYKey,
  g: gKey,
  s: sKey,
  r: rKey,
} = useMagicKeys()

/** 當前預覽的模型 */
const previewMesh = shallowRef<AbstractMesh>()
/** 已新增的模型 */
const addedMeshList = shallowRef<AbstractMesh[]>([])

interface MeshState {
  id: number;
  enabled: boolean;
  position: [number, number, number];
  scale: [number, number, number];
  rotationQuaternion?: [number, number, number, number];
}
const { undo, redo } = useThrottledRefHistory(
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
whenever(() => ctrlZKey?.value, () => undo())
whenever(() => ctrlYKey?.value, () => redo())

/** 旋轉縮放的工具 */
const gizmoManager = shallowRef<GizmoManager>()
watch(() => ({ shiftKey, altKey }), ({ shiftKey, altKey }) => {
  const gizmos = gizmoManager.value?.gizmos
  if (gizmos?.positionGizmo && gizmos?.scaleGizmo) {
    const snapValue = altKey?.value ? 0 : shiftKey?.value ? 0.1 : 0.5
    gizmos.scaleGizmo.snapDistance = snapValue
    gizmos.positionGizmo.snapDistance = snapValue
  }
  if (gizmos?.rotationGizmo) {
    const snapValue = altKey?.value ? 0 : shiftKey?.value ? Math.PI / 180 : Math.PI / 180 * 5
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

/** 網格吸附單位 */
const snapUnit = computed(() => {
  if (shiftKey?.value) {
    return 0.1
  }

  return 0.5
})
/** 按住 alt 為自由移動 */
function snapToGrid(value: number) {
  if (altKey?.value) {
    return value
  }

  return Math.round(value / snapUnit.value) * snapUnit.value
}
const mouseTargetPosition = new Vector3(0, 0, 0)

function findTopLevelMesh(mesh: AbstractMesh, list: AbstractMesh[]): AbstractMesh | undefined {
  let current: Node | null = mesh
  while (current) {
    if (list.includes(current as AbstractMesh)) {
      return current as AbstractMesh
    }
    current = current.parent
  }
  return undefined
}

const { canvasRef, scene } = useBabylonScene({
  async init(params) {
    const { scene, camera, engine } = params
    scene.activeCamera = camera
    scene.cameraToUseForPointers = camera
    scene.clearColor = new Color4(1, 1, 1, 1)

    const sideCamera = pipe(
      new ArcRotateCamera(
        'sideCamera',
        0,
        Math.PI / 2,
        10,
        new Vector3(0, 0, 0),
        scene,
      ),
      tap((camera2) => {
        camera2.viewport = new Viewport(0.80, 0.80, 0.20, 0.20)
        camera2.mode = Camera.ORTHOGRAPHIC_CAMERA

        camera2.detachControl()
        camera2.inputs.clear()

        // 同時渲染兩個相機
        scene.activeCameras = [camera, camera2]

        const orthoSize = 2.5
        const updateOrtho = () => {
          const engine = scene.getEngine()
          const aspect = engine.getRenderWidth() / engine.getRenderHeight()

          camera2.orthoLeft = -orthoSize * aspect
          camera2.orthoRight = orthoSize * aspect
          camera2.orthoTop = orthoSize
          camera2.orthoBottom = -orthoSize
        }
        updateOrtho()
        engine.onResizeObservable.add(updateOrtho)

        // 加上副相機的底色
        const sideViewColor = new Color4(0.9, 0.9, 0.9, 1)
        scene.onBeforeCameraRenderObservable.add((camera) => {
          if (camera.id === 'sideCamera') {
            const viewport = camera.viewport

            // 1. 取得畫布實際像素尺寸
            const width = engine.getRenderWidth()
            const height = engine.getRenderHeight()

            // 2. 計算副相機視窗在畫面上的實際像素位置 (Scissor Box)
            // Viewport 的參數是 (x, y, width, height) 比例 (0~1)
            const x = viewport.x * width
            const y = viewport.y * height
            const w = viewport.width * width
            const h = viewport.height * height

            // 3. 開啟剪裁功能，只允許在該區域繪製/清除
            engine.enableScissor(x, y, w, h)

            // 4. 執行清除 (只會影響被剪裁的區域)
            engine.clear(sideViewColor, true, true, true)

            // 5. 關閉剪裁，以免影響到後續或其他相機的正常渲染
            engine.disableScissor()
          }
        })
      }),
    )

    gizmoManager.value = pipe(
      new GizmoManager(scene),
      tap((gizmoManager) => {
        gizmoManager.utilityLayer.setRenderCamera(camera)

        gizmoManager.positionGizmoEnabled = true
        gizmoManager.rotationGizmoEnabled = true
        gizmoManager.scaleGizmoEnabled = true
        gizmoManager.boundingBoxGizmoEnabled = true
        // 關閉自由拖動
        gizmoManager.boundingBoxDragBehavior.disableMovement = true
        gizmoManager.usePointerToAttachGizmos = false

        gizmoManager.attachableMeshes = addedMeshList.value

        const { gizmos } = gizmoManager
        if (gizmos?.positionGizmo) {
          gizmos.positionGizmo.snapDistance = 0.5
          gizmos.positionGizmo.planarGizmoEnabled = false
          gizmos.positionGizmo.gizmoLayer.setRenderCamera(camera)
        }
        if (gizmos?.rotationGizmo) {
          gizmos.rotationGizmo.snapDistance = Math.PI / 180 * 5
          gizmos.rotationGizmo.gizmoLayer.setRenderCamera(camera)
        }
        if (gizmos?.scaleGizmo) {
          gizmos.scaleGizmo.snapDistance = 0.5
          gizmos.scaleGizmo.gizmoLayer.setRenderCamera(camera)
        }

        if (gizmos?.boundingBoxGizmo) {
          gizmos.boundingBoxGizmo.rotationSphereSize = 0

          gizmos.boundingBoxGizmo.setEnabledScaling(false)
          gizmos.boundingBoxGizmo.setEnabledRotationAxis('')
          gizmos.boundingBoxGizmo.gizmoLayer.setRenderCamera(camera)
        }

        gizmos.positionGizmo?.onDragEndObservable.add(() => {
          console.log('🚀 ~ positionGizmo.onDragEndObservable:')
          triggerRef(addedMeshList)
        })
        gizmos.rotationGizmo?.onDragEndObservable.add(() => {
          console.log('🚀 ~ rotationGizmo.onDragEndObservable:')
          triggerRef(addedMeshList)
        })
        gizmos.scaleGizmo?.onDragEndObservable.add(() => {
          console.log('🚀 ~ scaleGizmo.onDragEndObservable:')
          triggerRef(addedMeshList)
        })
      }),
    )

    const ground = createGround({ scene })

    scene.onPointerObservable.add((pointerInfo) => {
      // 滑鼠移動
      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        if (!previewMesh.value || !ground)
          return

        // 針對地面射線檢測
        const pickInfo = scene.pick(
          scene.pointerX,
          scene.pointerY,
          (mesh) => mesh === ground,
          false,
          camera,
        )

        if (pickInfo.hit && pickInfo.pickedPoint) {
          const x = snapToGrid(pickInfo.pickedPoint.x)
          const z = snapToGrid(pickInfo.pickedPoint.z)
          mouseTargetPosition.set(x, 0, z)
        }
      }

      // 點擊事件
      if (pointerInfo.type === PointerEventTypes.POINTERTAP) {
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
            triggerRef(addedMeshList)
          }
          return
        }

        // 點擊到已放置的模型
        if (pickedMesh === ground) {
          clearSelection()
          return
        }

        // 選取
        if (pickedMesh) {
          const topLevelMesh = findTopLevelMesh(pickedMesh, addedMeshList.value)
          if (!topLevelMesh)
            return
          handleSelect(topLevelMesh, !!shiftKey?.value)

          // 關閉所有 Gizmo 小工具，需使用快捷鍵開啟
          if (gizmoManager.value) {
            gizmoManager.value.positionGizmoEnabled = false
            gizmoManager.value.rotationGizmoEnabled = false
            gizmoManager.value.scaleGizmoEnabled = false
          }
        }
      }
    })

    scene.onBeforeRenderObservable.add(() => {
      const firstSelectedMesh = selectedMeshes.value[0]
      if (firstSelectedMesh) {
        const targetPosition = firstSelectedMesh.getAbsolutePosition()

        sideCamera.target = Vector3.Lerp(sideCamera.target, targetPosition, 0.1)
        sideCamera.alpha = 0
        sideCamera.beta = Math.PI / 2

        const offset = new Vector3(10, 0, 0)
        sideCamera.position = Vector3.Lerp(sideCamera.position, targetPosition.add(offset), 0.1)
      }

      const mesh = previewMesh.value
      if (!mesh)
        return

      const dt = scene.getEngine().getDeltaTime() / 1000
      // 不同 FPS 也會保持一致手感
      const t = 1 - Math.exp(-16 * dt)

      mesh.position.x += (mouseTargetPosition.x - mesh.position.x) * t
      mesh.position.y += (mouseTargetPosition.y - mesh.position.y) * t
      mesh.position.z += (mouseTargetPosition.z - mesh.position.z) * t
    })
  },
})

const {
  selectedMeshes,
  handleSelect,
  clearSelection,
  ungroup,
} = useMultiMeshSelect({ gizmoManager, scene })

whenever(() => deleteKey, () => {
  if (selectedMeshes.value.length > 0) {
    ungroup()

    selectedMeshes.value.forEach((mesh) => {
      mesh.setEnabled(false)
    })
    triggerRef(addedMeshList)

    clearSelection()
  }
}, {
  deep: true,
})

function createGround({ scene }: { scene: Scene }) {
  const ground = MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene)
  ground.receiveShadows = true

  const groundMaterial = new GridMaterial('groundMaterial', scene)
  groundMaterial.gridRatio = 1

  groundMaterial.majorUnitFrequency = 10
  groundMaterial.minorUnitVisibility = 0.45
  groundMaterial.mainColor = new Color3(0.98, 0.98, 0.98) // 底色
  groundMaterial.lineColor = new Color3(0.75, 0.75, 0.75) // 線色

  ground.material = groundMaterial

  return ground
}

const blobUrlList: string[] = []
onMounted(() => {
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
