<template>
  <UPopover :ui="{ content: 'z-70' }">
    <UButton
      icon="i-lucide-settings-2"
      aria-label="填滿設定"
      title="填滿比例與裁切設定"
      variant="ghost"
      color="neutral"
      size="xs"
    />

    <template #content>
      <div class="flex flex-col gap-3 p-3 w-56">
        <div>
          <div class="text-xs opacity-50 mb-1">
            填滿比例
          </div>
          <div class="flex flex-wrap gap-1">
            <UButton
              v-for="item in STITCH_FILL_OPTION_LIST"
              :key="item.value"
              :label="item.label"
              size="xs"
              :variant="getStitchFillOption(cell.fillValue).value === item.value ? 'solid' : 'outline'"
              :color="getStitchFillOption(cell.fillValue).value === item.value ? 'primary' : 'neutral'"
              @click="emit('setFillValue', item.value)"
            />
          </div>
        </div>

        <div v-if="getStitchFillOption(cell.fillValue).ratio !== null">
          <div class="text-xs opacity-50 mb-1">
            比例不吻合時
          </div>
          <UFieldGroup size="xs">
            <UButton
              label="裁切填滿"
              :variant="(cell.fitMode ?? DEFAULT_STITCH_FIT_MODE) === 'cover' ? 'solid' : 'outline'"
              :color="(cell.fitMode ?? DEFAULT_STITCH_FIT_MODE) === 'cover' ? 'primary' : 'neutral'"
              @click="emit('setFitMode', 'cover')"
            />
            <UButton
              label="完整顯示"
              :variant="(cell.fitMode ?? DEFAULT_STITCH_FIT_MODE) === 'contain' ? 'solid' : 'outline'"
              :color="(cell.fitMode ?? DEFAULT_STITCH_FIT_MODE) === 'contain' ? 'primary' : 'neutral'"
              @click="emit('setFitMode', 'contain')"
            />
          </UFieldGroup>
        </div>
      </div>
    </template>
  </UPopover>

  <!--
    只有完整顯示又比例不吻合時才會露出背景，其餘情況設定了也沒有可見效果。
    Nuxt UI 明文規定 tooltip 不能包互動內容（按鈕、連結），UPopover 本身的
    trigger 又是 as-child 包一個不畫 DOM 的 PopoverRoot，兩層疊在一起找不到
    節點可以掛 hover 監聽器，tooltip 包 popover 這條路線本來就走不通。

    改成兩個「互斥」的 UPopover：能設定時走一般點擊版，不能設定時換成
    mode="hover" 的版本單純顯示原因，兩者都在文件支援的用法內。

    能設定時額外補上原生 title：這個按鈕本身可點擊，不適合再疊一個
    hover popover 說明用途（兩者都想接手 hover 事件，會互相干擾），
    原生 title 走瀏覽器內建機制，不牽涉 Nuxt UI 的 overlay 系統，最單純
  -->
  <UPopover
    v-if="canStitchCellShowBackground(cell)"
    :ui="{ content: 'z-70' }"
  >
    <UButton
      icon="i-material-symbols:format-color-fill-rounded"
      aria-label="背景顏色"
      title="設定背景顏色（比例不吻合時留白處顯示的顏色）"
      variant="ghost"
      color="neutral"
      size="xs"
    />

    <template #content>
      <UColorPicker
        :model-value="cell.backgroundColor ?? DEFAULT_STITCH_BACKGROUND_COLOR"
        size="xs"
        class="p-2"
        @update:model-value="(value) => value && emit('setBackgroundColor', value)"
      />
    </template>
  </UPopover>

  <UPopover
    v-else
    mode="hover"
    :open-delay="0"
    :ui="{ content: 'z-70' }"
  >
    <UButton
      icon="i-material-symbols:format-color-fill-rounded"
      aria-label="背景顏色（圖片已蓋滿格子，沒有露出背景的地方）"
      variant="ghost"
      color="neutral"
      size="xs"
      aria-disabled="true"
      class="opacity-50 cursor-not-allowed"
    />

    <template #content>
      <div class="px-2 py-1.5 text-xs max-w-48">
        圖片已蓋滿格子，沒有露出背景的地方
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { StitchCell } from './stitch-layout'
import {
  canStitchCellShowBackground,
  DEFAULT_STITCH_BACKGROUND_COLOR,
  DEFAULT_STITCH_FIT_MODE,
  getStitchFillOption,
  STITCH_FILL_OPTION_LIST,
} from './stitch-layout'

interface Props {
  /** 拼接格子或底圖皆可；底圖用的是套了同一形狀的占位物件，key、url 不會被讀取 */
  cell: StitchCell;
}
defineProps<Props>()

const emit = defineEmits<{
  setFillValue: [fillValue: string];
  setFitMode: [fitMode: 'cover' | 'contain'];
  setBackgroundColor: [color: string];
}>()
</script>
