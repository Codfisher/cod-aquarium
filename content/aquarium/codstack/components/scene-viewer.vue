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
import { Color3, Color4, DirectionalLight, ImportMeshAsync, MeshBuilder, PointerEventTypes, ShadowGenerator, StandardMaterial, Texture, Vector3 } from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'
import { useMagicKeys } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { useBabylonScene } from '../composables/use-babylon-scene'
import { useMainStore } from '../stores/main-store'
import { getFileFromPath } from '../utils/fs'
import '@babylonjs/loaders'

const props = defineProps<{
  selectedModelFile?: ModelFile; // 假設這包含一個 file 物件或是 File 本身
}>()

const mainStore = useMainStore()
const { shift, alt } = useMagicKeys()

/** 當前預覽的模型 */
const previewMesh = shallowRef<AbstractMesh>()
const groundMesh = shallowRef<AbstractMesh>()

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
          const x = snapToGrid(pickInfo.pickedPoint.x)
          const z = snapToGrid(pickInfo.pickedPoint.z)
          mouseTargetPosition.set(x, 0, z)
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
