<template>
  <picture>
    <template v-if="sourceVisible">
      <source
        :srcset="srcset"
        type="image/webp"
      >

      <source
        :src="lowSrc"
        type="image/webp"
      >
    </template>

    <img
      :src
      :alt
      loading="lazy"
      decoding="async"
      class="w-full"
    >
  </picture>
</template>

<script setup lang="ts">
import { join, map, pipe } from 'remeda'
import { computed } from 'vue'

interface Props {
  src: string;
  alt?: string;
}
const props = withDefaults(defineProps<Props>(), {
  alt: '圖片',
})

const srcset = computed(() => pipe(
  [1024, 700, 430, 160],
  map((size) => `${props.src.split('.')[0]}-${size}.webp ${size}w`),
  join(', '),
))

const lowSrc = computed(() => `${props.src.split('.')[0]}-low.webp 1200w`)

const sourceVisible = computed(() => {
  if (import.meta.env.DEV) {
    return false
  }

  return !props.src.includes('.gif')
})
</script>

<style scoped lang="sass">
</style>
