<template>
  <span
    class="material-symbols-sharp select-none"
    :style="style"
    role="img"
  >
    {{ name }}
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  name?: string;
  // variant?: 'outlined' | 'rounded' | 'sharp';
  fill?: boolean;
  weight?: string;
  grade?: string;
  opsz?: string;
  size?: string;
}

const props = withDefaults(defineProps<Props>(), {
  name: 'unknown_document',
  fill: false,
  weight: '400',
  grade: '0',
  opsz: '24',
  size: '14px',
})

const style = computed(() => {
  const fill = props.fill ? 1 : 0
  return {
    'font-variation-settings': [
      `'FILL' ${fill}`,
      `'wght' ${props.weight}`,
      `'GRAD' ${props.grade}`,
      `'opsz' ${props.opsz}`,
    ].join(', '),
    'font-size': props.size,
    'line-height': 1,
  }
})
</script>
