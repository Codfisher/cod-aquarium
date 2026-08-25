<template>
  <div
    class="relative flex flex-col px-4"
    v-bind="containerProps"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="{ data: row, index } in virtualList"
        :key="index"
        class="flex justify-center items-center gap-2 pb-4"
        :style="{ height: `${rowHeightList[index] ?? 0}px` }"
      >
        <!-- 廣告列在這裡只負責佔位，版位本身掛在下方的絕對定位層 -->
        <template v-if="row.type === 'image'">
          <div
            v-for="data, y in row.dataList"
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
              <UIcon
                v-if="data.animated && props.animatedBadgeVisible"
                name="i-material-symbols:play-arrow-rounded"
                aria-label="動圖"
                class="absolute bottom-1 left-1 size-5 rounded-full bg-black/50 text-white"
              />

              <UButton
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
        </template>
      </div>
    </div>

    <!-- 廣告不進虛擬清單，捲出視野也不會被回收重掛，同一版位才不會重複請求 -->
    <div
      v-for="ad in adPositionList"
      :key="ad.adIndex"
      class="absolute left-0 w-full px-4 pb-4"
      :style="{ top: `${ad.top}px`, height: `${ad.height}px` }"
    >
      <feed-ad v-if="mountedAdIndexSet.has(ad.adIndex)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemeData } from '../meme/type'
import { useMediaQuery, useVirtualList, useWindowSize } from '@vueuse/core'
import { chunk } from 'remeda'
import { computed, reactive, ref, watch } from 'vue'
import { AD_ROW_HEIGHT } from '../../constants'
import FeedAd from './feed-ad.vue'

interface Props {
  list: MemeData[];
  detailVisible?: boolean;
  favoriteFileSet?: Set<string>;
  /** 整份清單都是動圖時（例如只顯示動圖），標記反而是雜訊 */
  animatedBadgeVisible?: boolean;
  /** 是否在清單中穿插廣告。選圖 modal 那類挑選情境不該出現廣告，故預設關閉 */
  adVisible?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  detailVisible: false,
  favoriteFileSet: () => new Set<string>(),
  animatedBadgeVisible: true,
  adVisible: false,
})
const emit = defineEmits<{
  select: [data: MemeData];
  toggleFavorite: [data: MemeData];
}>()

/** 第一個版位放在第二列之後。
 * 清單可視高度約兩列半，擺在第二列後首屏就會露出版位的下半截，
 * 使用者不必捲動也知道下面還有東西；放到第三列後則會整個落在摺線下
 */
const AD_FIRST_ROW = 2
/** 之後每隔幾列再插一個 */
const AD_ROW_INTERVAL = 8
/** 版位總數上限。掛越多、沒被看到的比例越高，可視率與單價都會被拖低 */
const AD_MAX_COUNT = 3
/** 距離算繪範圍幾列內才掛載，太早掛會請求到根本不會被看到的廣告，可視率與單價都跟著掉。
 * 虛擬清單本身已有 5 列 overscan，實際提前量約兩個螢幕，足夠讓廣告在進入視野前備妥
 */
const AD_MOUNT_DISTANCE = 3

type ListRow =
  | { type: 'image'; dataList: MemeData[] }
  | { type: 'ad'; adIndex: number }

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

const columnCount = computed(() => {
  if (props.detailVisible)
    return 1

  if (windowSize.width >= 1280)
    return 5
  if (windowSize.width >= 1024)
    return 4
  if (windowSize.width >= 768)
    return 3

  return 2
})

const rowList = computed<ListRow[]>(() => {
  const imageRowList = chunk(props.list, columnCount.value)
  if (!props.adVisible) {
    return imageRowList.map((dataList) => ({ type: 'image', dataList }))
  }

  const result: ListRow[] = []
  let adIndex = 0

  imageRowList.forEach((dataList, index) => {
    result.push({ type: 'image', dataList })

    const countAfterFirstSlot = index + 1 - AD_FIRST_ROW
    const adSlot = countAfterFirstSlot >= 0 && countAfterFirstSlot % AD_ROW_INTERVAL === 0
    if (adSlot && adIndex < AD_MAX_COUNT) {
      result.push({ type: 'ad', adIndex })
      adIndex += 1
    }
  })

  return result
})

const imageRowHeight = computed(() => windowSize.height * 0.3)

const rowHeightList = computed(
  () => rowList.value.map(
    (row) => row.type === 'ad' ? AD_ROW_HEIGHT : imageRowHeight.value,
  ),
)

const { list: virtualList, containerProps, wrapperProps, scrollTo } = useVirtualList(
  rowList,
  {
    itemHeight: (index) => rowHeightList.value[index] ?? imageRowHeight.value,
  },
)

/** 廣告在捲動內容中的座標，供絕對定位層對齊佔位列 */
const adPositionList = computed(() => {
  const result: { adIndex: number; top: number; height: number }[] = []
  let top = 0

  rowList.value.forEach((row, index) => {
    const height = rowHeightList.value[index] ?? 0
    if (row.type === 'ad') {
      result.push({ adIndex: row.adIndex, top, height })
    }
    top += height
  })

  return result
})

const mountedAdIndexSet = ref(new Set<number>())

/** 捲到附近才掛載，且掛上就不再卸載，避免同一版位重複請求 */
watch(virtualList, (renderedList) => {
  const lastIndex = renderedList.at(-1)?.index
  if (lastIndex === undefined)
    return

  const nextSet = new Set(mountedAdIndexSet.value)
  rowList.value.forEach((row, index) => {
    if (row.type === 'ad' && index - lastIndex <= AD_MOUNT_DISTANCE) {
      nextSet.add(row.adIndex)
    }
  })

  if (nextSet.size !== mountedAdIndexSet.value.size) {
    mountedAdIndexSet.value = nextSet
  }
}, { immediate: true })

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
