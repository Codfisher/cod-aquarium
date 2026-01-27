<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex flex-col gap-2">
      <u-button
        :label="statusMessage"
        variant="subtle"
        color="neutral"
        icon="material-symbols:folder"
        class="w-full"
        :ui="{ label: 'text-center w-full' }"
        :loading="isScanning"
        @click="handleSelectDirectory"
      />

      <!-- 選擇支援格式 -->
      <!-- <u-select
          v-model="selectedFormatList"
          multiple
          :items="SUPPORTED_EXTENSIONS.map(ext => ({ label: ext, value: ext }))"
          placeholder="select supported format"
          class="w-full"
        /> -->

      <!-- <div class="flex flex-wrap gap-1">
        <u-badge
          v-for="tag in tagList"
          :key="tag"
          color="neutral"
          :variant="selectedTagList.includes(tag) ? 'solid' : 'outline'"
          :label="tag"
          class=" cursor-pointer duration-300 select-none"
          @click="handleSelectedTag(tag)"
        />
      </div> -->

      <u-select-menu
        v-model="selectedTagList"
        multiple
        :items="tagList"
        clear
      />
    </div>

    <div
      v-if="modelFileList.length && mainStore.rootFsHandle"
      class="flex flex-wrap gap-1 overflow-y-auto"
    >
      <model-preview-item
        v-for="file in filteredModelFileList"
        :key="file.path"
        class=" shrink-0 border-transparent border-3 duration-300"
        :class="{ 'border-primary!': file.path === selectedModelFile?.path }"
        :model-file="file"
        :root-handle="mainStore.rootFsHandle"
        @click="handleSelectedModelFile(file)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModelFile } from '../type'
import { computed, ref, shallowRef } from 'vue'
import { useMainStore } from '../stores/main-store'
import ModelPreviewItem from './model-preview-item.vue'

const toast = useToast()
const mainStore = useMainStore()

const selectedModelFile = defineModel<ModelFile>('selectedModelFile')

const SUPPORTED_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.stl']
const selectedFormatList = ref(['.gltf', '.glb'])

const isScanning = ref(false)
const statusMessage = ref('Select directory to preview 3D models')

const selectedTagList = ref<string[]>([])
function handleSelectedTag(tag: string) {
  if (selectedTagList.value.includes(tag)) {
    selectedTagList.value = selectedTagList.value.filter((t) => t !== tag)
  }
  else {
    selectedTagList.value.push(tag)
  }
}
/** 從 path 提取 tag
 * 
 * 提取路徑中的資料夾名稱，但忽略所有檔案都共同擁有的上層目錄
 */
const tagList = computed(() => {
  const files = modelFileList.value
  const totalFiles = files.length

  if (totalFiles === 0) return []

  // 記錄每個 Tag (資料夾名) 出現的檔案數
  const tagCounts = new Map<string, number>()

  files.forEach((file) => {
    const parts = file.path
      .split('/')
      .flatMap((part) => part.split('_'))
      // 保留英文和數字
      .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))

    // 移除檔名
    parts.pop()

    const uniqueDirs = new Set(parts)

    uniqueDirs.forEach((dir) => {
      if (!dir) return

      const currentCount = tagCounts.get(dir) || 0
      tagCounts.set(dir, currentCount + 1)
    })
  })

  // 4. 過濾 & 輸出
  const result: string[] = []

  for (const [tag, count] of tagCounts.entries()) {
    // 只有當 Tag 的出現次數小於總檔案數時，才保留
    if (count < totalFiles) {
      result.push(tag)
    }
  }

  // 排序讓顯示更整齊
  return result.sort()
})

const modelFileList = ref<ModelFile[]>([])
const filteredModelFileList = computed(() => {
  if (selectedTagList.value.length === 0) {
    return modelFileList.value
  }

  return modelFileList.value.filter((file) => {
    return selectedTagList.value.some((tag) => file.path.includes(tag))
  })
})


async function handleSelectDirectory() {
  if (!('showDirectoryPicker' in window)) {
    toast.add({
      title: 'not support ( ´•̥̥̥ ω •̥̥̥` )',
      description: 'your browser not support directory reading, suggest using Chrome、Edge',
      color: 'error',
      actions: [
        {
          label: 'explain',
          href: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker#browser_compatibility',
        },
      ],
    })
    return
  }

  try {
    isScanning.value = true
    statusMessage.value = 'scanning...'
    modelFileList.value = []
    selectedTagList.value = []

    const dirHandle = await window.showDirectoryPicker()
    mainStore.rootFsHandle = dirHandle
    await scanDirectory(dirHandle, '')

    statusMessage.value = `Scanned, found ${modelFileList.value.length} models`
  }
  catch (err) {
    mainStore.rootFsHandle = undefined
    if ((err as Error).name !== 'AbortError') {
      console.error(err)
      statusMessage.value = 'error'
    }
    else {
      statusMessage.value = 'Select directory to preview 3D models'
    }
  }
  finally {
    isScanning.value = false
  }
}

/** 遞迴掃描目錄下的所有檔案
 * @param dirHandle 目錄控制代碼
 * @param pathPrefix 目前累積的路徑 (不含當前層級)
 */
async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  pathPrefix: string,
) {
  for await (const entry of dirHandle.values()) {
    // 組合當前檔案/資料夾的相對路徑
    // 如果 pathPrefix 是空的，就直接用 entry.name，否則加斜線
    const currentPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name

    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle
      if (isModelFile(fileHandle.name)) {
        const file = await fileHandle.getFile()

        // 推入自定義物件
        modelFileList.value.push({
          name: file.name,
          path: currentPath,
          file,
        })
      }
    }
    else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle
      // 遞迴呼叫，將 currentPath 傳下去
      await scanDirectory(subDirHandle, currentPath)
    }
  }

}

function isModelFile(filename: string): boolean {
  const lowerName = filename.toLowerCase()
  if (selectedFormatList.value) {
    return selectedFormatList.value.some((ext) => lowerName.endsWith(ext))
  }
  return SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

function handleSelectedModelFile(file: ModelFile) {
  if (selectedModelFile.value === file) {
    selectedModelFile.value = undefined
    return
  }
  selectedModelFile.value = file
}
</script>
