<template>
  <div class="chamfer-4 p-1 bg-gray-200 ">
    <div class="bg-white chamfer-3.5 p-3">
      <u-carousel
        v-slot="{ item }"
        :items="blockThumbnailList"
        :ui="{
          item: 'basis-auto ps-2',
          container: 'ms-0',
        }"
        drag-free
      >
        <div
          class="size-22 chamfer-3 p-0.5 bg-gray-100 cursor-pointer select-none"
          @click="handleClick(item.type)"
        >
          <img
            :src="item.thumbnail"
            class="border-none! bg-white chamfer-2.5"
          >
        </div>
      </u-carousel>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BlockType } from './type'
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
