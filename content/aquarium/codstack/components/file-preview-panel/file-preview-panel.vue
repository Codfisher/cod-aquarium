<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex gap-2">
      <u-button
        variant="subtle"
        color="neutral"
        icon="material-symbols:folder"
        class="w-full"
        :loading="isScanning"
        @click="handleSelectDirectory"
      >
        <transition
          name="fade-in-up"
          mode="out-in"
        >
          <span
            :key="statusMessage"
            class="text-ellipsis w-full text-wrap"
          >
            {{ statusMessage }}
          </span>
        </transition>
      </u-button>

      <u-modal title="Scene Options">
        <u-button
          color="neutral"
          variant="ghost"
          icon="material-symbols:settings"
        />

        <template #body>
          <scene-options-form />
        </template>
      </u-modal>
    </div>

    <div
      v-if="mainStore.rootFsHandle"
      ref="scrollAreaRef"
      class="flex flex-col flex-1"
    >
      <u-scroll-area
        :key="mainStore.rootFsHandle.name"
        v-slot="{ item }"
        :items="filteredModelFileChunkList"
        class="h-0 flex-[1_1_auto]"
        :ui="{ item: 'flex justify-center gap-1' }"
        virtualize
      >
        <model-preview-item
          v-for="file in item"
          :key="file.path"
          :class="{ 'border-primary!': file.path === selectedModelFile?.path }"
          :model-file="file"
          :root-handle="mainStore.rootFsHandle"
          class=" shrink-0 border-transparent border-3 duration-300"
          :size="`${previewItemWidth}px`"
          @click="handleSelectedModelFile(file)"
        />
      </u-scroll-area>
    </div>

    <!-- <div class="flex flex-wrap justify-center items-start content-start gap-1 overflow-y-auto flex-1">
      <model-preview-item
        v-for="file in filteredModelFileList"
        :key="file.path"
        class=" shrink-0 border-transparent border-3 duration-300"
        :class="{ 'border-primary!': file.path === selectedModelFile?.path }"
        :model-file="file"
        :root-handle="mainStore.rootFsHandle"
        @click="handleSelectedModelFile(file)"
      />
    </div> -->

    <u-popover
      v-if="mainStore.rootFsHandle"
      :content="{
        side: 'right',
      }"
    >
      <u-input
        :model-value="selectedTagList.length ? selectedTagList.join(', ') : 'Select tag to filter models'"
        readonly
        placeholder="Select tag to filter models"
        trailing-icon="i-material-symbols:filter-alt"
        :ui="{
          trailing: 'pointer-events-none ',
          base: !selectedTagList.length ? 'text-gray-300' : ' text-ellipsis',
        }"
      />

      <template #content>
        <div class="flex flex-col w-[20vw] gap-3 p-3">
          <div class="flex flex-wrap gap-2  ">
            <u-badge
              v-for="tag in filteredTagList"
              :key="tag"
              :label="tag"
              color="neutral"
              class=" duration-200 cursor-pointer select-none"
              :variant="selectedTagList.includes(tag) ? 'solid' : 'outline'"
              @click="handleSelectedTag(tag)"
            />

            <div
              v-if="!filteredTagList.length"
              class=" text-xs text-neutral-500"
            >
              No tag found
            </div>
          </div>

          <div class="">
            <u-button
              label="Clear Selected"
              variant="subtle"
              color="neutral"
              icon="i-material-symbols:filter-alt-off"
              class=" w-full"
              :ui="{ label: 'text-center w-full' }"
              @click="selectedTagList = []"
            />
          </div>

          <u-input
            v-model="filterOptions.tagKeyword"
            label="Tag keyword"
            placeholder="Enter tag keyword"
          >
            <template
              v-if="filterOptions.tagKeyword"
              #trailing
            >
              <u-button
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-circle-x"
                aria-label="Clear input"
                @click="filterOptions.tagKeyword = ''"
              />
            </template>
          </u-input>

          <u-separator />

          <u-checkbox
            v-model="filterOptions.includeTagFromFileName"
            as="label"
            label="Include tag from file name"
            variant="card"
          />

          <u-checkbox
            v-model="filterOptions.useAndLogic"
            as="label"
            variant="card"
            label="Use AND logic"
            description="Otherwise use OR logic"
          />
        </div>
      </template>
    </u-popover>
  </div>
</template>

<script setup lang="ts">
import type { ModelFile } from '../../type'
import { useElementSize } from '@vueuse/core'
import { chunk, pipe } from 'remeda'
import { computed, reactive, ref, useTemplateRef } from 'vue'
import { useMainStore } from '../../stores/main-store'
import ModelPreviewItem from '../model-preview-item.vue'
import SceneOptionsForm from '../scene-options-form.vue'

const toast = useToast()
const mainStore = useMainStore()

const selectedModelFile = defineModel<ModelFile>('selectedModelFile')

const SUPPORTED_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.stl']
const selectedFormatList = ref(['.gltf', '.glb'])

const isScanning = ref(false)
const statusMessage = ref('Select directory to preview 3D models')

const modelFileList = ref<ModelFile[]>([])
const selectedTagList = ref<string[]>([])
function handleSelectedTag(tag: string) {
  const index = selectedTagList.value.indexOf(tag)
  if (index === -1)
    selectedTagList.value.push(tag)
  else
    selectedTagList.value.splice(index, 1)
}

const filterOptions = ref({
  tagKeyword: '',
  /** 是否包含來自檔名的 tag */
  includeTagFromFileName: true,
  /** 過濾邏輯 */
  useAndLogic: false,
})

const scrollAreaRef = useTemplateRef('scrollAreaRef')
const scrollAreaSize = reactive(useElementSize(scrollAreaRef))
/** 從 path 提取 tag
 *
 * 提取路徑中的資料夾名稱，但忽略所有檔案都共同擁有的上層目錄
 */
const tagList = computed(() => {
  const files = modelFileList.value
  const totalFiles = files.length

  if (totalFiles === 0)
    return []

  // 記錄每個 Tag (資料夾名) 出現的檔案數
  const tagCounts = new Map<string, number>()

  files.forEach((file) => {
    const parts = pipe(
      file.path.split('/'),
      (data) => {
        if (!filterOptions.value.includeTagFromFileName) {
          data.pop()
        }
        return data
      },
      (data) => data
        .flatMap((part) => part.split('_'))
        .flatMap((part) => part.split('-'))
        .flatMap((part) => part.split('.'))
        // 保留英文和數字
        .map((part) => part.replace(/[^a-z0-9]/gi, '')),
    )

    const uniqueDirs = new Set(parts)
    uniqueDirs.forEach((dir) => {
      if (!dir)
        return

      const currentCount = tagCounts.get(dir) || 0
      tagCounts.set(dir, currentCount + 1)
    })
  })

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
const filteredTagList = computed(() => {
  return tagList.value.filter((tag) => tag.includes(filterOptions.value.tagKeyword))
})

const filteredModelFileList = computed(() => {
  if (selectedTagList.value.length === 0) {
    return modelFileList.value
  }

  return modelFileList.value.filter((file) => {
    if (filterOptions.value.useAndLogic) {
      return selectedTagList.value.every((tag) => file.path.includes(tag))
    }
    return selectedTagList.value.some((tag) => file.path.includes(tag))
  })
})

const previewItemWidth = 120
const filteredModelFileChunkList = computed(() => {
  const width = scrollAreaSize.width
  const maxColumns = Math.floor(width / previewItemWidth) || 1

  return chunk(filteredModelFileList.value, maxColumns)
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
