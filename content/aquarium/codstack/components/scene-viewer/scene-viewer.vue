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
import { Color3, GizmoManager, ImportMeshAsync, MeshBuilder, PointerEventTypes, Vector3 } from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'
import { useMagicKeys, whenever } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { pipe, tap } from 'remeda'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useMultiMeshSelect } from '../../composables/use-multi-mesh-select'
import { useMainStore } from '../../stores/main-store'
import { getFileFromPath } from '../../utils/fs'
import '@babylonjs/loaders'

const props = defineProps<{
  selectedModelFile?: ModelFile;
}>()

const mainStore = useMainStore()
const { shift: shiftKey, alt: altKey, delete: deleteKey } = useMagicKeys()

/** 當前預覽的模型 */
const previewMesh = shallowRef<AbstractMesh>()
/** 已新增的模型 */
const addedMeshList = shallowRef<AbstractMesh[]>([])

/** 旋轉縮放的工具 */
const gizmoManager = shallowRef<GizmoManager>()
watch(() => ({ shiftKey, altKey }), ({ shiftKey, altKey }) => {
  const gizmos = gizmoManager.value?.gizmos
  if (gizmos?.positionGizmo) {
    const snapValue = altKey?.value ? 0 : shiftKey?.value ? 0.1 : 0.5
    gizmos.positionGizmo.snapDistance = snapValue
  }
  if (gizmos?.rotationGizmo) {
    const snapValue = altKey?.value ? 0 : shiftKey?.value ? Math.PI / 180 : Math.PI / 180 * 5
    gizmos.rotationGizmo.snapDistance = snapValue
  }
}, {
  deep: true,
})

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
    const { scene } = params

    gizmoManager.value = pipe(
      new GizmoManager(scene),
      tap((gizmoManager) => {
        gizmoManager.positionGizmoEnabled = true
        gizmoManager.rotationGizmoEnabled = true
        gizmoManager.boundingBoxGizmoEnabled = true
        // 關閉自由拖動
        gizmoManager.boundingBoxDragBehavior.disableMovement = true
        gizmoManager.usePointerToAttachGizmos = false

        gizmoManager.attachableMeshes = addedMeshList.value

        const gizmos = gizmoManager?.gizmos
        if (gizmos?.positionGizmo) {
          gizmos.positionGizmo.snapDistance = 0.5
          gizmos.positionGizmo.planarGizmoEnabled = false
        }
        if (gizmos?.rotationGizmo) {
          gizmos.rotationGizmo.snapDistance = Math.PI / 180 * 5
        }
        if (gizmos?.boundingBoxGizmo) {
          gizmos.boundingBoxGizmo.scaleBoxSize = 0
          gizmos.boundingBoxGizmo.rotationSphereSize = 0

          gizmos.boundingBoxGizmo.setEnabledScaling(false)
          gizmos.boundingBoxGizmo.setEnabledRotationAxis('')
        }
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
          if (clonedMesh) {
            clonedMesh.position = mouseTargetPosition.clone()
            clonedMesh.isPickable = true
            clonedMesh.getChildMeshes().forEach((mesh) => mesh.isPickable = true)
            addedMeshList.value.push(clonedMesh)
          }
          return
        }

        if (pickedMesh) {

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
        }
      }
    })

    scene.onBeforeRenderObservable.add(() => {
      const mesh = previewMesh.value
      if (!mesh)
        return

      const dt = scene.getEngine().getDeltaTime() / 1000
      // 指數平滑：不同 FPS 也會保持一致手感
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
    // 刪除前必須先 ungroup，避免 dispose 時影響到 TransformNode 結構
    ungroup()

    selectedMeshes.value.forEach((mesh) => {
      mesh.dispose()
      addedMeshList.value = addedMeshList.value.filter((m) => m !== mesh)
    })

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

// 監聽 selectedModelFile 變化
watch(() => props.selectedModelFile, (newVal) => {
  if (newVal) {
    loadPreviewModel(newVal)
  }
  else {
    // 如果被設為 undefined，則清除預覽
    if (previewMesh.value) {
      previewMesh.value.dispose()
      previewMesh.value = undefined
    }
  }
})
</script>
