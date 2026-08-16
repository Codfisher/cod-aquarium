<template>
  <figure class="compare-grid not-prose">
    <figcaption
      v-if="title"
      class="compare-title"
    >
      {{ title }}
    </figcaption>

    <div
      class="compare-body"
      :class="`compare-body--${columns}`"
    >
      <slot />
    </div>

    <p
      v-if="caption"
      class="compare-caption"
    >
      {{ caption }}
    </p>
  </figure>
</template>

<script setup lang="ts">
/**
 * 前後對比的兩欄版面
 *
 * 兩個 demo-frame 並排。窄畫面自動疊成上下，
 * 手機上兩欄各剩一百多像素寬的話什麼都看不出來
 */
withDefaults(defineProps<{
  title?: string;
  caption?: string;
  /** 並排幾欄，窄畫面一律疊成一欄 */
  columns?: 2 | 3;
}>(), {
  columns: 2,
})
</script>

<style scoped>
.compare-grid {
  margin: 1.5rem 0;
}

.compare-title {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.compare-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

@media (min-width: 640px) {
  .compare-body--2 {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 860px) {
  .compare-body--3 {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.compare-caption {
  margin-top: 0.6rem;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

:global(html.dark) .compare-title { color: #9ca3af; }
:global(html.dark) .compare-caption { color: #9ca3af; }
</style>
