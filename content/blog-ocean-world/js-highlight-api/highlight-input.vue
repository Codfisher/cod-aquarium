<template>
  <div class="w-full border rounded p-2">
    <div class="border rounded p-2 w-full">
      <input
        v-model="keyword"
        type="text"
        placeholder="輸入關鍵字標記文字"
        class="w-full"
      >
    </div>

    <div
      ref="textRef"
      class="flex flex-col items-center text-center gap-4 p-4"
    >
      <div class="text-lg font-bold">
        鱈魚 codlin
      </div>

      <div class="text-xl">
        ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
      </div>
      <a
        href="https://chillcomponent.codlin.me/"
        target="_blank"
      >
        酷酷的元件
      </a>

      <a
        href="mailto:hi@codlin.me"
        target="_blank"
      >
        hi@codlin.me
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useTextHighlight } from '../../../composables/use-text-highlight'

const textRef = useTemplateRef('textRef')
const keyword = defineModel({ default: '' })

useTextHighlight(keyword, {
  target: textRef,
})
</script>

<style scoped lang="sass">
</style>
