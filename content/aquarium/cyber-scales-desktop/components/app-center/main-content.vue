<template>
  <div class="text p-4 flex items-start justify-start gap-2 ">
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
    icon: 'contact_support',
  },
]
</script>

<style scoped lang="sass">
</style>
