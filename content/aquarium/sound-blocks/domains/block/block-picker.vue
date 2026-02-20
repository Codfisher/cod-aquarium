<template>
  <div class="chamfer-4 p-1 bg-gray-200">
    <div class="flex flex-wrap gap-1 bg-white chamfer-3 p-3">
      <div
        v-for="(item) in blockThumbnailList"
        :key="item.type"
        class="size-22 chamfer-4 p-0.5 bg-gray-100 cursor-pointer"
        @click="handleClick(item.type)"
      >
        <img
          :src="item.thumbnail"
          class="border-none! bg-white chamfer-3.5"
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BlockType } from './builder/data'
import { computedAsync } from '@vueuse/core'
import { get, set } from 'idb-keyval'
import { onBeforeUnmount } from 'vue'
import { useThumbnailGenerator } from '../../composables/use-thumbnail-generator'
import { blockTypeList } from './builder/data'

const emit = defineEmits<{
  select: [blockType: BlockType];
}>()

const { generateThumbnail } = useThumbnailGenerator()

const blockThumbnailList = computedAsync(async () => {
  const tasks = blockTypeList.map(async (blockType) => {
    const cache = await get(`block-thumbnail-${blockType}`)
    if (cache) {
      return {
        type: blockType,
        thumbnail: URL.createObjectURL(cache),
      }
    }

    const imgBlob = await generateThumbnail(blockType)
    await set(`block-thumbnail-${blockType}`, imgBlob)

    return {
      type: blockType,
      thumbnail: URL.createObjectURL(imgBlob),
    }
  })

  return Promise.all(tasks)
}, [])

onBeforeUnmount(() => {
  blockThumbnailList.value.forEach((blockThumbnail) => {
    URL.revokeObjectURL(blockThumbnail.thumbnail)
  })
})

function handleClick(blockType: BlockType) {
  emit('select', blockType)
}
</script>

<style scoped lang="sass">
</style>
