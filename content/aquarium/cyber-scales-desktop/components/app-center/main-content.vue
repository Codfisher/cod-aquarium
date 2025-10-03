<template>
  <div class="text p-4 flex flex-wrap items-start justify-start content-start gap-4 ">
    <base-item
      v-for="item, i in list"
      :key="i"
      v-bind="item"
      :delay="baseDelay + i * 100"
    />
  </div>
</template>

<script lang="ts" setup>
import BaseItem from '../base-item/base-item.vue'

const baseDelay = 600

const list = [
  {
    label: '記事本',
    icon: 'docs',
  },
]
</script>

<style scoped lang="sass">
</style>
