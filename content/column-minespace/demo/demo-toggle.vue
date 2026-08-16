<template>
  <button
    type="button"
    class="demo-toggle"
    :class="{ 'demo-toggle--on': modelValue }"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="demo-toggle-dot" />
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  label: string;
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>()
</script>

<style scoped>
.demo-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.demo-toggle:hover {
  border-color: #d1d5db;
}

.demo-toggle--on {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
}

.demo-toggle-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #d1d5db;
  transition: background 0.15s ease;
}

.demo-toggle--on .demo-toggle-dot {
  background: #6366f1;
}

:global(html.dark) .demo-toggle {
  border-color: #374151;
  background: rgba(31, 41, 55, 0.6);
  color: #9ca3af;
}

:global(html.dark) .demo-toggle--on {
  border-color: #818cf8;
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
}

:global(html.dark) .demo-toggle-dot { background: #4b5563; }
:global(html.dark) .demo-toggle--on .demo-toggle-dot { background: #818cf8; }
</style>
