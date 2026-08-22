<template>
  <figure class="figure-frame not-prose">
    <figcaption
      v-if="title"
      class="figure-title"
    >
      {{ title }}
    </figcaption>

    <!--
      圖本身交給呼叫端塞進來

      這裡只負責外框、標題與說明，讓十九章的圖解長得一樣。
      內容一律是內嵌 SVG，不走外部檔案：這些圖都很小，
      而且要跟著文字一起改，拆成檔案只會讓兩邊各說各話
    -->
    <div class="figure-stage">
      <slot />
    </div>

    <p
      v-if="caption"
      class="figure-caption"
    >
      {{ caption }}
    </p>
  </figure>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  caption?: string;
}>()
</script>

<style scoped>
.figure-frame {
  margin: 1.5rem 0;
}

.figure-title {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.figure-stage {
  padding: 0.75rem 1rem;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
  border: 1px solid #e5e7eb;
}

/**
 * 圖一律撐滿寬度、依比例縮高
 *
 * 每張圖各自宣告 viewBox，這裡不管內容有多大，
 * 窄畫面上也不會被切掉
 */
.figure-stage :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.figure-caption {
  margin-top: 0.6rem;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

.dark .figure-stage {
  background: linear-gradient(135deg, #1b1f27 0%, #161a21 100%);
  border-color: #2f3540;
}

.dark .figure-title,
.dark .figure-caption {
  color: #9ca3af;
}
</style>
