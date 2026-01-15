<template>
  <div
    ref="exRef"
    class="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100"
  >
    <div class="p-8 flex flex-col items-center space-y-6">
      <span class="px-5 py-2 text-xs font-semibold bg-blue-100 text-blue-700 rounded-md">
        Ref
      </span>

      <div class="text-xs  uppercase tracking-wider mb-1">
        耗時
      </div>
      <div class="text-3xl font-mono font-bold ">
        {{ dataCost }} <span class="text-sm font-normal">ms</span>
      </div>
    </div>

    <div class="p-8 flex flex-col items-center space-y-6 bg-gray-50/50">
      <span class="px-5 py-2 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-md">
        Shallow Ref
      </span>

      <div class="text-xs  uppercase tracking-wider mb-1">
        耗時
      </div>
      <div class="text-3xl font-mono font-bold ">
        {{ shallowDataCost }} <span class="text-sm font-normal">ms</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useIntersectionObserver, useRafFn } from '@vueuse/core'
import { ref, shallowRef, triggerRef, useTemplateRef } from 'vue'

// 建立 1 萬筆資料
function createData() {
  return {
    list: Array.from({ length: 10000 }).map((_, i) => ({ id: i, val: 0 })),
  }
}

const data = ref(createData())
const dataCost = ref('0.00')

function tortureDeep() {
  const start = performance.now()

  // 每一次 .val 讀取和寫入都會經過 Proxy 的攔截
  data.value.list.forEach((item) => {
    item.val++
  })

  const end = performance.now()
  dataCost.value = (end - start).toFixed(2)
}

const shallowData = shallowRef(createData())
const shallowDataCost = ref('0.00')

function tortureShallow() {
  const start = performance.now()

  // 操作 raw object，完全沒有 Proxy 介入，速度等同於原生 JS
  shallowData.value.list.forEach((item) => {
    item.val++
  })
  triggerRef(shallowData)

  const end = performance.now()
  shallowDataCost.value = (end - start).toFixed(2)
}

const exRef = useTemplateRef('exRef')

const ticker = useRafFn(() => {
  tortureShallow()
  tortureDeep()
}, {
  fpsLimit: 5,
})

useIntersectionObserver(exRef, ([entry]) => {
  entry.isIntersecting ? ticker.resume() : ticker.pause()
})
</script>
