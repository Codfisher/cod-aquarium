<template>
  <div class="geometry-editor not-prose">
    <div class="ge-header">
      <span class="ge-tag">EDIT</span>
      <span class="ge-title">頂點資料</span>
      <span class="ge-count">{{ vertexCount }} 個頂點</span>
    </div>

    <div class="ge-card-list">
      <div
        v-for="(_, vertexIndex) in vertexCount"
        :key="vertexIndex"
        class="ge-card"
        :style="{ '--c': getColor(vertexIndex), '--c-bg': getColorBg(vertexIndex) }"
      >
        <div class="ge-card-accent" />
        <div class="ge-card-body">
          <div class="ge-card-head">
            <span class="ge-card-label" :style="{ color: getColor(vertexIndex) }">
              頂點 {{ vertexIndex + 1 }}
            </span>
            <button
              v-if="vertexCount > 1"
              class="ge-card-remove"
              title="移除頂點"
              @click="removeVertex(vertexIndex)"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <!-- 每個 attribute 一行 -->
          <div
            v-for="attribute in geometry.attributeList"
            :key="attribute.name"
            class="ge-attr-row"
          >
            <span class="ge-attr-name">{{ attribute.name }}</span>
            <div class="ge-attr-fields">
              <label
                v-for="(label, fieldIndex) in getFieldLabelList(attribute)"
                :key="fieldIndex"
                class="ge-field"
              >
                <span class="ge-field-label">{{ label }}</span>
                <input
                  :value="getFieldValue(attribute, vertexIndex, fieldIndex)"
                  type="number"
                  step="0.1"
                  class="ge-input"
                  :style="{ '--focus-c': getColor(vertexIndex) }"
                  @input="setFieldValue(attribute, vertexIndex, fieldIndex, $event)"
                >
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button class="ge-add-btn" @click="addVertex">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
      新增頂點
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GeometryConfig, VertexAttribute } from './shader-intro/use-webgl'

interface Props {
  modelValue: GeometryConfig;
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: GeometryConfig];
}>()

const COLOR_LIST = [
  { main: '#d93025', bg: 'rgba(217, 48, 37, 0.08)' },
  { main: '#1e8e3e', bg: 'rgba(30, 142, 62, 0.08)' },
  { main: '#1a73e8', bg: 'rgba(26, 115, 232, 0.08)' },
  { main: '#e8710a', bg: 'rgba(232, 113, 10, 0.08)' },
  { main: '#9334e6', bg: 'rgba(147, 52, 230, 0.08)' },
  { main: '#0d906e', bg: 'rgba(13, 144, 110, 0.08)' },
]

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

function getColor(index: number): string {
  const item = COLOR_LIST[index % COLOR_LIST.length]
  return item?.main ?? '#888'
}

function getColorBg(index: number): string {
  const item = COLOR_LIST[index % COLOR_LIST.length]
  return item?.bg ?? 'transparent'
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
  if (Number.isNaN(value)) return

  const dataIndex = vertexIndex * attribute.size + fieldIndex
  const newAttributeList = geometry.value.attributeList.map((attr) => {
    if (attr.name !== attribute.name) return attr
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
  if (vertexCount.value <= 1) return

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
.geometry-editor {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-size: 13px;
}

.ge-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.ge-tag {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(232, 113, 10, 0.08);
  color: #e8710a;
}

.ge-title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.7;
}

.ge-count {
  font-size: 12px;
  opacity: 0.4;
  margin-left: auto;
}

/* 卡片列表 */
.ge-card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ge-card {
  display: flex;
  border-radius: 8px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  overflow: hidden;
  transition: border-color 0.2s, background 0.2s;
}

.ge-card:hover {
  border-color: var(--c);
  background: var(--c-bg);
}

.ge-card-accent {
  width: 3px;
  flex-shrink: 0;
  background: var(--c);
  opacity: 0.6;
  transition: opacity 0.2s;
}

.ge-card:hover .ge-card-accent {
  opacity: 1;
}

.ge-card-body {
  flex: 1;
  padding: 8px 12px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ge-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ge-card-label {
  font-size: 12px;
  font-weight: 600;
}

.ge-card-remove {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: currentColor;
  opacity: 0.25;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
}

.ge-card-remove:hover {
  opacity: 0.8;
  background: rgba(217, 48, 37, 0.08);
  color: #d93025;
}

/* Attribute 行 */
.ge-attr-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ge-attr-name {
  font-size: 12px;
  opacity: 0.4;
  min-width: 72px;
  flex-shrink: 0;
}

.ge-attr-fields {
  display: flex;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.ge-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.ge-field-label {
  font-size: 12px;
  opacity: 0.4;
  flex-shrink: 0;
}

.ge-input {
  width: 100%;
  min-width: 0;
  padding: 3px 6px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 5px;
  background: rgba(128, 128, 128, 0.04);
  color: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.ge-input:focus {
  border-color: var(--focus-c);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-c) 15%, transparent);
}

.ge-input::-webkit-inner-spin-button,
.ge-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.ge-input {
  -moz-appearance: textfield;
  appearance: textfield;
}

/* 新增按鈕 */
.ge-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  font-size: 12px;
  font-family: inherit;
  border: 1px dashed rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: transparent;
  color: currentColor;
  opacity: 0.35;
  cursor: pointer;
  transition: all 0.2s;
}

.ge-add-btn:hover {
  opacity: 0.7;
  border-color: rgba(128, 128, 128, 0.5);
  background: rgba(128, 128, 128, 0.04);
}

/* RWD */
@media (max-width: 480px) {
  .ge-attr-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .ge-attr-fields {
    width: 100%;
  }
}
</style>
