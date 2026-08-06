<template>
  <div class="w-full border border-gray-200 dark:border-gray-700 rounded p-3">
    <div class="text-sm opacity-70 mb-3">
      直接拖動項目調整順序，右側為該筆資料目前的 order 字串。
    </div>

    <div
      ref="list"
      class="flex flex-col gap-2 select-none"
    >
      <div
        v-for="item, index in itemList"
        :key="item.id"
        class="item flex items-center gap-2 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-grab"
        :class="{ 'cursor-grabbing! shadow-lg': item.id === dragState?.id }"
        :style="getItemStyle(index)"
        @pointerdown="startDrag($event, index)"
        @pointermove="updateDrag($event)"
        @pointerup="endDrag()"
        @pointercancel="endDrag()"
      >
        <svg
          class="w-4 h-4 opacity-40 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M9 20q-.825 0-1.412-.587T7 18t.588-1.412T9 16t1.413.588T11 18t-.587 1.413T9 20m6 0q-.825 0-1.412-.587T13 18t.588-1.412T15 16t1.413.588T17 18t-.587 1.413T15 20m-6-6q-.825 0-1.412-.587T7 12t.588-1.412T9 10t1.413.588T11 12t-.587 1.413T9 14m6 0q-.825 0-1.412-.587T13 12t.588-1.412T15 10t1.413.588T17 12t-.587 1.413T15 14M9 8q-.825 0-1.412-.587T7 6t.588-1.412T9 4t1.413.588T11 6t-.587 1.413T9 8m6 0q-.825 0-1.412-.587T13 6t.588-1.412T15 4t1.413.588T17 6t-.587 1.413T15 8" />
        </svg>

        <span class="flex-1 truncate">{{ item.name }}</span>

        <span class="font-mono text-sm opacity-60">{{ item.order }}</span>
      </div>
    </div>

    <div class="flex gap-2 mt-3">
      <button
        class="px-3 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
        :disabled="itemList.length >= maxLength"
        @click="addItem()"
      >
        新增資料
      </button>

      <button
        class="px-3 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
        @click="resetList()"
      >
        重設
      </button>
    </div>

    <div class="mt-3 p-2 rounded bg-gray-100 dark:bg-gray-800 font-mono text-sm break-all">
      [{{ orderText }}]
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { generateKeyBetween } from 'fractional-indexing-jittered'
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'

interface Item {
  id: string;
  name: string;
  order: string;
}

interface DragState {
  id: string;
  fromIndex: number;
  toIndex: number;
  startY: number;
  deltaY: number;
  /** 相鄰項目的間距，單位 px */
  pitch: number;
}

const maxLength = 8
const nameList = ['鱈魚', '鮭魚', '鮪魚', '鯖魚', '秋刀魚', '比目魚', '沙丁魚', '旗魚']

const listElement = useTemplateRef<HTMLElement>('list')
const itemList = ref<Item[]>([])
const dragState = ref<DragState | undefined>()
/** 順序提交的當下，DOM 位置與 transform 會同時變化，需暫時關閉動畫避免項目滑過畫面 */
const transitionEnabled = ref(true)

let idCount = 0

const orderText = computed(
  () => itemList.value.map(({ order }) => `'${order}'`).join(', '),
)

function sortItemList(list: Item[]) {
  return list.sort((a, b) => a.order < b.order ? -1 : 1)
}

function addItem() {
  if (itemList.value.length >= maxLength)
    return

  const lastOrder = itemList.value.at(-1)?.order ?? null
  idCount += 1

  itemList.value = sortItemList([
    ...itemList.value,
    {
      id: `item-${idCount}`,
      name: nameList[itemList.value.length % nameList.length] ?? '不明魚類',
      order: generateKeyBetween(lastOrder, null),
    },
  ])
}

function resetList() {
  itemList.value = []
  idCount = 0

  for (let i = 0; i < 5; i++) {
    addItem()
  }
}

/** 移動資料，並依前後鄰居產生新的 order */
function moveItem(fromIndex: number, toIndex: number) {
  const list = [...itemList.value]
  const [target] = list.splice(fromIndex, 1)
  if (!target)
    return

  list.splice(toIndex, 0, target)

  target.order = generateKeyBetween(
    list[toIndex - 1]?.order ?? null,
    list[toIndex + 1]?.order ?? null,
  )

  itemList.value = sortItemList(list)
}

function getPitch() {
  const elementList = listElement.value?.children
  const first = elementList?.[0]
  const second = elementList?.[1]
  if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement))
    return 0

  return second.offsetTop - first.offsetTop
}

function startDrag(event: PointerEvent, index: number) {
  const item = itemList.value[index]
  const element = event.currentTarget
  if (!item || !(element instanceof HTMLElement))
    return

  element.setPointerCapture(event.pointerId)
  dragState.value = {
    id: item.id,
    fromIndex: index,
    toIndex: index,
    startY: event.clientY,
    deltaY: 0,
    pitch: getPitch(),
  }
}

function updateDrag(event: PointerEvent) {
  const state = dragState.value
  if (!state)
    return

  const deltaY = event.clientY - state.startY
  const step = state.pitch > 0 ? Math.round(deltaY / state.pitch) : 0

  state.deltaY = deltaY
  state.toIndex = Math.min(
    Math.max(state.fromIndex + step, 0),
    itemList.value.length - 1,
  )
}

function endDrag() {
  const state = dragState.value
  if (!state)
    return

  dragState.value = undefined
  if (state.toIndex === state.fromIndex)
    return

  transitionEnabled.value = false
  moveItem(state.fromIndex, state.toIndex)

  // 等 DOM 更新並實際繪製後再恢復動畫
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        transitionEnabled.value = true
      })
    })
  })
}

/** 拖動中的項目跟著手指移動，被擠開的項目則位移一個間距 */
function getItemStyle(index: number): CSSProperties {
  const baseStyle: CSSProperties = transitionEnabled.value
    ? {}
    : { transition: 'none' }

  const state = dragState.value
  if (!state)
    return baseStyle

  const { fromIndex, toIndex, deltaY, pitch } = state

  if (index === fromIndex) {
    return {
      transform: `translateY(${deltaY}px)`,
      transition: 'none',
      zIndex: 1,
    }
  }

  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    return { ...baseStyle, transform: `translateY(${-pitch}px)` }
  }

  if (toIndex < fromIndex && index >= toIndex && index < fromIndex) {
    return { ...baseStyle, transform: `translateY(${pitch}px)` }
  }

  return baseStyle
}

// order 由 jitter 亂數產生，須避免 SSR 與 client 內容不一致
onMounted(() => resetList())
</script>

<style scoped lang="sass">
.item
  touch-action: none
  transition: transform 0.2s
</style>
