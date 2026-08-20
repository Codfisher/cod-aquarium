<template>
  <div
    class="flex flex-col px-4"
    v-bind="containerProps"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="{ data: chunkData, index } in virtualList"
        :key="index"
        class="flex justify-center items-center gap-2 pb-4 h-[30vh]"
      >
        <div
          v-for="data, y in chunkData"
          :key="y"
          class="flex-1 item flex justify-center items-center gap-2 h-full "
        >
          <div
            class="group relative flex bg-gray-200 cursor-pointer rounded-xl h-full flex-1"
            @click="handleClick(data)"
          >
            <img
              :src="getImgSrc(data)"
              loading="lazy"
              class="object-contain h-full w-full border-none"
              @mouseenter="playAnimated(data)"
              @mouseleave="pauseAnimated(data)"
              @error="handleImgError(data)"
            >

            <!-- 文字最小只能到 12px，縮不下來，改用 icon 才省得了空間 -->
            <u-icon
              v-if="data.animated && props.animatedBadgeVisible"
              name="i-material-symbols:play-arrow-rounded"
              aria-label="動圖"
              class="absolute bottom-1 left-1 size-5 rounded-full bg-black/50 text-white"
            />

            <u-button
              :icon="props.favoriteFileSet.has(data.file)
                ? 'i-material-symbols:favorite-rounded'
                : 'i-material-symbols:favorite-outline-rounded'"
              :aria-label="props.favoriteFileSet.has(data.file) ? '取消收藏' : '加入收藏'"
              color="neutral"
              variant="ghost"
              size="sm"
              class="favorite-button absolute top-1 right-1 rounded-full bg-black/40 text-white duration-200 hover:bg-black/60"
              :class="{
                'text-red-400': props.favoriteFileSet.has(data.file),
              }"
              @click.stop="emit('toggleFavorite', data)"
            />
          </div>

          <div
            v-if="props.detailVisible"
            class="flex-[2] text-xs w-full md:w-[30vw] max-w-[80vw]"
          >
            <div class=" select-all text-xs">
              {{ data.file }}
            </div>

            <div class="mt-2">
              {{ data.describe }}
            </div>

            <div class="mt-2">
              ocr: {{ data.ocr }}
            </div>
            <div class="mt-2">
              keyword: {{ data.keyword }}
            </div>
            <div class="mt-2">
              emotion: {{ data.emotion }}
            </div>
            <div class="mt-2">
              blurLevel: {{ data.blurLevel }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemeData } from '../meme/type'
import { useMediaQuery, useVirtualList, useWindowSize } from '@vueuse/core'
import { chunk } from 'remeda'
import { computed, reactive, ref } from 'vue'

interface Props {
  list: MemeData[];
  detailVisible?: boolean;
  favoriteFileSet?: Set<string>;
  /** 整份清單都是動圖時（例如只顯示動圖），標記反而是雜訊 */
  animatedBadgeVisible?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  detailVisible: false,
  favoriteFileSet: () => new Set<string>(),
  animatedBadgeVisible: true,
})
const emit = defineEmits<{
  select: [data: MemeData];
  toggleFavorite: [data: MemeData];
}>()

const windowSize = reactive(useWindowSize())

/** 沒有游標的裝置一屏圖片少，動圖直接播；桌機一屏十幾張全播會吃滿 CPU */
const hoverCapable = useMediaQuery('(hover: hover)')
const playingFileSet = ref(new Set<string>())
/** 首格圖缺檔時退回動圖本身，免得整格破圖 */
const posterMissingSet = ref(new Set<string>())

function getImgSrc(data: MemeData): string {
  if (!data.animated)
    return `/memes/${data.file}`

  const usePoster = hoverCapable.value
    && !playingFileSet.value.has(data.file)
    && !posterMissingSet.value.has(data.file)

  return usePoster
    ? `/meme-posters/${data.file}`
    : `/memes/${data.file}`
}

function playAnimated(data: MemeData) {
  if (!data.animated)
    return

  playingFileSet.value = new Set(playingFileSet.value).add(data.file)
}

function pauseAnimated(data: MemeData) {
  if (!data.animated || !playingFileSet.value.has(data.file))
    return

  const nextSet = new Set(playingFileSet.value)
  nextSet.delete(data.file)
  playingFileSet.value = nextSet
}

function handleImgError(data: MemeData) {
  if (!data.animated || posterMissingSet.value.has(data.file))
    return

  posterMissingSet.value = new Set(posterMissingSet.value).add(data.file)
}

const chunkList = computed(() => {
  if (props.detailVisible) {
    return chunk(props.list, 1)
  }

  if (windowSize.width >= 1280) {
    return chunk(props.list, 5)
  }
  if (windowSize.width >= 1024) {
    return chunk(props.list, 4)
  }
  if (windowSize.width >= 768) {
    return chunk(props.list, 3)
  }

  return chunk(props.list, 2)
})
const { list: virtualList, containerProps, wrapperProps, scrollTo } = useVirtualList(
  chunkList,
  {
    itemHeight: windowSize.height * 0.3,
  },
)

defineExpose({ scrollTo })

function handleClick(data: MemeData) {
  emit('select', data)
}
</script>

<style scoped lang="sass">
// .item
//   content-visibility: auto
//   contain-intrinsic-size: 30vh
</style>
