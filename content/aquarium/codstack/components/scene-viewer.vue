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
import type { ModelFile } from '../type'
import { Color3, DirectionalLight, ImportMeshAsync, MeshBuilder, PointerEventTypes, ShadowGenerator, StandardMaterial, Texture, Vector3 } from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'
import { pipe } from 'remeda'
import { onMounted, shallowRef, watch } from 'vue'
import { useBabylonScene } from '../composables/use-babylon-scene'
import { useMainStore } from '../stores/main-store'
import { getFileFromPath } from '../utils/fs'
import '@babylonjs/loaders'

const props = defineProps<{
  selectedModelFile?: ModelFile; // 假設這包含一個 file 物件或是 File 本身
}>()

const mainStore = useMainStore()

/** 當前預覽的模型 */
const previewMesh = shallowRef<AbstractMesh>()
const groundMesh = shallowRef<AbstractMesh>()

/** 網格吸附單位 */
const snapUnit = 1
function snapToGrid(value: number, unit: number) {
  return Math.round(value / unit) * unit
}

const { canvasRef, scene } = useBabylonScene({
  async init(params) {
    const { scene } = params

    groundMesh.value = createGround({ scene })

    // 滑鼠跟隨邏輯
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        if (!previewMesh.value || !groundMesh.value)
          return

        // 射線檢測：只針對地面 (groundRef)
        const pickInfo = scene.pick(
          scene.pointerX,
          scene.pointerY,
          (mesh) => mesh === groundMesh.value,
        )

        if (pickInfo.hit && pickInfo.pickedPoint) {
          previewMesh.value.position.x = snapToGrid(pickInfo.pickedPoint.x, snapUnit)
          previewMesh.value.position.z = snapToGrid(pickInfo.pickedPoint.z, snapUnit)
          previewMesh.value.position.y = 0
        }
      }
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
    root.position = new Vector3(0, 0, 0)

    root.isPickable = false
    root.getChildMeshes().forEach((m) => m.isPickable = false)

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
