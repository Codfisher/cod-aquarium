<template>
  <!-- SSR 與原站（vitepress-plugin-mermaid）相同，只輸出空的 div，圖表掛載後才繪製 -->
  <div
    class="mermaid"
    v-html="svg"
  />
</template>

<script setup lang="ts">
import { useData } from '#vp'
import { computed, onMounted, ref, useId, watch } from 'vue'

const props = defineProps<{
  /** encodeURIComponent 後的 mermaid 原始碼，由 site/plugins/markdown-it-mermaid.ts 產生 */
  graph: string;
}>()

const { isDark } = useData()

/** mermaid 會以此建立暫存元素，只能含合法的 id 字元 */
const diagramId = `mermaid-${useId().replace(/\W/g, '-')}`
const source = computed(() => decodeURIComponent(props.graph))

const svg = ref('')

/** mermaid 體積大，只在有圖表的頁面、掛載後才動態載入 */
async function renderDiagram() {
  const { default: mermaid } = await import('mermaid')

  mermaid.initialize({
    securityLevel: 'loose',
    startOnLoad: false,
    theme: isDark.value ? 'dark' : 'default',
  })
  const result = await mermaid.render(diagramId, source.value)
  svg.value = result.svg
}

onMounted(renderDiagram)
watch([isDark, source], renderDiagram)
</script>
