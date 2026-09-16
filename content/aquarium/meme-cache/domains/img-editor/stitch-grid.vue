<template>
  <div class="stitch-grid w-[80vw] md:max-w-[50vw] flex flex-col pointer-events-none">
    <!--
      根節點前不能放註解：開發模式會保留註解，元件就成了多根節點，
      外層用 useElementSize 量它時 $el 會是註解節點而非元素。

      整個格線都不接事件，點擊才會穿透到畫板加文字，與原本單張底圖的行為一致。
      只有格子上的操作按鈕重新開啟事件
    -->
    <div
      v-for="(row, rowIndex) in rowList"
      :key="rowIndex"
      class="flex"
    >
      <div
        v-for="cell in row"
        :key="cell.index"
        class="relative min-w-0 shrink-0"
        :style="getCellStyle(cell.index, cell.widthPercent)"
      >
        <slot
          v-if="cell.index === 0"
          name="base"
        />

        <template v-else-if="getCell(cell.index)">
          <stitch-cell-image
            :cell="getCell(cell.index)!"
            @reposition="(focalX, focalY) => emit('reposition', cell.index - 1, focalX, focalY)"
            @tap="(clientX, clientY) => emit('tap', clientX, clientY)"
          />
        </template>

        <!--
          空格子照底圖原始的長寬比留位，選圖後才不會整塊版面跳動（不理會底圖自己的
          填滿比例：空格子只是暫時佔位，用底圖裁切後的形狀去猜反而更容易誤導）。
          三個來源直接列出來，不必先點一下「點此選圖」才彈出選單 —— 那個選單是掛在整塊
          巨大的按鈕上，位置常常跑到按鈕最下緣，離使用者點擊的地方很遠，不如直接攤開
        -->
        <div
          v-else
          class="relative w-full"
          :style="{ aspectRatio: props.baseCell.aspectRatio }"
        >
          <div
            class="absolute inset-1 flex flex-col items-center justify-center gap-1 p-2 rounded border-2 border-dashed border-gray-400 bg-white/60 dark:bg-black/30 pointer-events-auto"
            data-capture-exclude
          >
            <UIcon
              name="i-material-symbols:add-photo-alternate-outline-rounded"
              class="size-6 text-gray-500 mb-1"
            />

            <UButton
              v-for="item in getSourceItemList(cell.index - 1)"
              :key="item.label"
              :icon="item.icon"
              :label="item.label"
              variant="subtle"
              color="neutral"
              size="xs"
              block
              class="max-w-40"
              @click="(event) => item.onSelect?.(event)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { CSSProperties } from 'vue'
import type { StitchCell, StitchLayoutOption, StitchSourceType } from './stitch-layout'
import { computed } from 'vue'
import StitchCellImage from './stitch-cell-image.vue'
import {
  chunkStitchRowList,
  getStitchCellBoxAspectRatio,
  getStitchRowCellWidthPercentList,
} from './stitch-layout'

interface Props {
  layout: StitchLayoutOption;
  /** 底圖以外的格子，undefined 表示尚未選圖 */
  cellList: Array<StitchCell | undefined>;
  /**
   * 底圖比照其餘格子的資料形狀，可以套用一樣的填滿比例／裁切／背景色，
   * 版面才不會因為底圖沒有這些設定而對不齊。key、url 皆為占位值，不會被讀取
   */
  baseCell: StitchCell;
}
const props = defineProps<Props>()

const emit = defineEmits<{
  /** 索引對應 cellList，底圖不算在內；只有空格子會觸發，已有圖片的格子改走畫板下方的工具列 */
  fill: [index: number, sourceType: StitchSourceType];
  reposition: [index: number, focalX: number, focalY: number];
  /** 裁切模式的格子吃走了 pointer 事件，點擊要靠這個事件補發給畫板加文字 */
  tap: [clientX: number, clientY: number];
}>()

function getCell(index: number) {
  return props.cellList[index - 1]
}

function getCellAspectRatio(index: number): number {
  if (index === 0)
    return getStitchCellBoxAspectRatio(props.baseCell)

  const cell = getCell(index)
  return cell ? getStitchCellBoxAspectRatio(cell) : props.baseCell.aspectRatio
}

interface RowCell {
  index: number;
  /** 這一格在該列該佔的寬度百分比，靠它讓同列格子等高 */
  widthPercent: number;
}

const rowList = computed<RowCell[][]>(() => {
  const indexRowList = chunkStitchRowList(props.cellList.length, props.layout)

  return indexRowList.map((indexList) => {
    const widthPercentList = getStitchRowCellWidthPercentList(indexList.map(getCellAspectRatio))
    return indexList.map((index, i) => ({ index, widthPercent: widthPercentList[i]! }))
  })
})

/**
 * 底圖跟其餘已選圖的格子一視同仁，都給明確的 aspect-ratio 與背景色：
 * 底圖也可能套用非原始比例的填滿設定，格子高度不能只靠底圖元素自己的原生比例撐開。
 * 空格子則維持原樣（沒有格子資料，靠外層自己在樣板裡用底圖原始比例留位）
 */
function getCellStyle(index: number, widthPercent: number): CSSProperties {
  const cell = index === 0 ? props.baseCell : getCell(index)

  return {
    width: `${widthPercent}%`,
    aspectRatio: cell ? getCellAspectRatio(index) : undefined,
    // 完整顯示模式比例不吻合時會露出這層背景，其餘情況圖片蓋滿格子，設了也看不到
    backgroundColor: cell?.backgroundColor,
  }
}

function getSourceItemList(cellIndex: number): DropdownMenuItem[] {
  return [
    {
      icon: 'i-material-symbols:upload-rounded',
      label: '上傳圖片',
      onSelect: () => emit('fill', cellIndex, 'upload'),
    },
    {
      icon: 'i-material-symbols:content-paste-rounded',
      label: '來自剪貼簿',
      onSelect: () => emit('fill', cellIndex, 'clipboard'),
    },
    {
      icon: 'i-material-symbols:image-search-outline',
      label: '選擇迷因',
      onSelect: () => emit('fill', cellIndex, 'meme'),
    },
  ]
}
</script>
