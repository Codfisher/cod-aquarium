<template>
  <div class="frame-timeline flex flex-col w-full gap-2 px-3 py-2 bg-white/95 dark:bg-black/95 border-t border-gray-300 dark:border-gray-600">
    <div class="flex items-center gap-1">
      <u-button
        :icon="props.playing
          ? 'i-material-symbols:pause-rounded'
          : 'i-material-symbols:play-arrow-rounded'"
        :aria-label="props.playing ? '暫停' : '播放'"
        color="neutral"
        variant="ghost"
        @click="emit('togglePlay')"
      />

      <span class="text-xs opacity-60 tabular-nums">
        第 {{ props.frameIndex + 1 }} / {{ props.frameCount }} 格
      </span>

      <div class="flex-1" />

      <u-button
        :icon="expanded
          ? 'i-material-symbols:keyboard-arrow-down-rounded'
          : 'i-material-symbols:keyboard-arrow-up-rounded'"
        :aria-label="expanded ? '收合時間軸' : '展開時間軸'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="expanded = !expanded"
      />
    </div>

    <div
      v-if="expanded"
      class="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 items-center"
    >
      <div />
      <!-- 尺規本身就是拖曳區，手機上目標夠大 -->
      <div
        ref="rulerRef"
        class="ruler relative h-7 rounded bg-gray-200 dark:bg-gray-700 touch-none cursor-pointer"
        @pointerdown="handleRulerDown"
      >
        <div
          class="playhead absolute top-0 bottom-0 w-0.5 bg-primary pointer-events-none"
          :style="{ left: `${toPercent(props.frameIndex)}%` }"
        />
      </div>

      <template v-if="props.trackList.length">
        <template
          v-for="track in props.trackList"
          :key="track.key"
        >
          <button
            type="button"
            class="label text-left text-[12px] leading-tight truncate px-1 py-2 rounded"
            :class="track.isEditing ? 'text-primary font-bold' : 'opacity-70'"
            @click="emit('editText', track.key)"
          >
            {{ track.label }}
          </button>

          <div class="track relative h-9 rounded bg-gray-200 dark:bg-gray-700">
            <div
              class="bar absolute inset-y-0 rounded bg-primary/70 touch-none cursor-grab flex items-center justify-between"
              :class="{ 'ring-2 ring-gray-900 dark:ring-white': track.isEditing }"
              :style="{
                left: `${toPercent(track.frameRange[0])}%`,
                width: `${toPercent(track.frameRange[1] - track.frameRange[0]) || 1}%`,
              }"
              @pointerdown="handleBarDown($event, track, 'move')"
            >
              <!-- 把手做寬一點，手指才抓得到 -->
              <span
                class="handle h-full w-5 rounded-l bg-primary cursor-ew-resize touch-none"
                @pointerdown.stop="handleBarDown($event, track, 'start')"
              />
              <span
                class="handle h-full w-5 rounded-r bg-primary cursor-ew-resize touch-none"
                @pointerdown.stop="handleBarDown($event, track, 'end')"
              />
            </div>
          </div>
        </template>
      </template>

      <div
        v-else
        class="col-span-2 text-[12px] opacity-50 py-2 text-center"
      >
        在圖片上點一下加入文字，就能在這裡調整出現的區間
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { ref, shallowRef, useTemplateRef } from 'vue'

export interface TimelineTrack {
  key: string;
  label: string;
  frameRange: [number, number];
  isEditing: boolean;
}

interface Props {
  frameCount: number;
  frameIndex: number;
  playing: boolean;
  trackList: TimelineTrack[];
}
const props = defineProps<Props>()

const emit = defineEmits<{
  seekFrame: [frameIndex: number];
  updateRange: [key: string, frameRange: [number, number]];
  select: [key: string];
  /** 點文字標籤即選取並開啟該段文字的設定面板 */
  editText: [key: string];
  togglePlay: [];
}>()

const expanded = ref(true)
const rulerRef = useTemplateRef('rulerRef')

/** 最後一格對應 100%，單格動圖則一律視為 0 */
function toPercent(frameIndex: number) {
  const lastIndex = props.frameCount - 1
  return lastIndex > 0 ? (frameIndex / lastIndex) * 100 : 0
}

/** 由指標位置換算影格，並吸附到整數格 */
function toFrameIndex(clientX: number) {
  const rect = rulerRef.value?.getBoundingClientRect()
  const lastIndex = props.frameCount - 1
  if (!rect || rect.width <= 0 || lastIndex <= 0)
    return 0

  const ratio = (clientX - rect.left) / rect.width
  return Math.min(lastIndex, Math.max(0, Math.round(ratio * lastIndex)))
}

type DragMode = 'move' | 'start' | 'end'

interface DragState {
  key: string;
  mode: DragMode;
  originFrameIndex: number;
  originRange: [number, number];
}
const dragState = shallowRef<DragState>()

function handleRulerDown(event: PointerEvent) {
  const frameIndex = toFrameIndex(event.clientX)
  dragState.value = {
    key: '',
    mode: 'move',
    originFrameIndex: frameIndex,
    originRange: [frameIndex, frameIndex],
  }
  emit('seekFrame', frameIndex)
}

function handleBarDown(event: PointerEvent, track: TimelineTrack, mode: DragMode) {
  dragState.value = {
    key: track.key,
    mode,
    originFrameIndex: toFrameIndex(event.clientX),
    originRange: [...track.frameRange],
  }

  emit('select', track.key)
  emit('seekFrame', mode === 'end' ? track.frameRange[1] : track.frameRange[0])
}

// 指標可能滑出元素外，故監聽整個視窗，拖曳才不會半途斷掉
useEventListener(window, 'pointermove', (event: PointerEvent) => {
  const state = dragState.value
  if (!state)
    return

  event.preventDefault()
  const frameIndex = toFrameIndex(event.clientX)

  // 尺規拖曳只移動播放頭
  if (!state.key) {
    emit('seekFrame', frameIndex)
    return
  }

  const lastIndex = props.frameCount - 1
  const [originStart, originEnd] = state.originRange

  if (state.mode === 'start') {
    const start = Math.min(frameIndex, originEnd)
    emit('updateRange', state.key, [start, originEnd])
    emit('seekFrame', start)
    return
  }

  if (state.mode === 'end') {
    const end = Math.max(frameIndex, originStart)
    emit('updateRange', state.key, [originStart, end])
    emit('seekFrame', end)
    return
  }

  // 整段平移時維持長度，撞到頭尾就停住
  const offset = Math.min(
    Math.max(frameIndex - state.originFrameIndex, -originStart),
    lastIndex - originEnd,
  )
  emit('updateRange', state.key, [originStart + offset, originEnd + offset])
  emit('seekFrame', originStart + offset)
})

useEventListener(window, 'pointerup', () => {
  dragState.value = undefined
})
</script>
