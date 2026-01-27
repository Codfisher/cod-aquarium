<template>
  <div class=" ">
    <canvas
      ref="canvasRef"
      class="w-full h-full outline-none"
    />
  </div>
</template>

<script setup lang="ts">
import type { AbstractMesh, Scene } from '@babylonjs/core'
import type { ModelFile } from '../../type'
import { BoundingInfo, Color3, GizmoManager, HighlightLayer, ImportMeshAsync, Mesh, MeshBuilder, PointerEventTypes, Vector3 } from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'
import { useMagicKeys } from '@vueuse/core'
import { pipe, tap } from 'remeda'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useBabylonScene } from '../../composables/use-babylon-scene'
import { useMainStore } from '../../stores/main-store'
import { getFileFromPath } from '../../utils/fs'
import '@babylonjs/loaders'
import { nanoid } from 'nanoid'

const props = defineProps<{
  selectedModelFile?: ModelFile;
}>()

const mainStore = useMainStore()
const { shift, alt } = useMagicKeys()

/** 當前預覽的模型 */
const previewMesh = shallowRef<AbstractMesh>()
/** 已新增的模型 */
const addedMeshList = shallowRef<AbstractMesh[]>([])

/** 旋轉縮放的工具 */
const gizmoManager = shallowRef<GizmoManager>()
watch(() => ({ shift, alt }), ({ shift, alt }) => {
  const snapValue = alt?.value ? 0 : shift?.value ? 0.1 : 0.5

  const gizmos = gizmoManager.value?.gizmos
  if (gizmos?.positionGizmo) {
    gizmos.positionGizmo.snapDistance = snapValue
  }
  if (gizmos?.rotationGizmo) {
    gizmos.rotationGizmo.snapDistance = snapValue
  }
}, {
  deep: true
})

/** 網格吸附單位 */
const snapUnit = computed(() => {
  if (shift?.value) {
    return 0.1
  }

  return 0.5
})
/** 按住 alt 為自由移動 */
function snapToGrid(value: number) {
  if (alt?.value) {
    return value
  }

  return Math.round(value / snapUnit.value) * snapUnit.value
}
const mouseTargetPosition = new Vector3(0, 0, 0)

const { canvasRef, scene } = useBabylonScene({
  async init(params) {
    const { scene } = params

    gizmoManager.value = pipe(
      new GizmoManager(scene),
      tap((gizmoManager) => {
        gizmoManager.positionGizmoEnabled = true
        gizmoManager.rotationGizmoEnabled = true
        gizmoManager.usePointerToAttachGizmos = true;

        gizmoManager.attachableMeshes = addedMeshList.value

        const gizmos = gizmoManager?.gizmos
        if (gizmos?.positionGizmo) {
          gizmos.positionGizmo.snapDistance = 0.5
        }
        if (gizmos?.rotationGizmo) {
          gizmos.rotationGizmo.snapDistance = 0.5
        }
      }),
    )

    const ground = createGround({ scene })

    scene.onPointerObservable.add((pointerInfo) => {
      // 滑鼠跟隨邏輯
      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        if (!previewMesh.value || !ground)
          return

        // 射線檢測：只針對地面 (groundRef)
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

      // 放置模型
      if (pointerInfo.type === PointerEventTypes.POINTERTAP) {
        if (!previewMesh.value)
          return

        const clonedMesh = previewMesh.value.clone(nanoid(), null, false)
        if (clonedMesh) {
          clonedMesh.isPickable = true
          clonedMesh.getChildMeshes().forEach((mesh) => mesh.isPickable = true)
          addedMeshList.value.push(clonedMesh)
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
