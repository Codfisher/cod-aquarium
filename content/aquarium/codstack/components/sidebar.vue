<template>
  <u-dashboard-sidebar resizable>
    <div class="flex flex-col h-full gap-4">
      <div class="flex gap-2">
        <u-button
          label="選擇目錄"
          variant="outline"
          color="neutral"
          icon="material-symbols:folder"
          :loading="isScanning"
          @click="handleClick"
        />

        <!-- 選擇支援格式 -->
        <u-select
          v-model="selectedFormatList"
          multiple
          :items="SUPPORTED_EXTENSIONS.map(ext => ({ label: ext, value: ext }))"
          placeholder="選擇支援格式"
          class="w-full"
        />
      </div>

      <div class="text-xs text-gray-500 text-center">
        {{ statusMessage }}
      </div>

      <div
        v-if="files[0]"
        class="flex flex-col gap-2 overflow-y-auto"
      >
        <model-preview
          :key="files[0].path"
          class=" shrink-0"
          :file="files[0].file"
          :root-handle="files[0].rootHandle"
        />
      </div>
    </div>
  </u-dashboard-sidebar>
</template>

<script setup lang="ts">
import type { ModelFile } from '../type'
import { ref } from 'vue'
import ModelPreview from './model-preview.vue'

const toast = useToast()

const SUPPORTED_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.stl']

const selectedFormatList = ref(['.gltf', '.glb'])

const isScanning = ref(false)
const statusMessage = ref('選擇目錄後，即可預覽此目錄下所有 3D 模型')
const files = ref<ModelFile[]>([])

async function handleClick() {
  if (!('showDirectoryPicker' in window)) {
    toast.add({
      title: '不支援此功能 ( ´•̥̥̥ ω •̥̥̥` )',
      description: '您的瀏覽器不支援目錄讀取功能，建議使用 Chrome、Edge',
      color: 'error',
      actions: [
        {
          label: '說明',
          href: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker#browser_compatibility',
        },
      ],
    })
    return
  }

  try {
    isScanning.value = true
    statusMessage.value = '正在掃描...'
    files.value = []

    const dirHandle = await window.showDirectoryPicker()
    await scanDirectory(dirHandle, '', dirHandle)

    statusMessage.value = `掃描完成，找到 ${files.value.length} 個模型`
  }
  catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error(err)
      statusMessage.value = '發生錯誤'
    }
  }
  finally {
    isScanning.value = false
  }
}

/** 遞迴掃描目錄下的所有檔案
 * @param dirHandle 目錄控制代碼
 * @param pathPrefix 目前累積的路徑 (不含當前層級)
 * @param rootDirHandle 根目錄控制代碼
 */
async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  pathPrefix: string,
  rootDirHandle: FileSystemDirectoryHandle,
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
          rootHandle: rootDirHandle,
        })
      }
    }
    else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle
      // 遞迴呼叫，將 currentPath 傳下去
      await scanDirectory(subDirHandle, currentPath, rootDirHandle)
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
