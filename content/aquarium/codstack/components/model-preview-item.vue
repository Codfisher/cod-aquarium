<template>
  <div
    class="rounded flex flex-col aspect-square"
    :style="{ width: size }"
  >
    <div class="flex-1 bg-gray-100 rounded flex items-center justify-center overflow-hidden relative">
      <div
        v-if="isLoading"
        class="animate-pulse text-gray-400 text-xs"
      >
        Generating...
      </div>

      <img
        v-else-if="thumbnailSrc"
        :src="thumbnailSrc"
        class="w-full h-full object-contain"
        alt="Model thumbnail"
      >

      <div
        v-else
        class="text-gray-300"
      >
        <span class="icon-[material-symbols--deployed-code]" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModelFile } from '../type'
import { computedAsync, until, useObjectUrl } from '@vueuse/core'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useThumbnailGenerator } from '../composables/use-thumbnail-generator'

const props = withDefaults(defineProps<{
  modelFile: ModelFile;
  rootHandle: FileSystemDirectoryHandle;
  size?: string;
}>(), {
  size: '120px',
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

async function loadThumbnail() {
  try {
    isLoading.value = true

    const cachedData = await getThumbnailFile(cacheKey.value)
    if (cachedData) {
      thumbnailData.value = cachedData
      return
    }

    thumbnailData.value = await generateThumbnail(props.modelFile)
    await saveThumbnail(cacheKey.value, thumbnailData.value)
  }
  catch (e) {
    console.error('🚀 ~ loadThumbnail ~ e:', e)
    console.error(`Failed to load thumbnail for ${props.modelFile.name}`)
  }
  finally {
    isLoading.value = false
  }
}
</script>
