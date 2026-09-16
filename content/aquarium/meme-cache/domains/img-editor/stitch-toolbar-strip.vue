<template>
  <div
    v-if="props.layout.value !== 'single'"
    class="stitch-toolbar-strip w-[80vw] md:max-w-[50vw] flex flex-col gap-1"
  >
    <div class="text-xs opacity-50">
      拼接圖片設定
    </div>

    <div class="flex flex-wrap gap-2">
      <!--
        底圖跟其餘格子共用同一套填滿設定，版面才不會因為底圖沒有這些設定而對不齊。
        底圖是原本要拼接的主圖，不提供更換來源或移除，只有填滿比例與背景色可調
      -->
      <div class="flex items-center gap-1 p-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-black/40">
        <img
          :src="baseThumbnailUrl"
          class="size-8 rounded object-cover shrink-0"
        >
        <span class="text-xs opacity-50 px-1 shrink-0">
          原圖
        </span>

        <stitch-cell-fill-settings
          :cell="baseCell"
          @set-fill-value="(fillValue) => emit('setBaseFillValue', fillValue)"
          @set-fit-mode="(fitMode) => emit('setBaseFitMode', fitMode)"
          @set-background-color="(color) => emit('setBaseBackgroundColor', color)"
        />
      </div>

      <div
        v-for="{ index, cell } in filledCellList"
        :key="cell.key"
        class="flex items-center gap-1 p-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-black/40"
      >
        <img
          :src="cell.url"
          class="size-8 rounded object-cover shrink-0"
        >

        <UDropdownMenu
          :items="[sourceItemList(index)]"
          :ui="{ content: 'z-70', item: 'p-2' }"
        >
          <UButton
            icon="i-material-symbols:sync-rounded"
            aria-label="更換圖片"
            title="更換圖片"
            variant="ghost"
            color="neutral"
            size="xs"
          />
        </UDropdownMenu>

        <stitch-cell-fill-settings
          :cell="cell"
          @set-fill-value="(fillValue) => emit('setFillValue', index, fillValue)"
          @set-fit-mode="(fitMode) => emit('setFitMode', index, fitMode)"
          @set-background-color="(color) => emit('setBackgroundColor', index, color)"
        />

        <UButton
          icon="i-lucide-x"
          aria-label="移除圖片"
          title="移除圖片"
          variant="ghost"
          color="error"
          size="xs"
          @click="emit('clear', index)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { StitchCell, StitchLayoutOption, StitchSourceType } from './stitch-layout'
import { computed } from 'vue'
import StitchCellFillSettings from './stitch-cell-fill-settings.vue'

interface Props {
  layout: StitchLayoutOption;
  /** 版面固定佔第一格的主圖，形狀比照拼接格子，才能套用同一套填滿設定 */
  baseCell: StitchCell;
  /** 底圖縮圖來源，用來在這裡顯示一張小圖辨識 */
  baseThumbnailUrl: string;
  /** 底圖以外的格子，undefined 表示尚未選圖 */
  cellList: Array<StitchCell | undefined>;
}
const props = defineProps<Props>()

const emit = defineEmits<{
  fill: [index: number, sourceType: StitchSourceType];
  clear: [index: number];
  setFillValue: [index: number, fillValue: string];
  setFitMode: [index: number, fitMode: 'cover' | 'contain'];
  setBackgroundColor: [index: number, color: string];
  setBaseFillValue: [fillValue: string];
  setBaseFitMode: [fitMode: 'cover' | 'contain'];
  setBaseBackgroundColor: [color: string];
}>()

/** 只列出已選圖的格子，空格子留在畫板內原地點選，不必在這裡重複 */
const filledCellList = computed(() => props.cellList
  .map((cell, index) => cell ? { index, cell } : undefined)
  .filter((item): item is { index: number; cell: StitchCell } => Boolean(item)))

function sourceItemList(index: number): DropdownMenuItem[] {
  return [
    {
      icon: 'i-material-symbols:upload-rounded',
      label: '上傳圖片',
      onSelect: () => emit('fill', index, 'upload'),
    },
    {
      icon: 'i-material-symbols:content-paste-rounded',
      label: '來自剪貼簿',
      onSelect: () => emit('fill', index, 'clipboard'),
    },
    {
      icon: 'i-material-symbols:image-search-outline',
      label: '選擇迷因',
      onSelect: () => emit('fill', index, 'meme'),
    },
  ]
}
</script>
