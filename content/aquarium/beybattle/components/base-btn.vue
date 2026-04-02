<template>
  <button
    class="px-5 py-2 font-bold rounded-lg transition-all cursor-pointer min-h-11 active:scale-95 select-none"
    :class="colorClassMap[color ?? 'primary']"
    @click="emit('click')"
  >
    {{ label }}
  </button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  color?: 'primary' | 'error' | 'neutral';
}>()

const emit = defineEmits<{
  click: [];
}>()

const colorClassMap = {
  primary: 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30',
  error: 'bg-gray-600 hover:bg-gray-500 text-white',
  neutral: 'bg-white/20 hover:bg-white/30 text-white border border-white/30',
}
</script>
