<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex gap-2">
      <u-button
        label="select directory"
        variant="outline"
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
    </div>

    <div class="text-xs text-gray-500 text-center">
      {{ statusMessage }}
    </div>

    <div
      v-if="files.length && rootHandle"
      class="flex flex-wrap gap-2 overflow-y-auto"
    >
      <model-preview-item
        v-for="file in files"
        :key="file.path"
        class=" shrink-0"
        :model-file="file"
        :root-handle="rootHandle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModelFile } from '../type'
import { ref, shallowRef } from 'vue'
import ModelPreviewItem from './model-preview-item.vue'

const selectedModelFile = defineModel<ModelFile>('selectedModelFile')

const toast = useToast()

const SUPPORTED_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.stl']

const selectedFormatList = ref(['.gltf', '.glb'])

const isScanning = ref(false)
const statusMessage = ref('select directory to preview 3D models')
const files = ref<ModelFile[]>([])
const rootHandle = shallowRef<FileSystemDirectoryHandle>()

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
    files.value = []

    const dirHandle = await window.showDirectoryPicker()
    rootHandle.value = dirHandle
    await scanDirectory(dirHandle, '')

    statusMessage.value = `scanned, found ${files.value.length} models`
  }
  catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error(err)
      statusMessage.value = 'error'
    }
    else {
      statusMessage.value = 'select directory to preview 3D models'
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
        files.value.push({
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
</script>
