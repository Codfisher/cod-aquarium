<template>
  <img
    :src
    :alt
    loading="lazy"
    decoding="async"
  >
</template>

<script setup lang="ts">
interface Props {
  src: string;
  alt?: string;
}
const props = withDefaults(defineProps<Props>(), {
  alt: '圖片',
})
</script>

<style scoped lang="sass">
</style>
