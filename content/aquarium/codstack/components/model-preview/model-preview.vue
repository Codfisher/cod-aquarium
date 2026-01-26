<template>
  <div
    ref="cardRef"
    class="rounded p-2 flex flex-col gap-2 w-40 h-48 "
  >
    <div class="flex-1 bg-gray-100 rounded flex items-center justify-center overflow-hidden relative">
      <div v-if="isLoading" class="animate-pulse text-gray-400 text-xs">
        Generating...
      </div>

      <img
        v-else-if="thumbnailSrc"
        :src="thumbnailSrc"
        class="w-full h-full object-contain"
        alt="Model thumbnail"
      >

      <div v-else class="text-gray-300">
        <span class="icon-[material-symbols--deployed-code]" />
      </div>
    </div>

    <div class="text-xs truncate font-medium">
      {{ file.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useThumbnailGenerator } from './use-thumbnail-generator'

const props = defineProps<{
  file: File;
}>()

const { generateThumbnail } = useThumbnailGenerator()
const cardRef = ref<HTMLElement | null>(null)
const thumbnailSrc = ref<string | null>(null)
const isLoading = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  // 使用 IntersectionObserver 實作 Lazy Loading
  // 只有當元件進入畫面時，才去排隊生成縮圖
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && !thumbnailSrc.value && !isLoading.value) {
      loadThumbnail()
      // 觸發後就取消觀察，避免重複觸發
      observer?.disconnect()
    }
  })

  if (cardRef.value) {
    observer.observe(cardRef.value)
  }
})

onUnmounted(() => {
  observer?.disconnect()
})

async function loadThumbnail() {
  try {
    isLoading.value = true
    // 呼叫共用的產生器，這裡會自動排隊
    const base64 = await generateThumbnail(props.file)
    thumbnailSrc.value = base64
  }
  catch (e) {
    console.error(`Failed to load thumbnail for ${props.file.name}`)
  }
  finally {
    isLoading.value = false
  }
}
</script>
