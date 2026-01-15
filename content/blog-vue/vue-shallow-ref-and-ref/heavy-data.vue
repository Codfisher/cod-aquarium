<template>
  <div class="flex gap-2">
    <div class="flex-1">
      <div>
        data: {{ data.cod.length }}
      </div>
      <button
        class="bg-gray-400/50! duration-100 p-1! px-3! rounded! active:bg-gray-400/80!"
        @click="updateData"
      >
        更新資料
      </button>
    </div>

    <div class="flex-1">
      <div>
        shallowData: {{ shallowData.cod.length }}
      </div>
      <button
        class="bg-gray-400/50! duration-100 p-1! px-3! rounded! active:bg-gray-400/80!"
        @click="updateShallowData"
      >
        更新資料
      </button>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, shallowRef, triggerRef, watch } from 'vue'

/** 建立一個 10 個 key，每個 value 矩陣長度 1000 的大型物件 */
function createData() {
  const data = {
    cod: [],
  }

  for (let i = 0; i < 10; i++) {
    const key = crypto.randomUUID()
    data[key] = Array.from({ length: 1000 }).fill('fish')
  }

  return data
}

/** 使用 ref 包裝的資料 */
const data = ref(createData())
watch(data, () => {
  console.log('[watch] data')
}, { deep: true })

async function updateData() {
  console.time('updateData')
  data.value.cod.push('fish')
  await nextTick()
  console.timeEnd('updateData')
}

/** 使用 shallowRef 包裝的資料 */
const shallowData = shallowRef(createData())
watch(shallowData, () => {
  console.log('[watch] shallowData')
}, { deep: true })

async function updateShallowData() {
  console.time('updateShallowData')
  shallowData.value.cod.push('fish')
  triggerRef(shallowData)
  await nextTick()
  console.timeEnd('updateShallowData')
}
</script>
