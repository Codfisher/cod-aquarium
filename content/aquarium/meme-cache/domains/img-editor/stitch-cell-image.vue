<template>
  <img
    ref="imgRef"
    :src="cell.url"
    class="absolute inset-0 w-full h-full select-none rounded-none! border-none!"
    :class="[
      objectFitClass,
      draggable ? 'cursor-move touch-none pointer-events-auto' : 'pointer-events-none',
    ]"
    :style="objectPositionStyle"
    draggable="false"
  >
</template>

<script setup lang="ts">
import type { StitchCell } from './stitch-layout'
import { toRef, useTemplateRef } from 'vue'
import { useStitchCellCrop } from './use-stitch-cell-crop'

interface Props {
  cell: StitchCell;
}
const props = defineProps<Props>()

const emit = defineEmits<{
  /** 拖曳中即時觸發，focalX / focalY 皆為 0~100 */
  reposition: [focalX: number, focalY: number];
  /** 裁切模式下圖片吃走了 pointerdown，點擊（非拖曳）要靠這個事件轉發給畫板補開文字 */
  tap: [clientX: number, clientY: number];
}>()

const imgRef = useTemplateRef('imgRef')

const { objectFitClass, objectPositionStyle, draggable } = useStitchCellCrop({
  setting: toRef(() => props.cell),
  elementRef: imgRef,
  onReposition: (focalX, focalY) => emit('reposition', focalX, focalY),
  onTap: (clientX, clientY) => emit('tap', clientX, clientY),
})
</script>
