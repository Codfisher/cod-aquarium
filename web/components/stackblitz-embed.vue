<template>
  <div
    ref="containerRef"
    class="stackblitz-embed"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Project } from '@stackblitz/sdk';

interface Props {
  project: Project;
  openFile?: string;
  height?: number;
  view?: 'preview' | 'editor' | 'default';
}

const props = withDefaults(defineProps<Props>(), {
  openFile: 'src/App.vue',
  height: 500,
  view: 'preview',
});

const containerRef = ref<HTMLElement>();

onMounted(async () => {
  if (!containerRef.value)
    return;

  const sdk = await import('@stackblitz/sdk');
  sdk.default.embedProject(containerRef.value, props.project, {
    openFile: props.openFile,
    height: props.height,
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
