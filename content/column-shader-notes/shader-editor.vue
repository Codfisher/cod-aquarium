<template>
  <div class="shader-editor not-prose">
    <geometry-editor
      v-if="geometryState"
      v-model="geometryState"
    />

    <shader-playground
      v-bind="playgroundProps"
      :geometry="geometryState"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { GeometryConfig } from './shader-intro/use-webgl'
import type { ShaderPreset } from './shader-intro/shader-preset'
import GeometryEditor from './geometry-editor.vue'
import ShaderPlayground from './shader-playground.vue'

interface Props {
  initialCode?: string;
  vertexCode?: string;
  showVertexEditor?: boolean;
  presetList?: ShaderPreset[];
  height?: string;
  geometry?: GeometryConfig;
}

const props = defineProps<Props>()

/** 內部管理 geometry 狀態的響應式副本 */
const geometryState = ref(
  props.geometry
    ? structuredClone(props.geometry)
    : undefined,
)

watch(() => props.geometry, (newGeometry) => {
  if (newGeometry) {
    geometryState.value = structuredClone(newGeometry)
  }
})

/** 傳遞給 ShaderPlayground 的 props（排除 geometry） */
const playgroundProps = computed(() => ({
  initialCode: props.initialCode,
  vertexCode: props.vertexCode,
  showVertexEditor: props.showVertexEditor,
  presetList: props.presetList,
  height: props.height,
}))
</script>

<style scoped>
.shader-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
