<template>
  <div class="rounded flex flex-col w-30 aspect-square ">
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
import { onMounted, onUnmounted, ref } from 'vue'
import { useThumbnailGenerator } from '../composables/use-thumbnail-generator'

const props = defineProps<{
  modelFile: ModelFile;
  rootHandle: FileSystemDirectoryHandle;
}>()

const { generateThumbnail } = useThumbnailGenerator(props.rootHandle)
const thumbnailSrc = ref('')
const isLoading = ref(false)

onMounted(() => {
  loadThumbnail()
})

async function loadThumbnail() {
  try {
    isLoading.value = true
    const base64 = await generateThumbnail(props.modelFile)
    thumbnailSrc.value = base64 ?? ''
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
