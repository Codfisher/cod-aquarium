<template>
  <u-modal
    title="Export Scene"
    @update:open="handleOpen"
  >
    <slot />

    <template #body>
      <div class="flex flex-col gap-4 p-1">
        <div class="grid grid-cols-2 gap-2">
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

        <div class="relative group">
          <div class="absolute right-2 top-2 text-xs text-gray-500 pointer-events-none">
            {{ props.meshList?.length || 0 }} objects
          </div>

          <textarea
            readonly
            class="w-full h-64 p-3 text-xs font-mono bg-gray-900 text-green-400 rounded-md border border-gray-700 focus:outline-none resize-none overflow-auto custom-scrollbar"
            :value="jsonString"
          />
        </div>
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

// 將資料轉為 JSON 字串，用於顯示與下載
const jsonString = computed(() => {
  const json = JSON.stringify(extractedData.value, null, 2)

  /** 把換行的矩陣換成單行 */
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
/* 自定義捲軸樣式 (讓預覽區好看一點) */
.custom-scrollbar
  &::-webkit-scrollbar
    width: 8px
    height: 8px
  &::-webkit-scrollbar-track
    background: #1f2937
  &::-webkit-scrollbar-thumb
    background: #4b5563
    border-radius: 4px
    &:hover
      background: #6b7280
</style>
