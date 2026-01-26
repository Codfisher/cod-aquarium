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

      <ul
        v-if="files.length"
        class="text-xs text-left w-full px-2 overflow-y-auto max-h-40"
      >
        <li
          v-for="item in files"
          :key="item.path"
          class="truncate py-1 border-b border-gray-100 last:border-0"
          :title="item.path"
        >
          {{ item.path }}
        </li>
      </ul>
    </div>
  </u-dashboard-sidebar>
</template>

<script setup lang="ts">
import type { ModelFile } from './type'
import { ref } from 'vue'

const toast = useToast()

const SUPPORTED_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.stl']

const selectedFormatList = ref(['.gltf'])

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
    await scanDirectory(dirHandle, '')

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
 */
async function scanDirectory(dirHandle: FileSystemDirectoryHandle, pathPrefix: string) {
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
          path: currentPath, // 這裡就是你要的 "folder/file.glb"
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
