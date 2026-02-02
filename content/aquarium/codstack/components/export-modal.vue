<template>
  <u-modal
    title="Export Scene"
    :description="`${validMeshList.length} objects`"
    @update:open="handleOpen"
  >
    <slot />

    <template #body>
      <u-textarea
        autoresize
        readonly
        class="w-full"
        :ui="{ base: 'bg-gray-900 text-green-400 font-mono resize-none text-xs' }"
        :value="jsonString"
      />
    </template>

    <template #footer>
      <div class="grid grid-cols-2 gap-2 w-full">
        <u-button
          color="primary"
          icon="i-material-symbols:download-2-rounded"
          @click="downloadJSON"
        >
          下載 JSON 檔案
        </u-button>

        <u-button
          v-if="isSupported"
          color="neutral"
          variant="outline"
          icon="i-material-symbols:content-copy-rounded"
          @click="copyToClipboard"
        >
          複製
        </u-button>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { type AbstractMesh, Quaternion } from '@babylonjs/core'
import { useClipboard } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useMainStore } from '../stores/main-store'
import { getMeshMeta } from '../utils/babylon'
import { cleanFloat } from '../utils/math'

interface Props {
  meshList?: AbstractMesh[];
}
const props = withDefaults(defineProps<Props>(), {
  meshList: () => [],
})

const mainStore = useMainStore()
const toast = useToast()

/** 紀錄打開時間 */
const openedAt = ref(0)
function handleOpen() {
  openedAt.value = Date.now()
}

const rootName = computed(() => mainStore.rootFsHandle?.name ?? '')

const validMeshList = computed(() => {
  // 依賴 openedAt，確保每次打開都重新計算
  const value = openedAt.value

  return props.meshList.filter((mesh) => mesh.isEnabled())
})

const extractedData = computed(() => {
  if (!validMeshList.value.length)
    return []

  return validMeshList.value.map((mesh) => {
    // 處理旋轉：優先使用 Quaternion，若無則從 Euler 轉換
    const quaternion = mesh.rotationQuaternion ?? Quaternion.RotationYawPitchRoll(mesh.rotation.y, mesh.rotation.x, mesh.rotation.z)
    const meta = getMeshMeta(mesh)
    const path = meta?.path ?? ''

    return {
      path: `${rootName.value}/${path}`,
      position: mesh.position.asArray().map(cleanFloat),
      rotationQuaternion: quaternion.asArray().map(cleanFloat),
      scaling: mesh.scaling.asArray().map(cleanFloat),
      metadata: meta
        ? {
          name: meta?.name,
          mass: meta?.mass,
          restitution: meta?.restitution,
          friction: meta?.friction,
        }
        : undefined,
    }
  })
})

const jsonString = computed(() => {
  const json = JSON.stringify({
    version: mainStore.version,
    partList: extractedData.value,
  }, null, 2)

  // 把換行的矩陣換成單行
  return json.replace(/\[[\d\s.,+\-e]+\]/g, (match) =>
    match.replace(/\s/g, '').replace(/,/g, ', '))
})
const { copy, isSupported } = useClipboard({ source: jsonString })

function downloadJSON() {
  const blob = new Blob([jsonString.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `scene_matrix_${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function copyToClipboard() {
  try {
    await copy()
    toast.add({
      title: '已複製到剪貼簿',
    })
  }
  catch (err) {
    console.error('複製失敗', err)
  }
}
</script>

<style scoped lang="sass">
</style>
