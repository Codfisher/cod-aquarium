<template>
  <u-modal
    title="Export Scene"
    @update:open="handleOpen"
  >
    <slot />

    <template #body>
      <div class="flex flex-col gap-4 p-1">
        <div class="relative group">
          <div class="absolute right-2 top-2 text-xs text-gray-500 pointer-events-none">
            {{ props.meshList?.length || 0 }} objects
          </div>

          <u-textarea
            autoresize
            readonly
            class="w-full"
            :ui="{ base: 'bg-gray-900 text-green-400 min-h-6 font-mono resize-none text-xs' }"
            :value="jsonString"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="grid grid-cols-2 gap-2 w-full">
        <u-button
          color="primary"
          icon="i-heroicons:document-arrow-down"
          @click="downloadJSON"
        >
          下載 JSON 檔案
        </u-button>

        <u-button
          v-if="isSupported"
          color="neutral"
          variant="outline"
          icon="i-heroicons:clipboard-document"
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

const extractedData = computed(() => {
  // 依賴 openedAt，確保每次打開都重新計算
  const value = openedAt.value

  if (!props.meshList)
    return []

  return props.meshList
    .filter((mesh) => mesh.isEnabled())
    .map((mesh) => {
      // 處理旋轉：優先使用 Quaternion，若無則從 Euler 轉換
      const quaternion = mesh.rotationQuaternion ?? Quaternion.RotationYawPitchRoll(mesh.rotation.y, mesh.rotation.x, mesh.rotation.z)
      const meta = getMeshMeta(mesh)
      const path = meta?.path ?? ''

      return {
        path: `${rootName.value}/${path}`,
        position: mesh.position.asArray().map(cleanFloat),
        rotationQuaternion: quaternion.asArray().map(cleanFloat),
        scaling: mesh.scaling.asArray().map(cleanFloat),
      }
    })
})

const jsonString = computed(() => {
  const json = JSON.stringify(extractedData.value, null, 2)

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
