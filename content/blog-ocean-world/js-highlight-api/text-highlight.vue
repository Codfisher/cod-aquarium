<template>
  <div class="text-highlight w-full border rounded p-4">
    這段文字的鱈魚會被標記
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  const parentNode = document.querySelector('.text-highlight')
  if (!parentNode) {
    throw new Error('Cannot find .text-highlight element')
  }

  const textNode = parentNode.firstChild
  if (!textNode) {
    throw new Error('Cannot find text node')
  }

  const range = new Range()
  range.setStart(textNode, 6)
  range.setEnd(textNode, 8)

  const highlight = new Highlight(range)

  // @ts-expect-error TS 誤判
  CSS.highlights.set('my-custom-highlight', highlight)
})
</script>

<style lang="sass">
::highlight(my-custom-highlight)
  background-color: #ffeb3b
</style>
