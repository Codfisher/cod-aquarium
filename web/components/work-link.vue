<template>
  <!-- vp-raw：連結底線與顏色由 scoped 樣式負責 -->
  <a
    :href="props.href"
    class="work-link vp-raw"
    :target="isExternal ? '_blank' : undefined"
    :rel="isExternal ? 'noopener' : undefined"
  >
    <!-- 浮水印：同一個 icon 放大、淡化後壓在右下角，只是裝飾 -->
    <u-icon
      :name="props.icon"
      class="watermark"
      aria-hidden="true"
    />
    <u-icon
      :name="props.icon"
      class="icon"
      aria-hidden="true"
    />
    <span class="label">{{ props.label }}</span>
    <u-icon
      name="i-ph:arrow-up-right"
      class="arrow"
      aria-hidden="true"
    />
  </a>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** 首頁作品區的外部連結按鈕（遊戲連結、原始碼、預設場景等），在 md 裡用 <div class="work-link-list"> 包起來排成一列 */
interface Props {
  href: string;
  label: string;
  /** Iconify 名稱，例如 i-ph:github-logo */
  icon: string;
}
const props = defineProps<Props>()

const isExternal = computed(() => /^https?:\/\//.test(props.href))
</script>

<style scoped>
.work-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  overflow: hidden;
  isolation: isolate;
  font-size: 15px;
  font-weight: 700;
  /* 內文連結有 text-decoration: underline !important 與 hover 換色（style.css、vp-doc.css），按鈕要壓過去 */
  color: var(--plate-ink) !important;
  text-decoration: none !important;
  background: color-mix(in oklch, var(--vp-c-brand-1) 4%, var(--vp-c-bg));
  border: 1px solid var(--plate-line);
  border-radius: 1rem;
  transition: border-color 0.25s, background-color 0.25s;
}

.watermark {
  position: absolute;
  right: -14px;
  bottom: -18px;
  z-index: -1;
  width: 72px;
  height: 72px;
  color: var(--plate-ink);
  opacity: 0.1;
  transform: rotate(-12deg);
  transition: opacity 0.35s, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.icon {
  flex: none;
  width: 20px;
  height: 20px;
}

.label {
  flex: 1;
  line-height: 1.4;
}

.arrow {
  flex: none;
  width: 16px;
  height: 16px;
  opacity: 0.6;
  transition: opacity 0.25s, transform 0.25s;
}

.work-link:hover,
.work-link:focus-visible {
  border-color: var(--plate-ink);
  background: color-mix(in oklch, var(--vp-c-brand-1) 9%, var(--vp-c-bg));
}

.work-link:hover .watermark,
.work-link:focus-visible .watermark {
  opacity: 0.18;
  transform: rotate(-4deg) scale(1.08);
}

.work-link:hover .arrow,
.work-link:focus-visible .arrow {
  opacity: 1;
  transform: translate(2px, -2px);
}

.work-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .work-link,
  .watermark,
  .arrow {
    transition: none;
  }
}
</style>
