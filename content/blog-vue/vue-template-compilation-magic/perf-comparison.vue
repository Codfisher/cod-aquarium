<template>
  <div class=" flex flex-col gap-2 border border-gray-400/80 p-4 rounded">
    <div class="flex gap-2 text-base">
      <div
        :class="{ 'bg-primary': currentMode === 'template' }"
        class="  bg-gray-200/50 p-3 rounded cursor-pointer duration-300 flex-1"
        @click="currentMode = 'template'"
      >
        使用 Template
      </div>

      <div
        :class="{ 'bg-primary': currentMode === 'h' }"
        class="  bg-gray-200/50 p-3 rounded cursor-pointer duration-300 flex-1"
        @click="currentMode = 'h'"
      >
        使用 h()
      </div>
    </div>

    <div
      class="flex justify-center cursor-pointer border p-2 rounded duration-300"
      :class="{ ' border-dashed opacity-60': isStarted }"
      @click="isStarted = !isStarted"
    >
      {{ isStarted ? '停止' : '開始' }}
    </div>

    <div class="mt-2">
      更新耗時：<span>{{ timeCost }} ms</span>
    </div>

    <div class="h-0 overflow-hidden">
      <list-template
        v-if="currentMode === 'template'"
        :items="items"
      />
      <list-h
        v-else
        :items="items"
      />
    </div>
  </div>
</template>

<script setup>
import { useRafFn } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'
import ListH from './list-h.ts'
import ListTemplate from './list-template.vue'

const COUNT = 2000
const items = ref(Array.from({ length: COUNT }).fill(0).map((_, i) => ({ id: i, text: `Item ${i}` })))
const currentMode = ref('template')
const timeCost = ref(0)
const isStarted = ref(false)

async function runTest() {
  const newVal = `Updated ${Math.floor(Math.random() * 1000)}`
  const start = performance.now()

  items.value[COUNT - 1].text = newVal

  // 等待 DOM 更新完成
  await nextTick()

  const end = performance.now()
  timeCost.value = (end - start).toFixed(2)
}

const ticker = useRafFn(() => {
  runTest()
}, {
  immediate: false,
})

watch(isStarted, () => {
  isStarted.value ? ticker.resume() : ticker.pause()
})
</script>

<style></style>
