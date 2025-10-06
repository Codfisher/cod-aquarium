<template>
  <div class="p-2 flex flex-col gap-4 ">
    <textarea
      v-model="text"
      class="w-full flex-1 p-2 border rounded resize-none"
    />

    <div class="flex justify-end">
      <base-btn
        label="儲存"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import BaseBtn from '../base-btn/base-btn.vue'

const text = ref('')
</script>

<style scoped lang="sass">
</style>
