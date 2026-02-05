<template>
  <div class="flex flex-col h-full gap-2">
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
      class="flex items-center gap-2"
    >
      <u-tabs
        v-model="selectedTab"
        :items="tabList"
        class="flex-1 duration-200"
        :content="false"
        :class="{ 'opacity-20': tabList.length === 1 }"
        color="neutral"
      />

      <u-popover
        :content="{
          side: 'right',
          align: 'start',
        }"
        arrow
      >
        <u-button
          icon="material-symbols:add-2-rounded"
          variant="subtle"
          color="neutral"
        />

        <template #content>
          <div class=" flex gap-2 p-2">
            <u-input
              v-model="newTabName"
              placeholder="Enter new tab name"
              class="flex-1"
              @keydown.enter="addNewTab()"
            />

            <u-button
              icon="i-material-symbols:add-rounded"
              color="primary"
              variant="solid"
              @click="addNewTab()"
            />
          </div>

          <div class="flex flex-col p-2">
            <div
              v-for="tab in customTabList"
              :key="tab.id"
              class="flex items-center"
            >
              <div class="text-sm font-bold flex-1">
                {{ tab.label }}
              </div>

              <u-button
                icon="i-material-symbols:delete-rounded"
                color="error"
                variant="ghost"
                @click="deleteTab(tab.label)"
              />
            </div>

            <div
              v-if="!customTabList.length"
              class=" text-xs opacity-50 text-center"
            >
              No any custom tab
            </div>
          </div>
        </template>
      </u-popover>
    </div>

    <div
      v-if="mainStore.rootFsHandle"
      ref="scrollAreaBoxRef"
      class="flex flex-col flex-1"
    >
      <u-scroll-area
        ref="scrollAreaRef"
        :key="mainStore.rootFsHandle.name"
        v-slot="{ item }"
        :items="filteredModelFileChunkList"
        class="h-0 flex-[1_1_auto]"
        :ui="{ item: 'flex justify-center gap-1' }"
        virtualize
      >
        <u-context-menu
          v-for="file in item"
          :key="file.path"
          :items="createCustomTabContextMenuItems(file)"
          :modal="false"
        >
          <model-preview-item
            :class="{ 'border-primary!': file.path === selectedModelFile?.path }"
            :model-file="file"
            :root-handle="mainStore.rootFsHandle"
            class=" shrink-0 border-transparent border-3 duration-300"
            :size="`${previewItemWidth}px`"
            @click="handleSelectedModelFile(file)"
          >
            <u-button
              v-if="customTabList.length"
              :icon="`i-material-symbols:${!file.hasTab ? 'bookmark-outline-rounded' : 'bookmark'}`"
              variant="ghost"
              color="neutral"
              class="absolute top-0 right-0 pointer-events-none"
            />
          </model-preview-item>
        </u-context-menu>

      </u-scroll-area>
    </div>

    <div
      v-if="mainStore.rootFsHandle"
      class="grid grid-cols-2 gap-2 @container"
    >
      <u-input
        v-model="filterOptions.keyword"
        placeholder="Enter keywords to search models"
        class="col-span-2 @md:col-span-1"
      >
        <template #leading>
          <u-icon name="i-lucide-search" />
        </template>

        <template
          v-if="filterOptions.keyword"
          #trailing
        >
          <u-button
            color="neutral"
            variant="link"
            size="sm"
            icon="i-material-symbols:close"
            aria-label="Clear input"
            @click="filterOptions.keyword = ''"
          />
        </template>
      </u-input>

      <u-popover :content="{
        side: 'right',
      }">
        <u-input
          :model-value="selectedTagList.length ? selectedTagList.join(', ') : 'Select tag to filter models'"
          class="col-span-2 @md:col-span-1"
          readonly
          placeholder="Select tag to filter models"
          leading-icon="i-material-symbols:filter-alt"
          :ui="{
            base: !selectedTagList.length ? 'text-gray-300' : ' text-ellipsis',
          }"
        >
          <template
            v-if="selectedTagList.length"
            #trailing
          >
            <u-icon
              name="i-material-symbols:close"
              @click.stop="selectedTagList = []"
            />
          </template>
        </u-input>

        <template #content>
          <div class="flex flex-col w-[20vw] gap-3 p-3">
            <div class="flex flex-wrap gap-2 overflow-auto max-h-[60vh]">
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
  </div>
</template>

<script setup lang="ts">
import type { ContextMenuItem, DropdownMenuItem, TabsItem } from '@nuxt/ui/.'
import type { ModelFile } from '../../type'
import { refManualReset, useElementSize, useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { chunk, clone, filter, isTruthy, map, pipe, tap } from 'remeda'
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import { useMainStore } from '../../stores/main-store'
import ModelPreviewItem from '../model-preview-item.vue'
import SceneOptionsForm from '../scene-options-form.vue'
import { nextFrame } from '../../../../../web/common/utils'

const toast = useToast()
const mainStore = useMainStore()
const { rootFsHandle } = storeToRefs(mainStore)

const selectedModelFile = defineModel<ModelFile>('selectedModelFile')

const SUPPORTED_EXTENSIONS = ['.gltf', '.glb', '.obj', '.fbx', '.stl']
const selectedFormatList = ref(['.gltf', '.glb'])

const isScanning = ref(false)
const statusMessage = refManualReset('Select folder to preview 3D models')

const modelFileList = ref<ModelFile[]>([])
const selectedTagList = ref<string[]>([])
function handleSelectedTag(tag: string) {
  const index = selectedTagList.value.indexOf(tag)
  if (index === -1)
    selectedTagList.value.push(tag)
  else
    selectedTagList.value.splice(index, 1)
}

const baseTabList = {
  label: 'All',
  value: 'all',
} as const satisfies TabsItem
const selectedTab = ref<string>(baseTabList.value)

const customTabListMap = useStorage<Record<
  /** 根目錄路徑 */
  string,
  TabsItem[]
>>('custom-tab-list', {})
const customTabList = computed(() => {
  const key = rootFsHandle.value?.name
  if (!key) {
    return []
  }
  return customTabListMap.value[key] ?? []
})

const newTabName = ref('')
function addNewTab() {
  const key = rootFsHandle.value?.name
  if (!newTabName.value || !key)
    return

  customTabListMap.value[key] = [
    ...customTabList.value ?? [],
    { label: newTabName.value, value: newTabName.value },
  ]

  newTabName.value = ''
}

function deleteTab(label: string | undefined) {
  const key = rootFsHandle.value?.name
  if (!key) {
    return
  }
  customTabListMap.value[key] = customTabList.value.filter((tab) => tab.label !== label)
}

const modelTabMap = useStorage<Record<
  /** rootName + model file path */
  string,
  string[]
>>('model-tab-list', {})
function createCustomTabContextMenuItems(data: ModelFile): ContextMenuItem[] {
  const rootName = rootFsHandle.value?.name
  if (!rootName) {
    return []
  }
  const key = `${rootName}/${data.path}`

  return pipe(
    customTabList.value,
    map((tab): DropdownMenuItem | undefined => {
      const tagLabel = tab.label
      if (!tagLabel) {
        return undefined
      }

      const checked = modelTabMap.value[key]?.includes(tagLabel) ?? false
      const list = modelTabMap.value[key] ?? []

      return {
        type: 'checkbox',
        label: tagLabel,
        checked,
        onUpdateChecked(checked: boolean) {
          if (checked) {
            if (!modelTabMap.value[key]) {
              modelTabMap.value[key] = []
            }

            modelTabMap.value[key]?.push(tagLabel)
          }
          else {
            modelTabMap.value[key] = list.filter((tab) => tab !== tagLabel)
            if (modelTabMap.value[key].length === 0) {
              delete modelTabMap.value[key]
            }
          }
        },
        // onSelect(e: Event) {
        //   e.preventDefault()
        // },
      }
    }),
    filter(isTruthy),
    tap((data) => {
      data.unshift({
        type: 'label',
        label: 'Add to Tab',
        class: 'text-xs opacity-50',
      })

      data.push({ type: 'separator' })
      data.push({
        label: 'Clear',
        onSelect() {
          delete modelTabMap.value[key]
        },
      })
    }),
  )
}

const tabList = computed(() => [
  baseTabList,
  ...customTabList.value,
])

const filterOptions = refManualReset(() => reactive({
  keyword: '',
  tagKeyword: '',
  /** 是否包含來自檔名的 tag */
  includeTagFromFileName: true,
  /** 過濾邏輯 */
  useAndLogic: false,
}))
watch(rootFsHandle, () => filterOptions.reset())

const scrollAreaBoxRef = useTemplateRef('scrollAreaBoxRef')
const scrollAreaSize = reactive(useElementSize(scrollAreaBoxRef))

const scrollAreaRef = useTemplateRef('scrollAreaRef')
/** 紀錄滾動位置 */
const tabScrollOffsetMap = useStorage<Record<string, number>>('tab-scroll-offset', {})

function tabKey(tabValue: string | undefined) {
  const root = rootFsHandle.value?.name ?? 'no-root'
  return `${root}::${tabValue ?? 'all'}`
}

watch(
  selectedTab,
  async (newTab, oldTab) => {
    const virtualizer = scrollAreaRef.value?.virtualizer
    if (!virtualizer) {
      return
    }

    // 切換前存舊 tab scroll 位置
    if (oldTab) {
      tabScrollOffsetMap.value[tabKey(oldTab)] = virtualizer.scrollOffset ?? 0
    }

    await nextFrame()

    const target = tabScrollOffsetMap.value[tabKey(newTab)] ?? 0
    virtualizer?.scrollToOffset(target, { behavior: 'auto' })
  },
  { flush: 'sync' }
)


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
  return pipe(
    modelFileList.value,
    (list) => {
      if (!filterOptions.value.keyword) {
        return list
      }

      return list.filter((file) =>
        file.path.toLocaleLowerCase().includes(filterOptions.value.keyword.toLocaleLowerCase()),
      )
    },
    (list) => {
      if (selectedTagList.value.length === 0) {
        return list
      }

      return list.filter((file) => {
        if (filterOptions.value.useAndLogic) {
          return selectedTagList.value.every((tag) => file.path.includes(tag))
        }
        return selectedTagList.value.some((tag) => file.path.includes(tag))
      })
    },
    (list) => {
      if (selectedTab.value === baseTabList.value) {
        return list
      }

      return list.filter((file) => {
        const key = `${rootFsHandle.value?.name}/${file.path}`
        const tagList = modelTabMap.value[key]

        return !!tagList?.includes(selectedTab.value)
      })
    },
    map((datum) => {
      const key = `${rootFsHandle.value?.name}/${datum.path}`
      return {
        ...datum,
        hasTab: !!modelTabMap.value[key]?.length,
      }
    }),
  )
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
      statusMessage.reset()
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
