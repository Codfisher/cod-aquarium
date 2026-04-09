<template>
  <div class="not-prose font-mono">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-1">
      <div
        v-for="(_, vertexIndex) in vertexCount"
        :key="vertexIndex"
        class="group flex flex-col gap-1 rounded-md border-2 border-gray-400/60 p-1.5 transition-colors hover:border-gray-500/60 "
      >
        <!-- 編號 + 刪除 -->
        <div class="flex items-center justify-between">
          <span class="text-xs font-black opacity-30">#{{ vertexIndex + 1 }}</span>
          <button
            v-if="vertexCount > 1"
            class="flex size-4 cursor-pointer items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-30 hover:opacity-80! hover:bg-red-500/10 hover:text-red-600"
            @click="removeVertex(vertexIndex)"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
            >
              <path
                d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>

        <!-- 每個 attribute 的欄位 -->
        <div
          v-for="attribute in geometry.attributeList"
          :key="attribute.name"
          class="flex items-center gap-1.5"
        >
          <span
            v-if="geometry.attributeList.length > 1"
            class="shrink-0 text-xs opacity-60"
          >
            {{ formatAttrName(attribute.name) }}
          </span>

          <div class="flex min-w-0 flex-1 gap-1">
            <label
              v-for="(label, fieldIndex) in getFieldLabelList(attribute)"
              :key="fieldIndex"
              class="ge-field flex min-w-0 flex-1 gap-1 items-center overflow-hidden rounded border border-gray-300/40 transition-colors focus-within:border-gray-400/60 dark:border-gray-600/30 dark:focus-within:border-gray-500/60"
            >
              <span class="pointer-events-none shrink-0 select-none pl-1.5 text-xs opacity-35">{{ label }}
              </span>

              <input
                :value="getFieldValue(attribute, vertexIndex, fieldIndex)"
                type="number"
                step="0.1"
                class="ge-field-input w-full min-w-0 border-none bg-transparent px-1 py-0.5 text-[13px] font-mono text-inherit outline-none"
                @input="setFieldValue(attribute, vertexIndex, fieldIndex, $event)"
              >
            </label>
          </div>
        </div>
      </div>

      <!-- 新增按鈕 -->
      <button
        class="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-gray-300/30 bg-transparent p-1.5 opacity-25 transition-opacity hover:opacity-50 dark:border-gray-600/30"
        @click="addVertex"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
        >
          <path
            d="M7 3V11M3 7H11"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GeometryConfig, VertexAttribute } from './shader-intro/use-webgl'
import { computed } from 'vue'

interface Props {
  modelValue: GeometryConfig;
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: GeometryConfig];
}>()

const COMPONENT_LABEL_MAP: Record<number, string[]> = {
  1: [''],
  2: ['x', 'y'],
  3: ['x', 'y', 'z'],
  4: ['x', 'y', 'z', 'w'],
}

const COLOR_LABEL_MAP: Record<number, string[]> = {
  3: ['r', 'g', 'b'],
  4: ['r', 'g', 'b', 'a'],
}

const geometry = computed(() => props.modelValue)
const vertexCount = computed(() => geometry.value.vertexCount)

function formatAttrName(name: string): string {
  return name.replace(/^a_/, '')
}

function getFieldLabelList(attribute: VertexAttribute): string[] {
  if (attribute.name.includes('color')) {
    return COLOR_LABEL_MAP[attribute.size] ?? COMPONENT_LABEL_MAP[attribute.size] ?? []
  }
  return COMPONENT_LABEL_MAP[attribute.size] ?? []
}

function getFieldValue(attribute: VertexAttribute, vertexIndex: number, fieldIndex: number): number {
  return attribute.data[vertexIndex * attribute.size + fieldIndex] ?? 0
}

function setFieldValue(attribute: VertexAttribute, vertexIndex: number, fieldIndex: number, event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number.parseFloat(input.value)
  if (Number.isNaN(value))
    return

  const dataIndex = vertexIndex * attribute.size + fieldIndex
  const newAttributeList = geometry.value.attributeList.map((attr) => {
    if (attr.name !== attribute.name)
      return attr
    const newData = [...attr.data]
    newData[dataIndex] = value
    return { ...attr, data: newData }
  })

  emit('update:modelValue', {
    ...geometry.value,
    attributeList: newAttributeList,
  })
}

function addVertex() {
  const newAttributeList = geometry.value.attributeList.map((attr) => ({
    ...attr,
    data: [...attr.data, ...Array.from<number>({ length: attr.size }).fill(0)],
  }))

  emit('update:modelValue', {
    ...geometry.value,
    attributeList: newAttributeList,
    vertexCount: vertexCount.value + 1,
  })
}

function removeVertex(vertexIndex: number) {
  if (vertexCount.value <= 1)
    return

  const newAttributeList = geometry.value.attributeList.map((attr) => {
    const newData = [...attr.data]
    newData.splice(vertexIndex * attr.size, attr.size)
    return { ...attr, data: newData }
  })

  emit('update:modelValue', {
    ...geometry.value,
    attributeList: newAttributeList,
    vertexCount: vertexCount.value - 1,
  })
}
</script>

<style scoped>
/* number input spinner 隱藏 — tailwind 無法處理 */
.ge-field-input::-webkit-inner-spin-button,
.ge-field-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.ge-field-input {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
