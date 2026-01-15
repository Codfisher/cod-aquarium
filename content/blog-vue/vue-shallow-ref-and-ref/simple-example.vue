<script setup>
import { shallowRef } from 'vue'

const shallowData = shallowRef({ cod: [] })

async function updateShallowData() {
  shallowData.value.cod.push('fish')
}
</script>

<template>
  <div>
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
</template>
