<script setup lang="ts">
/**
 * 模擬像 Nuxt UI 的 UContextMenu 這類元件：
 * 當 items 改變時，內部結構會跟著變動（例如條件渲染、動態 slot），
 * 導致 Vue 的 diff 無法正確追蹤 default slot 的 DOM 位置，
 * 進而重建 slot 內容（包含 canvas）。
 *
 * 這裡透過在 slot 外層加上 :key 來模擬這個行為。
 */
import { ref } from 'vue'

const items = ref(['選項 A', '選項 B'])

let counter = 0

function updateItems() {
  counter++
  items.value = [
    `選項 A（更新 ${counter} 次）`,
    `選項 B（更新 ${counter} 次）`,
    ...(counter % 2 === 0 ? ['選項 C'] : []),
  ]
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <button
        class="px-3 py-1 rounded bg-primary text-white text-sm"
        @click="updateItems"
      >
        模擬右鍵選單更新
      </button>
      <span class="text-sm opacity-60">
        已更新 {{ counter }} 次
      </span>
    </div>

    <div class="text-sm opacity-60">
      目前選項：{{ items.join('、') }}
    </div>

    <!--
      重點：:key 綁定 items，模擬元件內部結構因 props 變化而重建。
      這和 Nuxt UI 的 UContextMenu 行為類似——
      當 items 結構改變時，內部的條件分支 / 動態 slot 數量跟著變，
      Vue 的 patch 會認為這是不同的子樹，整個 default slot 就被銷毀重建。
    -->
    <div :key="items.length">
      <slot :items="items" />
    </div>
  </div>
</template>
