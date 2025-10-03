<template>
  <div class="p-2 flex flex-col gap-4 ">
    <textarea
      v-model="text"
      class="w-full h-full p-2 border rounded resize-none"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'

const text = ref('')
</script>

<style scoped lang="sass">
</style>
