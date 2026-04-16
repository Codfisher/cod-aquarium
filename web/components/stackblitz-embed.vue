<template>
  <div
    ref="containerRef"
    class="stackblitz-embed"
    :style="{ height: normalizedHeight }"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Project } from '@stackblitz/sdk';

interface Props {
  project: Project;
  openFile?: string;
  height?: number | string;
  view?: 'preview' | 'editor' | 'default';
}

const props = withDefaults(defineProps<Props>(), {
  openFile: 'src/App.vue',
  height: 500,
  view: 'preview',
});

/** 數字自動補 px，字串原樣使用（支援 vh、rem 等 CSS 單位） */
const normalizedHeight = computed(() =>
  typeof props.height === 'number'
    ? `${props.height}px`
    : props.height,
);

const containerRef = ref<HTMLElement>();

onMounted(async () => {
  if (!containerRef.value)
    return;

  const sdk = await import('@stackblitz/sdk');

  /** SDK 只接受 number，字串單位時改用 100% 撐滿已定高的容器 */
  const sdkHeight = typeof props.height === 'number'
    ? props.height
    : containerRef.value.clientHeight;

  sdk.default.embedProject(containerRef.value, props.project, {
    openFile: props.openFile,
    height: sdkHeight,
    view: props.view,
    forceEmbedLayout: true,
  });
});
</script>

<style scoped>
.stackblitz-embed {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}
</style>
