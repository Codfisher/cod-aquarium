<template>
  <div
    class="rounded flex flex-col aspect-square relative"
    :style="{ width: size }"
  >
    <div class="flex-1 bg-gray-100 rounded flex items-center justify-center overflow-hidden relative">
      <div
        v-if="isLoading"
        class="animate-pulse text-gray-400 text-xs"
      >
        Generating...
      </div>

      <template v-else-if="thumbnailSrc">
        <u-tooltip :text="props.modelFile.path">
          <img
            :src="thumbnailSrc"
            class="w-full h-full object-contain"
            alt="Model thumbnail"
          >
        </u-tooltip>

        <div
          class="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] pointer-events-none opacity-80 text-center text-ellipsis overflow-hidden"
        >
          {{ props.modelFile.name.split('.')[0] }}
        </div>
      </template>

      <div
        v-else
        class="text-gray-300"
      >
        <span class="icon-[material-symbols--deployed-code]" />
      </div>
    </div>

    <slot />
  </div>
</template>

<script setup lang="ts">
import type { ModelFile } from '../type'
import { computedAsync, until, useObjectUrl } from '@vueuse/core'
import { get, set } from 'idb-keyval'
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useThumbnailGenerator } from '../composables/use-thumbnail-generator'

const props = withDefaults(defineProps<{
  modelFile: ModelFile;
  rootHandle: FileSystemDirectoryHandle;
  size?: string;
}>(), {
  size: '120px',
})

const abortController = ref<AbortController>()
onUnmounted(() => {
  abortController.value?.abort()
})

const { generateThumbnail } = useThumbnailGenerator(props.rootHandle)
const thumbnailData = shallowRef<Blob | File>()
const thumbnailSrc = useObjectUrl(thumbnailData)
const isLoading = ref(false)

const cacheKey = computed(() => `thumb-${props.modelFile.path.replace(/[^a-z0-9.-]/gi, '_')}`)

onMounted(() => {
  loadThumbnail()
})

const thumbDirectory = computedAsync(async () => {
  const opfsRoot = await navigator.storage.getDirectory()
  return opfsRoot.getDirectoryHandle('thumbnails', { create: true })
})

async function saveThumbnail(fileName: string, blob: Blob) {
  await until(thumbDirectory).toBeTruthy()

  const fileHandle = await thumbDirectory.value!.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

async function getThumbnailFile(fileName: string) {
  await until(thumbDirectory).toBeTruthy()

  try {
    const fileHandle = await thumbDirectory.value!.getFileHandle(fileName)
    return await fileHandle.getFile()
  }
  catch {
    return undefined
  }
}

async function loadThumbnail(force = false) {
  try {
    isLoading.value = true
    abortController.value = new AbortController()

    if (!force) {
      // 暫時不用 OPFS，方便 devtool 測試
      // const cachedData = await getThumbnailFile(cacheKey.value)
      const cachedData = await get(cacheKey.value)
      if (cachedData) {
        thumbnailData.value = cachedData
        return
      }
    }

    thumbnailData.value = await generateThumbnail(
      props.modelFile,
      { signal: abortController.value.signal },
    )
    // await saveThumbnail(cacheKey.value, thumbnailData.value)
    await set(cacheKey.value, thumbnailData.value)
  }
  catch (e: any) {
    if (e.name === 'AbortError') {
      return
    }
    console.error('🚀 ~ loadThumbnail ~ e:', e)
    console.error(`Failed to load thumbnail for ${props.modelFile.name}`)
  }
  finally {
    isLoading.value = false
  }
}

defineExpose({
  modelFile: props.modelFile,
  loadThumbnail,
})
</script>
