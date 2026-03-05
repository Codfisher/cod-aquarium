<template>
  <div
    v-if="show"
    class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white z-40 backdrop-blur-sm"
  >
    <h2 class="text-3xl font-bold mb-8 text-shadow-sm">
      遊戲暫停
    </h2>
    <div class="flex flex-col gap-4 w-64">
      <button
        class="px-4 py-3 bg-neutral-600 hover:bg-neutral-500 border-2 border-neutral-800 hover:border-neutral-400 font-bold transition-colors shadow-inner"
        @click="$emit('resume')"
      >
        回到遊戲
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean;
}>()

defineEmits<{
  resume: [];
}>()
</script>

<style scoped lang="sass">
</style>
