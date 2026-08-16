<template>
  <label class="demo-slider">
    <span class="demo-slider-label">{{ label }}</span>
    <input
      class="demo-slider-input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      @input="onInput"
    >
    <span class="demo-slider-value">{{ displayValue }}</span>
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** 小數位數，只影響顯示 */
  digit?: number;
  /** 接在數值後面的單位 */
  unit?: string;
}>(), {
  min: 0,
  max: 1,
  step: 0.01,
  digit: 2,
  unit: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>()

const displayValue = computed(
  () => `${props.modelValue.toFixed(props.digit)}${props.unit}`,
)

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', Number(target.value))
}
</script>

<style scoped>
.demo-slider {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 13px;
  color: #6b7280;
}

.demo-slider-label {
  font-weight: 500;
}

.demo-slider-input {
  width: 130px;
  accent-color: #6366f1;
}

.demo-slider-value {
  min-width: 3.5em;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-size: 12px;
  color: #9ca3af;
}

:global(html.dark) .demo-slider { color: #9ca3af; }
:global(html.dark) .demo-slider-value { color: #6b7280; }
</style>
